---
layout: post
title: dTPM is dead
date: 2025-09-10
author: Shahriyar Jalayeri
comments: true
categories: [tpm]
---

The discrete TPMs (dTPM)  have had a rough ride over the past few decades. They’ve faced numerous bugs, some fixable, others built right into the way it works. Because dTPMs are physically exposed, they’ve always been an interesting target to attack, and in most scenarios when high value devices have to operate autonomously and unsupervised, **dTPM provides little to no practical security**.

The biggest threat to dTPMs is the *reset attack*. It’s devastating because it can take down the whole chain of trust that a TPM is supposed to protect. This is especially a problem in situations where prolonged physical access to your device, or unstable network connection is part of the threat model. Sound familiar? That’s exactly the kind of setup you see in **Edge Computing**.

In the rest of this post, I’ll dig into the reset attack. I’ll also take a look at the “shiny” reset protection that the Linux kernel recently added, and why it is absolutely useless.

# dTPM under attack

The two most well-known attacks against dTPMs are bus sniffing and reset attacks. Bus sniffing has gotten some attention because Microsoft relies on it for password-less disk encryption with BitLocker. The attack itself is simple and very cheap to carry out and at same time easy to mitigate. If you want to dive deeper, you can read more about it \[5\]\[6\]\[7\]\[8\], or see it in action \[9\], although I will give a brief overview in the next section.

## Bus sniffing Attack

To better understand how bus sniffing attacks can be protected, we must look at how TPM protects secrets. The most common way to protect sensitive data in a TPM is through sealing. Sealing means encrypting the data with a cryptographic key that only the TPM can access.

Take disk encryption as an example, the BitLocker disk encryption key is sealed to the TPM to be protected (sometimes the key is stored directly inside the TPM’s small non-volatile memory, or it might be stored on the disk in an encrypted form and then loaded into the TPM when needed). When you want to access the protected data, the TPM performs unsealing. Essentially, unsealing is the TPM decrypting the data and handing it back so the system can use it.

Sealing and unsealing provide security by attaching policies to the protected resource. In the simplest case, you can attach a password policy to a disk encryption key. This means the TPM will only reveal (unseal) the key if the correct password is provided. This is essentially how BitLocker’s PIN works; without the right PIN, the TPM won’t release the disk encryption key.

But just asking for a PIN at boot isn’t very exciting, it’s basically just prompting for the disk encryption key. Luckily, TPMs support more advanced policies, and some of them are quite powerful. One of the most common patterns is sealing a resource with a PCR policy.

I won’t go deep into the details of what is a PCR policy and how it relates to measured boot, and remote attestation (maybe in another post), but at a high level, a TPM can create a cryptographic snapshot of your system state (things like firmware code and version, bootloader, root filesystem, boot configuration, and so on) when the system is in a safe, “trusted” state. The TPM can then repeat this snapshotting process at every boot, calculate the current system state, put it in a set of hardware registers called PCR, and only release the protected resource, like a disk encryption key, if the system state matches the trusted snapshot (Current PCRs == PCRs at the Trusted State )[^1].

This makes booting up seamless. As long as nothing has changed, no backdoored firmware, no disabled secure boot, no bootkits, the TPM will release the disk encryption key automatically, and your system starts without any extra prompts.

In a bus sniffing attack, the attacker is basically reading the plain text data when TPM has unsealed the disk encryption key and it is presenting it to the system for use. TPM commands are easy to fingerprint, so it is easy to follow the sequence of commands and grab exactly what you want.

With all that said, bus sniffing attacks can actually be mitigated using mechanisms already built into the TPM 2.0 specification. The key tool here is an authenticated session with parameter encryption. In simple terms, this encrypts the communication between the system and the TPM using a pre-shared key. There are some limitations, but it’s enough to protect critical commands like `TPM_Unseal`.

The easiest way to set this up is by creating a salted session using an existing TPM key. Once parameter encryption is in place, sniffing the bus becomes useless, the data is encrypted, and an attacker can’t extract anything meaningful. And if you’re thinking, “What if someone disables parameter encryption and changes how the OS talks to the TPM?” that would actually modify the system state. Because the system state no longer matches the trusted snapshot, the TPM simply won’t release the key, and the unsealing fails, so there is nothing to sniff.

## TPM Reset Attack

The TPM reset attack is far more interesting, and much harder to defend than bus sniffing. With this attack, an attacker doesn’t need to eavesdrop on communication at all. Instead, they can directly interact with the TPM and essentially trick it into thinking the system is in a trusted state, even when it isn’t. If successful, the TPM will release the protected resource, like a disk encryption key, without any need for sniffing or other indirect methods.

The attack works like this: the attacker first boots the system into an untrusted state (one where the TPM normally wouldn’t release the protected resource). Then, they perform a TPM reset attack, resetting the PCR registers to their default values, usually zero. From this blank state, the attacker can manipulate the PCR values to match the trusted state that the TPM expects. Once the TPM “sees” the expected values, it unseals the resource, completely bypassing the protections that were supposed to keep it safe.

