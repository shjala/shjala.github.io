---
layout: post
title: Building for chaos - Self-Healing TPM State
date: 2026-02-05
author: Shahriyar Jalayeri
comments: true
categories: [tpm]
---

**TL;DR:** *Power failures during TPM operations can leave edge devices in an inconsistent state – secure but unusable. This blog post dives into how EVE OS proactively solves this, ensuring reliable self-recovery without compromising security.*

[EVE OS](https://lfedge.org/projects/eve/) is commonly deployed in environments where reliability of the environment is not guaranteed. We're talking factories with frequent power losses, remote sites with spotty connectivity, edge deployments where someone might literally unplug the wrong cable. In these scenarios, it needs to survive chaos.

In this post, I’ll walk through a specific engineering challenge: handling non-atomic TPM related operations. The TPM (Trusted Platform Module) requires a sequence of commands to perform tasks, and a power failure mid-sequence can corrupt the system state, leading to a device that is secure, but effectively "bricked."

## PCR policy updates and the atomicity problem

EVE OS gives users the ability to configure which PCRs are used when sealing the vault key (user data encryption key). This allows them to choose between operational flexibility and security. Want to allow firmware updates without manual intervention? Don't seal to firmware PCRs. Need maximum security? Seal to all PCRs including firmware and bootloader measurements.

When the system receives a new PCR policy, it needs to perform two distinct operations:

1. Persist the new policy to disk (so the next boot knows how to unseal the encryption key)
2. Reseal the vault key in the TPM under this new policy

We make the disk write reliable using the common write-rename pattern (write to temp file, fsync, rename). However, the overall operation is not atomic. If power is lost after the disk write but before the TPM reseal, the system enters an inconsistent state.

On the next boot, EVE reads the new policy from the disk, but the vault key in the TPM is still locked under the old policy. The system doesn't know how to unseal the encryption key, even though the system state is secure and trustworthy. The device isn't compromised, but it’s non-functional. A "fail-safe" that fails the user in an environment where physical access is expensive.

We considered several approaches to solve this. One option would be a two-phase commit, but instead of a complex two-phase commit (which the TPM doesn't natively support for these operations) we treat the disk policy as a hint with discovery as the primary mechanism.

### Self-healing through policy discovery

To solve this, we decided to do what the TPM does: figure out the correct policy even if the "hint" (the persisted policy on disk) is incorrect. On a standard system, there are 14 (out of 24) [^1] commonly used PCR indices. To find the right combination, we systematically check all  $2^{14}$ (16,384) possible subsets. Doing this through the actual TPM is excruciatingly slow due to hardware bus speeds and anti-hammering rate-limiting. In an edge deployment, you would likely miss your boot (or update) timeout window and trigger an unnecessary system reboot or rollback. However, we can perform this brute force in user mode (software) by mimicking the TPM’s internal logic.

The TPM is designed so that no matter how complex a policy is, it always hashes down to a fixed-size authorization digest. Crucially, this digest is public information, it is stored as part of the public metadata of the TPM object (the encryption key).

By pulling the expected digest from the TPM and calculating potential digests in software, we can find the "winning" PCR combination in milliseconds.

The formula for the PolicyPCR digest is:

$$policyDigest_{new} := H_{policyAlg}(policyDigest_{old} || TPM\_CC\_PolicyPCR || pcrs || digestTPM)$$

Where:
- $policyDigest_{old}$: The current policy digest (zero if object is not using multiple policies, or PolicyPCR is the first policy)
- $TPM\_CC\_PolicyPCR$: The command code for PolicyPCR (0x0000017F)
- $pcrs$: The TPML_PCR_SELECTION structure indicating which PCRs are selected.
- $digestTPM$: The hash of the values of the selected PCRs


### The Implementation (Go)

```
func computePolicyPCRAuthDigest(pcrValues map[int][]byte, pcrIndices []int) ([]byte, error) {
	// Prepare "digestTPM", this is the hash of the concatenation of all selected PCR values.
	sortedIndices := make([]int, len(pcrIndices))
	copy(sortedIndices, pcrIndices)
	sort.Ints(sortedIndices)
	pcrValueHash := sha256.New()
	for _, idx := range sortedIndices {
		val, ok := pcrValues[idx]
		if !ok {
			return nil, fmt.Errorf("missing PCR value for index %d", idx)
		}
		pcrValueHash.Write(val)
	}
	pcrsDigest := pcrValueHash.Sum(nil)
	digestTPM := new(bytes.Buffer)
	digestTPM.Write(pcrsDigest)

	// Prepare "pcrs" (TPML_PCR_SELECTION), This structure describes the PCR selection.
	// We set the size of select bitmap to 3 bytes, which covers PCRs 0-23.
	sizeOfSelect := uint8(3)
	pcrs := new(bytes.Buffer)
	// TPML_PCR_SELECTION.Count: Number of selection structures (1 since we select only SHA256)
	binary.Write(pcrs, binary.BigEndian, uint32(1))
	// TPMS_PCR_SELECTION.HashAlg: The hash algorithm of the PCR bank
	binary.Write(pcrs, binary.BigEndian, uint16(tpm2.AlgSHA256))
	// TPMS_PCR_SELECTION.SizeOfSelect: Size of the bitmap in bytes
	binary.Write(pcrs, binary.BigEndian, sizeOfSelect)

	// The bitmap indicates which PCRs are active, e.g. for PCR 0, bit 0 of byte 0 is set.
	bitmap := make([]byte, sizeOfSelect)
	for _, pcr := range sortedIndices {
		bytePos := pcr / 8
		// This should never happen, just in case
		if int(bytePos) >= int(sizeOfSelect) {
			return nil, fmt.Errorf("PCR index %d out of range for selection size %d", pcr, sizeOfSelect)
		}
		bitPos := pcr % 8
		bitmap[bytePos] |= (1 << bitPos)
	}
	pcrs.Write(bitmap)

	// for simplicity this assumes TPM2_PolicyPCR is the first (and only) policy
	// in the policy session, so the old policy digest is set to zero.
	// This should be adjusted when there are multiple policies.
	oldPolicyDigest := make([]byte, sha256.Size)

	// Final calculation : Hash( oldPolicyDigest || TPM_CC_PolicyPCR || pcrs || digestTPM )
	h := sha256.New()
	h.Write(oldPolicyDigest)
	binary.Write(h, binary.BigEndian, uint32(TPM_CC_PolicyPCR))
	h.Write(pcrs.Bytes())
	h.Write(digestTPM.Bytes())

	return h.Sum(nil), nil
}
```

Once the correct policy is found, we simply unseal the encryption key and persist the policy to disk.

### Closing the Loop

On a typical system, searching all $2^{14}$ combinations takes under a second in user mode (benchmarking 5 consecutive policy discoveries on a typical x86 hardware took 163.1 ms ± 0.3 ms), compared to several minutes via the TPM.

Is this a security risk? No. This doesn't weaken the cryptographic binding, an attacker still needs the system state to be in the exact measured state. We're discovering which PCRs are in the policy, not bypassing the requirement that those PCRs must match. The policy digest is already public information stored in the TPM object metadata; we're simply using it to reconstruct the configuration, not breaking any secrets.

If EVE boots and finds a mismatch, it triggers this recovery path. Once the correct PCR combination is identified and the vault is successfully unsealed, EVE automatically updates the disk state to match the TPM. The system has effectively healed its own metadata inconsistency, ensuring that the next reboot is fast, seamless, and most importantly, reliable.


[^1]: PCRs 0-13 cover firmware, bootloader, and OS components. We exclude PCRs 15 (reserved), 16 (debug), and 17-23 (vendor-specific/dynamic) from the search space.

---

\[1\]  TCG Trusted Attestation Protocol (TAP) Information Model for TPM Families 1.2 and 2.0 and DICE Family 1.0, section 4.4 "Attestation of TPM 2.0 Signing Key used for Implicit Attestation".

\[2\] TPM 2.0, David Wooten - Microsoft Corp, Section "Authorization".