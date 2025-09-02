---
layout: post
title: Bypassing EMET 3.5's ROP Mitigations
date: 2012-08-08
author: Shahriyar Jalayeri
comments: true
categories: [oldblog, exploting]
---

<div dir="ltr" lang="en">

UPDATE : <strong><em>It seems MS was aware of this kind of bypasses, so I bypassed EMET ROP mitigations using another EMET's implementation mistake. EMET team forget about the KernelBase.dll and left all its functions unprotected. so I used <a href="http://twitter.com/antic0de" target="_blank">@antic0de</a>'s <a href="http://t.co/qqV1ooaH">method </a>for finding base address of kernelbase.dll at run-time, then I used VirtualProtect inside the kernelbase.dll, not ntdll.dll or krenel32.dll. you can get new exploit at the end of this post.</em></strong>

I have managed to bypass EMET 3.5, which is recently released after Microsoft BlueHat Prize, and wrote full-functioning exploit for CVE-2011-1260 (I choosed this CVE randomly!) with all EMET's ROP mitigation enabled.
<p style="text-align:center;"><a href="\assets\img\posts\ms-emet1.png"><img class="aligncenter size-full" title="MS-EMET" alt="" src="\assets\img\posts\ms-emet1.png" width="497" height="94" /></a> <br><a href="http://support.microsoft.com/kb/2458544" target="_blank">http://support.microsoft.com/kb/2458544</a></p>



EMET's ROP mitigation works around hooking certain APIs (Like VirtualProtect) with Shim Engine and monitors their initialization.I have used SHARED_USER_DATA which mapped at fixed address "0x7FFE0000" to find KiFastSystemCall address (SystemCallStub at "0x7FFE0300"), So I could call any syscall by now!By calling ZwProtectVirtualMemory's SYSCALL "0x0D7", I made shellcode's memory address RWX. After this step I could execute any instruction I wanted. But to execute actual shellcode (with hooked APIs like "WinExec") I did patched EMET to be deactivated completely. BOOM! <strong><em>you can use both this methods for generally bypassing EMET ROP mitigations in other exploits, all you need is to bypass ASLR.</em></strong>

<br><br><a href="http://www.youtube.com/watch?v=zzEDbQrV-gI">Demo on Youtube</a>
<br><a href="https://github.com/shjalayeri/emet_bypass">Here</a> is the asm code which makes EMET 3.5 deactivated  And actual exploit.
</div>

<p><strong>This is imported from my old WP blog, <a href="https://repret.wordpress.com/2012/08/08/bypassing-emet-3-5s-rop-mitigations/">original post</a>.</strong></p>
