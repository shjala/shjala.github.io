---
layout: post
title: Noroi - Polymorphic Decoder Generator for Shellcodes
date: 2014-03-26
author: Shahriyar Jalayeri
comments: true
categories: [exploiting, re]
---

<img src="https://gitlab.com/shahjal/noroi/-/raw/master/noroi_logo.png?ref_type=heads&inline=false" alt="">

Noroi generates polymorphic decoders for shellcode that can bypass shellcode emulators by accessing static Windows addresses between the GetPC routine and the decoding process. This causes antivirus engines running in emulation mode to fault and skip analysis without detecting the GetPC pattern, a technique I believe libemu currently cannot handle.

## Supported Evasion Techniques

The current version implements several anti-detection methods:

- **Register Swapping**: Dynamically swaps registers to break static analysis patterns
- **Instruction Substitution**: Replaces instructions with functionally equivalent alternatives  
- **Random XOR Keys**: Uses randomized XOR keys for decryption routines
- **Random Junk Insertion**: Injects meaningless instructions to obfuscate control flow

## How It Works

The tool uses a context-free grammar approach to generate varied decoder stubs. Each generated decoder is functionally identical but syntactically different, making signature-based detection extremely difficult. The key innovation is the strategic placement of Windows API calls that cause emulators to fail gracefully, allowing the real payload to execute undetected on actual systems.

I've tested Noroi with SkyLined's dl-loadlib shellcode on Windows 7 x64 and it works reliably. The current version is designed for x86 systems (not WoW64). If you need to run it on x64, you'll need to remove the lines marked with "this one is for x86 only" in the source.


---

Check the code [here](https://gitlab.com/shahjal/noroi)

*Note: This tool is intended for legitimate security research and penetration testing. Use responsibly and only on systems you own or have explicit permission to test.*