This attack first performed by Bernhard\[1\] in 2004, which they managed to physically connect the LRESET\# pin to ground and were able to perform a reset on only the TPM chip, then reinitializing the chip by sending a TPMStartup(TPM\_CLEAR) form the OS and ending up with PCRs in blank state.

This attack resurfaced again in a form of a software attack (significantly cheaper to implement), when Han, Seunghun, et al. \[2\] managed to reset the TPM by putting the system into L3 sleep, and cutting the power from all peripherals including the TPM (with DRAM being the exception).

### Can the Linux kernel save me?

Linux kernel has added a new security feature that became the default for x86 platforms in kernel versions starting with 6.10. If you did not manage to survive reading the cryptic document\[11\] explaining the new feature, then worry no more, I’ll try to simply explain it.

If `CONFIG_TCG_TPM2_HMAC` is enabled, kernel will create a specific ECC key in TPM under the Null Hierarchy and exports the name of the key (key name in TPM lingo means hash of the public area of the key) to the userspace via `/sys/class/tpm/tpm0/null_name` .

A TPM has multiple hierarchies, each with different levels of access and protection. What really matters here is the Null Hierarchy. Anything created under the null hierarchy doesn’t survive a TPM reset, in addition, the null hierarchy doesn’t have extra safeguards like platform passwords, so the kernel can operate under null hierarchy without depending on a user or platform secret. You can think of null hierarchy like an in-memory-only data store inside the TPM.

TPM uses seeds to create cryptographic keys, for example TPM Endorsement Key is created using a static but unique per-TPM seed, so EK can be used as a form of device identity because it won’t change even if you reset or clear the TPM. In contast to other TPM hierarchies, the null hierarchy’s seed is ephemeral, meaning it will change to different value whenever TPM is reset or restarted (TPM Reset != TPM Restart, yes they are different, but I won’t get into the details), and this is the basis of the new TPM reset attack “mitigation” in kernel, by exporting the key created under the null hierarchy kernel gives userspace a way to detect TPM resets.

This reset detection process starts by first creating the same ECC key under null hierarchy in userspace and comparing its name to the kernel exposed name. This special ECC key is created with no uniqueness parameters, so if there was no TPM reset after kernel booted up (meaning null hierarchy's seed didn't change), we should end up with the exact same key in userspace.

