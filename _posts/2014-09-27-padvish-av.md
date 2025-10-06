---
layout: post
title: Multiple Vulnerabilities in Padvish Antivirus Kernel Driver
date: 2014-09-27
author: Shahriyar Jalayeri
comments: true
categories: [exploiting, kernel]
---

I discovered some interesting vulnerabilities in Padvish Antivirus, a popular Iranian security solution. What I found are two distinct flaws that could completely bypass the protection mechanisms and terminate the antivirus process.

## Bug #1: Race Condition in Process Protection Hook

The first vulnerability is a classic race condition in Padvish's kernel driver `apsp.sys`. The driver hooks `ZwOpenProcess` and `ZwOpenThread` to protect its own processes, but the implementation has a critical timing flaw.

### The Vulnerable Code Flow

Let's examine the hooked `ZwOpenProcess` function:

```assembly
    .text:00012EF9                 mov     [ebp+ms_exc.disabled], edi
    .text:00012EFC                 push    1               ; Alignment
    .text:00012EFE                 push    4               ; Length
    .text:00012F00                 mov     esi, [ebp+ProcessHandle]
    .text:00012F03                 push    esi             ; Address
    .text:00012F04                 call    ds:ProbeForWrite
    .text:00012F0A                 mov     ebx, [esi]
    .text:00012F0C                 push    [ebp+ClientId]  ; _DWORD
    .text:00012F0F                 push    [ebp+ObjectAttributes] ; _DWORD
    .text:00012F12                 push    [ebp+DesiredAccess] ; _DWORD
    .text:00012F15                 push    esi             ; _DWORD
    .text:00012F16                 call    OriginalZwOpenProcess

```

The critical issue is that the driver first calls the original `ZwOpenProcess` with **unmodified arguments** to obtain a handle to the target process. Then it performs validation:

```assembly
    .text:00012F1C                 cmp     eax, edi
    .text:00012F1E                 jl      short loc_12F91
    .text:00012F20                 push    edi             ; HandleInformation
    .text:00012F21                 lea     eax, [ebp+Object]
    .text:00012F24                 push    eax             ; Object
    .text:00012F25                 push    edi             ; AccessMode
    .text:00012F26                 mov     eax, ds:PsProcessType
    .text:00012F2B                 push    dword ptr [eax] ; ObjectType
    .text:00012F2D                 push    edi             ; DesiredAccess
    .text:00012F2E                 push    dword ptr [esi] ; Handle
    .text:00012F30                 call    ds:ObReferenceObjectByHandle
    .text:00012F36                 cmp     eax, edi
    .text:00012F38                 jl      short loc_12F89
    .text:00012F3A                 push    [ebp+Object]
    .text:00012F3D                 call    ds:PsGetProcessId
    .text:00012F43                 mov     edi, eax
    .text:00012F45                 call    ds:PsGetCurrentProcessId
    .text:00012F4B                 test    edi, edi
    .text:00012F4D                 jz      short loc_12F80
    .text:00012F4F                 push    eax             +---+
    .text:00012F50                 call    sub_11E82           |
    .text:00012F55                 mov     [ebp+>ar_20], eax   |
    .text:00012F58                 push    edi                 |
    .text:00012F59                 call    sub_11E82           |
    .text:00012F5E                 mov     edi, eax            |
    .text:00012F60                 push    edi                 |     Validation process
    .text:00012F61                 call    sub_12936           |
    .text:00012F66                 cmp     eax, 0FFFFFFFFh     |
    .text:00012F69                 jz      short loc_12F80     |
    .text:00012F6B                 push    [ebp+>ar_20]        |
    .text:00012F6E                 push    edi                 |
    .text:00012F6F                 call    sub_12986       +---+
    .text:00012F74                 cmp     eax, 0FFFFFFFFh
    .text:00012F77                 jnz     short loc_12F80
```

If validation fails, it modifies the `DesiredAccess` to limit privileges:

```assembly
    .text:00012F79                 mov     [ebp+DesiredAccess], 400h
```

Then it closes the original handle and calls `ZwOpenProcess` again with the restricted access rights.

### The Race Condition Window

The vulnerability exists in this sequence:
1. Call original `ZwOpenProcess` with `PROCESS_ALL_ACCESS`
2. Get a valid handle with full privileges
3. Start validation process
4. **← Race condition window here**
5. Close handle and reopen with restricted access

### Exploitation Strategy

To exploit this, I created two threads:
- **Thread 1**: Continuously calls `OpenProcess` with `PROCESS_ALL_ACCESS` on the Padvish process
- **Thread 2**: Continuously attempts to terminate processes using any obtained handles

The key is timing, we need to interrupt the validation process and use the handle before it gets closed. Setting Thread 1 to `BELOW_NORMAL_PRIORITY_CLASS` and Thread 2 to normal/above normal priority increases success probability.

## Bug #2: Registry Key Rename Bypass

The second vulnerability involves Padvish's protection of the "Image File Execution Options" registry key. The antivirus prevents setting debugger values for its own process names, but there's a simple bypass.

### The Protection Mechanism

Padvish monitors and blocks attempts to:
1. Create values inside `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\APCcSvc.exe`
2. Set debugger hooks on its service processes

### The Bypass

However, the protection doesn't account for key renaming operations using `NtRenameKey`. The bypass works as follows:

1. Create a dummy key: `Image File Execution Options\RandomName123`
2. Set the desired debugger value inside this key
3. Use `NtRenameKey` to rename it to `APCcSvc.exe`

This completely bypasses the protection since the validation only occurs during direct key creation/modification, not during rename operations. Once the debugger registry key is in place, the Padvish service cannot start properly after termination or system reboot, effectively disabling the antivirus protection.

---

Check the Poc [here](https://gitlab.com/shahjal/padvish-av-exp/-/raw/master/racewithpadvish.cpp?ref_type=heads) and Demo [here](https://gitlab.com/shahjal/padvish-av-exp/-/raw/master/Race%20with%20Padvish%20Demo.rar?ref_type=heads&inline=false).