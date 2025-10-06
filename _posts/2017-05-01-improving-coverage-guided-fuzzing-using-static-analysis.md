---
layout: post
title: Improving Coverage Guided Fuzzing Using Simple Static Analysis
date: 2017-05-01 15:36
author: Shahriyar Jalayeri
comments: true
categories: [oldblog, fuzzing]
---

<div dir="ltr" lang="en">

<p style="text-align:justify;">SMT solvers are powerful, but their great power needs great computational infrastructure (if you want to put them in real-word practice), and its something that I don't have, So I constantly try to find new ways to improve fuzzing without need of heavy computational overhead. There are some ways to avoid SMT Solvers <span class="st"><span dir="rtl">and</span></span> improving the code coverage significantly. For example the idea of transforming the code (in compile time) in a way that helps guided brute-force fuzzing find its way in deeper paths of the program has gain attention lately[0][1]. But when you are dealing with binaries, you can't easily transform the compare instructions (e.g "CMP REG, CONSTANT" or string comparisons) to a split variation that helps the fuzzer to butte-force the constant operand one byte at the time (In KFLOG I can instrument the execution of CMP without any sensible overhead, but I will talk about that in another blog post when I fully implemented and tested it).</p>
<p style="text-align:justify;">But it is still possible to improve the code coverage of a guided fuzzer without use of SMT solvers or instrumentation of CMP instruction when it stucks on a block with a constant comparison, using simple static analysis on CMP instructions.</p>
<p style="text-align:justify;">By use of a simple IDA script, I first enumerates all the CMP instructions with a constant operand, then I enumerate the Jump Instructions that are related to the targeted CMP instruction (some times CMP is followed by more than one jump, for example a JZ and then a JA). After that I generate a constant that negates each CMP conditions, then I save the constant and its negation(s) on a dictionary file. The dictionary content is later gets injected into the input buffer by KFUZZ during a fuzzing session. You can further improve this by adding string constants to the dictionary too.</p>
<p style="text-align:justify;">The effect is really impressive, for example KFUZZ is now able to pass the following test without need to instrument the CMP instruction (to split the constant) while producing good coverage (It can produce full coverage if I don't stop the fuzzing when it reaches the "return TRUE" line.):</p>

<pre style="text-align:justify;">// fuzzer test functions, garbed from LllvmFuzzer tests
// https://github.com/llvm-mirror/llvm/tree/master/lib/Fuzzer/test

static volatile INT sink;

BOOLEAN
LongSwitch(
    CONST PUCHAR Data,
    SIZE_T       Size
    )
{
    ULONGLONG X;

    if (Size &lt; sizeof(X))
        return FALSE;

    memcpy(&amp;X, Data, sizeof(X));
    switch (X) {

        case 1: sink = __LINE__; break;
        case 101: sink = __LINE__; break;
        case 1001: sink = __LINE__; break;
        case 10001: sink = __LINE__; break;
        case 100001: sink = __LINE__; break;
        case 1000001: sink = __LINE__; break;
        case 10000001: sink = __LINE__; break;
        case 100000001: return TRUE;
    }

    return FALSE;
}</pre>
<img class="alignnone size-full wp-image-109" src="\assets\img\posts\longswitchcfg.png" alt="LongSwitchCFG" width="997" height="782" />
<p style="text-align:justify;">Driller paper[2] introduced a challenge that emphasis the use of concolic execution on fuzzing. The challenge is written in a way that a normal guided fuzzer like AFL[3] is unable to complete because the use of a 4 bytes numeric constant and two string constants. A fuzzer have to guess this values correctly to be able to find the bug. I implemented the same challenge in KTEST driver and gave it a try using constant dictionary (contains both CMP and string constants + memory compare routines instrumentation disabled):</p>

<pre>#define DRILLER_TEST_MAGIC  0x9e3779b9
typedef struct _DRILLER_TEST_CONFIG {
    ULONG Magic;
    CHAR Directive[64];
} DRILLER_TEST_CONFIG, *PDRILLER_TEST_CONFIG;

NTSTATUS
DrillerTest(
    IN PUCHAR Buffer,
    IN ULONG  BufferLen
    )
{
    PDRILLER_TEST_CONFIG pConfig;

    if (BufferLen &lt; sizeof(DRILLER_TEST_CONFIG))        
        return STATUS_INVALID_BUFFER_SIZE;

    pConfig = (PDRILLER_TEST_CONFIG)Buffer;    
    if (pConfig-&gt;Magic != DRILLER_TEST_MAGIC) {
        
        DbgPrint("[KTEST] Bad magic number\n");
        return STATUS_INVALID_PARAMETER;
    }

    if(!strncmp(pConfig-&gt;Directive, "crashstring", 12)) {
        
        DbgPrint("[KTEST] passed the DrillerTest (crashstring)!\n");
        return STATUS_SUCCESS;
    }
    else if(!strncmp(pConfig-&gt;Directive, "setoption", 10)) {

        /* setoption(config-&gt;directives[1]); */
        DbgPrint("[KTEST] passed the DrillerTest! (setoption)\n");
        return STATUS_SUCCESS;
    }
    else {

        /* _default(); */
        DbgPrint("[KTEST] DrillerTest called the _default()\n");
        return STATUS_INVALID_PARAMETER;
    }
}</pre>
<a href="https://youtu.be/nVYU9X98-J8">
<img src="\assets\img\posts\vid1.png" alt="https://youtu.be/nVYU9X98-J8">
</a>

<p style="text-align:justify;">First a few bytes in the queued files in demo above are KFUZZ's internal structure contains some scheduling information about the queued test-case.</p>
<p style="text-align:justify;">After that I tested it using a dictionary contains only CMP constants (no string constant) and enabled memory compare routine instrumentation (I started recording in the middle of session and sorry, eye-protector poped up in the middle of video for 20 sec).</p>

<a href="https://youtu.be/l2FwtnD2y78">
<img src="\assets\img\posts\vid2.png" alt="https://youtu.be/l2FwtnD2y78">
</a>


<hr />
<pre>
[0] https://lafintel.wordpress.com/2016/08/15/circumventing-fuzzing-roadblocks-with-compiler-transformations/
[1] http://dl.acm.org/citation.cfm?id=2594450
[2] https://www.internetsociety.org/sites/default/files/blogs-media/driller-augmenting-fuzzing-through-selective-symbolic-execution.pdf
[3] http://lcamtuf.coredump.cx/afl/
</pre>

---

<p><strong>This is imported from my old WP blog, some links might be broken, <a href="https://repret.wordpress.com/2017/05/01/improving-coverage-guided-fuzzing-using-static-analysis/">original post</a>.</strong></p>
