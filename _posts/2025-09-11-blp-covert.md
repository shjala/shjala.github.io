---
layout: post
title: Bell-LaPadula Model has a covert channel and nobody talks about it!
date: 2025-09-11
author: Shahriyar Jalayeri
comments: true
categories: [unix, sec-process]
---

Sure, nobody really cares about a security model introduced way back in the 1970s [1][2], the title is just my attempt at being funny. I can’t exactly remember where I first read about the inherent covert channel in the BLP design, but it stuck with me as one of the earliest (and most interesting) protocol design vulnerabilities I came across.

BLP was designed around the military classification systems and the "need to know" principle used by the U.S. Department of Defense. At its core BLP has two fundamental properties:

* Simple Security Property (ss-property): A subject can read an object only if the security level of the subject dominates the security level of the object (no read up)

* \*-Property (star property): A subject can write to an object only if the security level of the object dominates the security level of the subject (no write down)

To see how these properties come into play, imagine Jill Valentine (Secret clearance) and Rebecca Chambers (Confidential clearance) work with classified documents. The Simple Security Property prevents Chambers from reading Secret battle plans (no read up), while the *-Property prevents Valentine from writing Secret information into Confidential supply lists that Chambers could access (no write down). Together, these properties ensure that secret battle plan details can't leak to lower-clearance personnel either through direct access or through contamination of lower-level documents.

However, this model has a critical vulnerability that creates a high-bandwidth covert channel. If Chambers creates a file f at classification level L(f) = Confidential, Valentine can observe this file (allowed by simple security property) and then make a classification decision based on secret bit b ∈ {0,1}: if b = 1, elevate L(f) to Secret; if b = 0, leave L(f) at Confidential. Chambers then observes whether she can still access file f, learning b directly since she can read the file if and only if L(f) ≤ Confidential.

By repeating this process at a very low frequency ≈ 1 Hz (we are talking Multics :D), they establish a covert channel with bandwidth of ~60 bits/minute or 3,600 bits/hour! Sufficient to exfiltrate 256-bit AES keys in under 5 minutes, RSA private keys in under an hour, or arbitrary classified documents over time. This metadata-based covert channel completely circumvents both Bell-LaPadula properties, while no direct read-up or write-down violations occur, the classification operation itself becomes an information-bearing signal that leaks H-level data to L-level subjects through the observable side effects of access control decisions rather than through the controlled data flows the model was designed to protect.

---

References:

\[1\] Bell, D. Elliot, and Leonard J. LaPadula. Secure computer systems: Mathematical foundations. No. MTR2547VOL1. 1973.

\[2\] Bell, D. Elliott, and Leonard J. La Padula. Secure computer system: Unified exposition and multics interpretation. No. MTR2997REV1. 1976.
