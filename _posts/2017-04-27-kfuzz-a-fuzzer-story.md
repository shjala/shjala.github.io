---
layout: post
title: Fuzzing and Instrumenting Windows Kernel
date: 2017-04-27 14:18
author: Shahriyar Jalayeri
comments: true
categories: [oldblog, fuzzing]
---

<div dir="ltr" lang="en">


<p style="text-align:justify;">Almost two years ago, I started to write a kernel fuzzer to experiment with various ideas I had in mind. In the process I had to deal with some unexpected challenges I thought might be useful to share to people who want to go in the same path. I didn’t have a powerful machine or a fuzzing farm to throw a dumb fuzzer at it and let it run for a while and expect the monkey to come up with the complete works of Shakespeare, so speed and high coverage was my primary concern.</p>
<p style="text-align:justify;">KFUZZ (I know! what a generic name ; ) uses a modular design which is separated in two user/kernel mode components. The user-mode part is responsible for mutating the input and consulting the KFLOG (kernel part) to see the input was able to hit any new edge/block or not. It’s really easy to develop new plugins for new targets and I have already implemented a bunch of them for fonts and generic driver IO fuzzing.</p>
<p style="text-align:justify;">The real challenges began to show up in the kernel part implementation. I decided to implement the AFL[0] mechanism to trace the edge coverage in KFLOG. But there wasn’t any source code to instrument or any fast hardware assisted block tracing technology (except slow Intel PT which I was unaware of its existence at that time) to trace the control flow, and I was dealing with drivers binaries! The solution was (obviously) either binary rewriting or hooking at basic block level. Binary rewiring is really hard to implement and it is very error prone, especially when dealing with optimized kernel drivers, a simple mistake can crash the whole system. The best method I came up was to mirror the text section to avoid the plainly correction of data access in the rewritten text section by redirecting data access to the original unmodified text section, but even this was really a time consuming task!</p>
<p style="text-align:justify;">So I decided to go with basic block level hooking idea (Besides the pain of correctly implementing binary rewriting, kernel component are getting load only once in the system up-time, so there is no need to worry about overhead of reloading and re-hooking the basic blocks at every input execution cycle). The first stage in BBL hooking is to extract basic blocks location from the binary and I knew that static recovery of control flow graph is almost impossible, especially when dealing with windows binaries you can’t rely on linear disassembly[1] and have 100% recovered CFG, but I gave it a try using mighty IDA Pro as static dissembler after Jakstab[2] and others failed me. IDA was able to produce correct CFG for almost all the targets (but failed in some case, like ntoskrnl).</p>
<p style="text-align:justify;">The next thing that I had to deal with was the problem of small basic blocks, in order to hook a BB it has to be more than or equal to 5 bytes (size of a long jump instruction) and unfortunately there are lots of small basic blocks out there you cant hook and didn’t want to miss any of them! So I came up with the idea of using interrupt handler as a mechanism for instrumenting small basic blocks. I rewrote the small block with an Illegal Instruction (only two byes long!) and the used hooked IDT to instrument the block execution. It was tricky to implement but I did it right.</p>
<p style="text-align:justify;">Now I had really fast and very low overhead (almost native!) basic block instrumentation framework. I used statically generated random IDs for each basic block (no need no re-compute it at each edge trace) and also implemented a callback in the edge hit function so I was able to do some extra work like recording control flow graph for each test-case without any overhead.</p>
<p style="text-align:justify;">I also sacrificed a little bit of memory for more speed, unlike AFL I don’t have to re-scan the bitmap every time I ran a test-case to see if it was able to hit new edges. After locating the current edge position in the bitmap I use BTC[3] instruction to check it was set prior this hit or not, something like this:</p>

