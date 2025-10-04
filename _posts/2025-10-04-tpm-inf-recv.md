---
layout: post
title: Infineon TPM Driver Vulnerability Lurking for ~20 Years
date: 2025-10-04
author: Shahriyar Jalayeri
comments: true
categories: [tpm, exploiting, unix]
---

While I researching the recently added Linux kernel TPM HMAC protection (read about it [here](https://defense.sh/tpm/2025/09/10/dtpm-is-dead.html)), I looked around and found a 20-year‑old, classic buffer overflow in one of the Infineon TPM drivers [1]:

```
static int tpm_inf_recv(struct tpm_chip *chip, u8 * buf, size_t count)
{
[...]
	if (buf[1] == TPM_CTRL_DATA) {
		/* size of the data received */
		size = ((buf[2] << 8) | buf[3]); // <== TPM‑ (or attacker-) controlled size with no bound checking

		for (i = 0; i < size; i++) {
			wait(chip, STAT_RDA);
			buf[i] = tpm_data_in(RDFIFO); // <== write TPM‑ (or attacker-) controlled data to kernel memory
		}
[...]
```

The issue is that the driver reads both size and data from the bus, and because `buf` is a static `TPM_BUFSIZE` (4096) bytes, an unchecked `size` lets a malicious or emulated TPM overflow kernel memory with attacker‑controlled bytes. The TPM interface is not a DMA-capable device, and the hardware was never meant to let a peripheral "exploit" the kernel simply by lying about a length field.

To exploit this, an attacker needs physicall access to the system and a interposer or emulate the TPM hardware, but seeing how easy it is to perform such attacks[2], I doubt it would be hard to pull it off, specifically if you have enough time an access to the targeted device, which often is the case with many edge devices.

Could a malicious TPM firmware have been drip‑feeding kernel overflows into select targets for years? Sure. Could it also be that nobody ever bothered because physical attacks aren’t glamorous? Also yes.

I’ve already reported it upstream [3].

---

\[1\]  https://github.com/torvalds/linux/blob/cbf33b8e0b360f667b17106c15d9e2aac77a76a1/drivers/char/tpm/tpm_infineon.c#L245

\[2\] stacksmashing. “Breaking Bitlocker \- Bypassing the Windows Disk Encryption.” YouTube, 3 Feb. 2024, [www.youtube.com/watch?v=wTl4vEednkQ](http://www.youtube.com/watch?v=wTl4vEednkQ).

\[3\] https://lore.kernel.org/all/20251004090413.8885-1-shahriyar@posteo.de/