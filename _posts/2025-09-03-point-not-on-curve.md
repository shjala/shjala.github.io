---
layout: post
title: Point is not on the required curve!
date: 2025-09-03
author: Shahriyar Jalayeri
comments: true
categories: [tpm]
---

TL;DR: Some devices with certain fTPMs failed updates because their TPM didn’t like ECC keys without proper padding, throwing “point is not on the required curve.” when calculating ECDH shared key using `ECDHZGen because X.Bytes()` in Go will put you in trouble.

About a year ago, we discovered that some of our devices were failing to update due to an issue with the TPM, throwing the error: **"point is not on the required curve."**

I took a few stabs at it here and there, but nothing really stuck, until eventually, with the help of some colleagues from a team in China, we finally cracked it. I'm writing this down now as a small act of service to the next poor soul who runs into this error. Hopefully, this saves someone a few hours (or weeks) of head-scratching.

To give a bit of background on how this all works:

We use the TPM to protect the disk encryption key. It gets sealed inside the TPM under a PCR policy that's bound to a trusted system state (based on PCRs). At the same time, we also send a backup of this key (encrypted)  to a controller. That backup is encrypted using a shared secret derived from Elliptic-Curve Diffie-Hellman (ECDH). One part of that key exchange is a non-exportable TPM key, and the other is the controller’s public key. This gives us a recovery path in case we ever need to restore the encryption key.

One of those recovery situations is after a device update. When a device updates, it runs through the attestation flow and it sends a quote (signed PCRs) to the controller. If the new PCR state is one we expect and trust, the controller sends back the encrypted key.

The device then performs a TPM `ECDHZGen` operation to re-derive the shared key, decrypts the backup, and re-seals the disk encryption key inside the TPM under the newly accepted PCR policy. But on some devices, we noticed two things:

1. The controller didn’t have a stored key for them.

2. Even worse, the device itself was failing when it tried to run `ECDHZGen`, throwing the error: **"point is not on the required curve."**

At this point, I dove deep into the ECC crypto algorithm. I checked reference implementations, and basically anything I could get my hands on to figure out what might be causing this error. None of it helped.

So I decided to code a tool to run all kinds of tests. Maybe the problem was with the keys. Maybe our code. Or maybe, the worst case, it was the TPM itself was failing at doing crypto properly. I ran the tests on one of the failing TPMs. Surprisingly, it was able to run crypto operations just fine using the same code we use in production. But it *only* failed when using those specific keys involved in the ECDH exchange. To rule out the rest, I ran the same tests on other TPMs and an emulator and they all worked. No issues with any kind of key.

It’s worth noting these were production devices. I couldn’t just clear the TPM and start fresh. We needed access to the encryption key to at least recover and back up the data. So we were stuck figuring this out on a live system.

Eventually, I had to shift focus to other work, so I passed one of the failing devices along with my test tool and all the info I had gathered, over to another team (the device OEM). We figured they might have a support agreement with the TPM manufacturer and possibly more leverage to dig deeper. After several meetings, a bunch of back-and-forth emails, and a few months of waiting, they finally had a breakthrough.

They ran our test tool (same one I had written) but with one key difference: they generated a new random key for each iteration and… cleared the TPM between runs (🤦). They logged all the keys being used, and eventually, they hit the issue, with freshly generated keys.

So it turned out... it was a **padding issue**. Who could’ve guessed? (it’s *always* a padding issue 😐). The ECC points being used were sometimes less than the expected key max size. That shouldn't be a big deal, right? Here’s the catch, When generating ECC keys (specifically the x and y coordinates), the raw integer values can be **less than 256 bits** (or whatever is your key size) and therefore get encoded with **fewer than 32 bytes**. For example, if `x` is something like `0x0000000000000000000000000000000000000000000000000000000000000012`, it only takes 1 byte to represent it (`0x12`).

But this TPM expected the coordinates to be **padded to a fixed length**, in this case 32 bytes. If you send a point with a 31-byte `x` or `y`, the TPM will happily parse it... until it checks whether that point lies on the curve and when it doesn't, boom **"point is not on the required curve.”** That was the core of the issue. The keys looked fine, decoded fine, but subtly broke everything because of inconsistent padding.

To be fair, this wasn’t entirely our fault.

Yes, we were using `X.Bytes()` in Go, which just returns the raw bytes without padding to a fixed size. But this same code was running fine on thousands of devices with different TPM brands. The only ones failing were the ones using this particular fTPM.

According to the TPM spec, this shouldn't have happened. This specific issue is covered in TPM spec version 1.38 or later, more precisely *Trusted Platform Module Library, "Part 1: Architecture", Family “2.0” Level 00 Revision 01.38*, section C.8 ECC Point Padding.

The key point here is that when *we* send in ECC parameters, the TPM should accept them as-is, even if they’re not padded. The command we were using, `ECDHZGen`, should’ve handled unpadded values just fine.

So in short: yes, we could’ve padded the values ourselves (and eventually we did)  but according to the TPM should’ve accepted the key, even without padding, just like every other brand did.

The frustrating thing about fTPMs is that, unlike discrete TPMs, they’re implemented in firmware usually buried somewhere deep in ME or Platform Security Processor or whatever. Because of how they’re embedded, fTPMs can't go through the standard TPM certification process. That means they don’t show up on the [official TPM certified products list](https://trustedcomputinggroup.org/membership/certification/tpm-certified-products/). Because if they’re not certified, we have no way to know what version of the TPM spec they're actually compliant with.

In the end, this was a lesson in the quirks of TPM implementations, especially with fTPMs. We patched our code to pad the keys explicitly, which fixed the problem in practice, but the root cause lied deeper. Hopefully, sharing this story helps others avoid the same wild goose chase when faced with the dreaded “point is not on the required curve” error.