<pre>movzx   esi, byte ptr [ebx+edx] /* Current edge position in the bitmap */
btc     esi, 0       /* ESI holds 1 for new edge and 0 for an old edge */
add     _g_EdgeCounter, esi
mov     byte ptr [ebx+edx], 1</pre>
<p style="text-align:justify;">Then I saved the _g_EdgeCounter variable in the shared memory so I was able to access it directly from user-mode component to reduce the kernel I/O at each input execution and hence speed up a little bit more ( I measured it, 10000 times shared memory access took 53709 <span class="caps">TICS/</span>174 us and 10000 times access to _g_EdgeCounter using driver I/O took 16778493 <span class="caps">TICS</span>/50863 us).</p>
<p style="text-align:justify;">The next speed bottleneck was disk I/O, obviously first solution was using Ram Disks, but when you are fuzzing kernel you can’t rely on Ram because its content vanishes away when you crash the system. In an unsuccessful attempt I tied to hook KeBugcheck internals and dump the Ram content at the time of crash, then I decided to create the Ram disk outside the fuzzing VM and map it using network share inside the VM, so it can survive the VM crash and it worked. But I wanted more speed!</p>
<p style="text-align:justify;">When you are fuzzing kernel drivers they rarely accept a file as an input, so it doesn’t matter how you save your test-case content before you run it through the target! To speed up test-case saving process I created a simple flat filesystem (if you call it filesystem ; ) which is just giant file (rounded up to sector size) with a single handle opened to it (with FILE_FLAG_NO_BUFFERING and FILE_FLAG_WRITE_THROUGH flags set). To save a test-case I rounded up its size to sector size and used the index variable to save it in the appropriate free position in the filesystem along some extra information like its original size. This results in significant speed up (I've lost the measurements, but in my context the speed gain was really impressive) because I didn’t have go through kernel and filesystem driver codes for opening and closing a file every time I want to save a test-case and I was able to save as many test-cases as I wanted.</p>
<p style="text-align:justify;">After successfully testing KFUZZ against real word examples, I wanted a more systematic approach to evaluate its effectiveness but nor LAVA corpora[4] or EvilCoder[5] were available at that time. So I wrote a very simple random program generator to test the KFUZZ capabilities. Here is sample function generated by my RPG:</p>

<pre>BOOLEAN rgp_2_s[9] = { FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE };
// the following program covers about 14 percentage (19/128) of the input buffer!
NTSTATUS RandProg_2(__in PUCHAR Buffer, __in ULONG BufferLen)
{
    if (BufferLen &lt; 128) return STATUS_UNSUCCESSFUL;     if ( ( Buffer[0x55] != 0x22 ) || ( Buffer[0x38] &gt; 0x1D || Buffer[0x7A] &lt; 0x57 || Buffer[0x5A] &lt; 0xFA )  )
    {
        if (rgp_2_s[0] != TRUE)
        {
            DbgPrint("[RGF-2] passed stage 0!\n");
            rgp_2_s[0] = TRUE;
        }

        if ( ( Buffer[0x07] &lt; 0x1D || Buffer[0x46] &gt; 0x1D )  )
        {
            if (rgp_2_s[1] != TRUE)
            {
                DbgPrint("[RGF-2] passed stage 1!\n");
                rgp_2_s[1] = TRUE;
            }

            if ( Buffer[0x28] == 0x69  )
            {
                if (rgp_2_s[2] != TRUE)
                {
                    DbgPrint("[RGF-2] passed stage 2!\n");
                    rgp_2_s[2] = TRUE;
                }

                if ( Buffer[0x37] &lt; 0xFA  )                 {                     if (rgp_2_s[3] != TRUE)                     {                         DbgPrint("[RGF-2] passed stage 3!\n");                         rgp_2_s[3] = TRUE;                     }                     if ( ( Buffer[0x0C] != 0x87 || Buffer[0x31] &gt; 0xCB ) || Buffer[0x7F] &gt; 0x66 || ( Buffer[0x7A] != 0xB4 )  )
                    {
                        if (rgp_2_s[4] != TRUE)
                        {
                            DbgPrint("[RGF-2] passed stage 4!\n");
                            rgp_2_s[4] = TRUE;
                        }

                        if ( ( Buffer[0x3C] == 0x09 ) || Buffer[0x54] &lt; 0x8A  )
                        {
                            if (rgp_2_s[5] != TRUE)
                            {
                                DbgPrint("[RGF-2] passed stage 5!\n");
                                rgp_2_s[5] = TRUE;
                            }

                            if ( ( ( Buffer[0x70] &lt; 0x29 ) ) &amp;&amp; ( Buffer[0x43] != 0x87 &amp;&amp; Buffer[0x09] != 0x9B )  )
                            {
                                if (rgp_2_s[6] != TRUE)
                                {
                                    DbgPrint("[RGF-2] passed stage 6!\n");
                                    rgp_2_s[6] = TRUE;
                                }

                                if ( ( Buffer[0x1D] == 0x90 )  )
                                {
                                    if (rgp_2_s[7] != TRUE)
                                    {
                                        DbgPrint("[RGF-2] passed stage 7!\n");
                                        rgp_2_s[7] = TRUE;
                                    }

                                    if ( Buffer[0x7E] &lt; 0xC6  )
                                    {
                                        if (rgp_2_s[8] != TRUE)
                                        {
                                            DbgPrint("[RGF-2] passed final stage!\n");
                                            rgp_2_s[8] = TRUE;
                                        }

                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}</pre>
<p style="text-align:justify;">Soon after, I added tests from LllvmFuzzer test-suit to my test driver KTEST. here are some results (entirely on KTEST binary) [6]:</p>
<p style="text-align:justify;"><img class="alignnone size-full wp-image-94" src="\assets\img\posts\ktest_result.png" width="572" height="404" /></p>
<p style="text-align:justify;">And after adding memory comparison instrumentation to KFUZZ, it was able to pass the following test in 22 minutes.</p>
<img class=" size-full wp-image-85 aligncenter" src="\assets\img\posts\ktest_strncmp_test.png" alt="ktest_strncmp_test" width="572" height="404" />
<p style="text-align:justify;">There are still some features missing in the KFUZZ, like instrumentation of CMP instruction or internal memory/string compare loops instrumentation or using a SMT solver when KFUZZ stuck on an input, which I have plans to implement.</p>


<hr />
<pre>
[0] http://lcamtuf.coredump.cx/afl/
[1] https://www.usenix.org/conference/usenixsecurity16/technical-sessions/presentation/andriesse
[2] http://tuprints.ulb.tu-darmstadt.de/2338/
[3] http://x86.renejeschke.de/html/file_module_x86_id_23.html
[4] https://seclab.ccs.neu.edu/static/publications/sp2016lava.pdf
[5] http://dl.acm.org/citation.cfm?id=2991103
[6] https://gist.githubusercontent.com/shjalayeri/58a9e8e42d3cc8300fa7cbcce174fa75/raw/4646bdfafd9892027a8cbb8a210b5e1f4f87be97/test.c
</pre>

<p><strong>This is imported from my old WP blog, <a href="https://repret.wordpress.com/2017/04/27/kfuzz-a-fuzzer-story/">original post</a>.</strong></p>