Kernel creates this key with a function called [tpm2\_create\_primary](https://github.com/torvalds/linux/blob/9dd1835ecda5b96ac88c166f4a87386f3e727bd9/drivers/char/tpm/tpm2-sessions.c#L384), which is awfully confusing because this is the name of generic TPM command that can create TPM keys with arbitrary template, but this function has hardcoded template. Anyways lets take a look at how the null primary key is created:

```c
  static int tpm2_create_primary(struct tpm_chip *chip, u32 hierarchy,
			       u32 *handle, u8 *name)
  {
	int rc;
	struct tpm_buf buf;
	struct tpm_buf template;

	rc = tpm_buf_init(&buf, TPM2_ST_SESSIONS, TPM2_CC_CREATE_PRIMARY);
	if (rc)
		return rc;

	[...]

	/* key type */
	tpm_buf_append_u16(&template, TPM_ALG_ECC);

	/* name algorithm */
	tpm_buf_append_u16(&template, TPM_ALG_SHA256);

	/* object properties */
	tpm_buf_append_u32(&template, TPM2_OA_NULL_KEY);

	/* sauth policy (empty) */
	tpm_buf_append_u16(&template, 0);

	/* BEGIN parameters: key specific; for ECC*/

	/* symmetric algorithm */
	tpm_buf_append_u16(&template, TPM_ALG_AES);

	/* bits for symmetric algorithm */
	tpm_buf_append_u16(&template, AES_KEY_BITS);

	/* algorithm mode (must be CFB) */
	tpm_buf_append_u16(&template, TPM_ALG_CFB);

	/* scheme (NULL means any scheme) */
	tpm_buf_append_u16(&template, TPM_ALG_NULL);

	/* ECC Curve ID */
	tpm_buf_append_u16(&template, TPM2_ECC_NIST_P256);

	/* KDF Scheme */
	tpm_buf_append_u16(&template, TPM_ALG_NULL);

	/* unique: key specific; for ECC it is two zero size points */
	tpm_buf_append_u16(&template, 0);
	tpm_buf_append_u16(&template, 0);
  [...]
```

The above code translates to the following `tpm2_createprimary`[12] command:

```
tpm2 createprimary \
  -C n \
  -g sha256 \
  -G ecc256:null:aes128cfb \
  -a 'decrypt|restricted|fixedtpm|fixedparent|sensitivedataorigin|userwithauth|noda' \
  -c primary.ctx
```

And running this on a device, if no TPM reset attack has happened, indeed we end up with the same key:

```shell
linuxkit-525400123456:/home$ tpm2 createprimary \
>   -C n \
>   -g sha256 \
>   -G ecc256:null:aes128cfb \
>   -a 'decrypt|restricted|fixedtpm|fixedparent|sensitivedataorigin|userwithauth|noda' \
>   -c primary.ctx > /dev/null
linuxkit-525400123456:/home$ tpm2 readpublic -c primary.ctx | awk '/^name:/ {print $2}'
000becc8e62d375b4d73e1bd81b9fd7fdd793918f63b080a9161b584a7ae44d34339
linuxkit-525400123456:/home$ cat /sys/class/tpm/tpm0/null_name
000becc8e62d375b4d73e1bd81b9fd7fdd793918f63b080a9161b584a7ae44d34339
```

As the second step in the validation process, to make sure the TPM isn’t just replaying a stale or fake state, it’s recommended to certify this key. If the TPM hasn’t been reset after the kernel has booted, this certification step should also succeed. In practice you should include a random nonce received from a remote verifier and use a key trusted by a remote verifier like Attestation Key to certify the null primary. Trusting a signing/certification key itself requires a complex process involving EK, credential activation and AK (maybe for another post).

But as I mentioned before this mitigation is completely useless because an attacker can simply reset the TPM right before the kernel boots up. If the attacker's goal is to get access to locally stored TPM secrets that "mitigation" will not come into play at all.

Even if you have to prove the system state to a remote verifier to gain access to some remote resources, you are better off sending a signed TPMS\_TIME\_INFO which includes the TPM restart counter (counted by the TPM and can’t be forged), or protect locally stored sensitive resources use a PolicyCounterTimer\[10\] with restart counter expected to be equal to zero. But unfortuanly this fragile policies will only help if a TPM restart happens, because a TPM reset will set all these extra values to zero too.

## Is there any hope?

fTPMs are promising, even though they are susceptible to side channel attacks\[3\]\[4\] and software bugs, but I think in general it is much cheaper to push a firmware update to a remote device than replacing a soldered dTPM.

For edge computing scenarios where physical access is a primary concern, tamper-evident enclosures offer an alternative approach, detecting rather than preventing physical attacks. These solutions can trigger key deletion when tampering is detected, but they add significant cost and complexity while introducing new failure modes.

To be clear, I'm not advocating for abandoning hardware security modules entirely or relying solely on software cryptography. Rather, it may be time to move beyond retrofitting general-purpose security solutions and start developing purpose-built hardware security architectures specifically designed for edge computing threat models.

Ultimately, the fundamental problem remains, any security model that relies solely on local hardware protection in unsupervised environments is fighting a losing battle against determined adversaries.

---

References:

\[1\] Kauer, Bernhard. "Oslo: improving the security of trusted computing." USENIX Security Symposium. Vol. 24\. 2007\.

\[2\] Han, Seunghun, et al. "A bad dream: Subverting trusted platform module while you are sleeping." 27th USENIX Security Symposium (USENIX Security 18). 2018\.

\[3\] Moghimi, Daniel, et al. "{TPM-FAIL}:{TPM} meets timing and lattice attacks." 29th USENIX Security Symposium (USENIX Security 20). 2020\.

\[4\] Jacob, Hans Niklas, et al. "faulTPM: Exposing AMD fTPMs’ Deepest Secrets." 2023 IEEE 8th European Symposium on Security and Privacy (EuroS\&P). IEEE, 2023\.

\[5\] Nurmi, Henri. “Sniff, There Leaks My BitLocker Key.” WithSecureTM Labs, labs.withsecure.com/publications/sniff-there-leaks-my-bitlocker-key.

\[6\] “TPM Sniffing Attacks Against Non-Bitlocker Targets | Secura.” English, cybersecurity.bureauveritas.com/blog/tpm-sniffing-attacks-against-non-bitlocker-targets.

\[7\] Oberson, Author Julien. TPM Sniffing – SCRT Team Blog. 15 Nov. 2021, blog.scrt.ch/2021/11/15/tpm-sniffing.

\[8\] “Extracting BitLocker Keys From a TPM.” Pulse Security, pulsesecurity.co.nz/articles/TPM-sniffing.

\[9\] stacksmashing. “Breaking Bitlocker \- Bypassing the Windows Disk Encryption.” YouTube, 3 Feb. 2024, [www.youtube.com/watch?v=wTl4vEednkQ](http://www.youtube.com/watch?v=wTl4vEednkQ).

\[10\] *Tpm2\_Policycountertimer \- Tpm2-tools*. tpm2-tools.readthedocs.io/en/latest/man/tpm2\_policycountertimer.1.

\[11\] *TPM Security — the Linux Kernel  Documentation*. docs.kernel.org/security/tpm/tpm-security.html.

\[12\] tpm2-software community. “Tpm2-software Community.” Tpm2-software Community, tpm2-software.github.io.

[^1]:  _It is worth noting that PCR values are changed through a PCR extend operation (hashing the previous value with the current value) so it is difficult to change the value of PCRs to an arbitrary value after boot measurement has happened, think of it like how hard it is to perform a collision attack on SHA256._
