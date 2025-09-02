---
layout: post
title: The Confused Deputy and Capability Systems
date: 2021-11-22
author: Shahriyar Jalayeri
comments: true
categories: [unix, caps]
---

Recently I had a conversation about Linux [capabilities(7)](https://man7.org/linux/man-pages/man7/capabilities.7.html), after discussing some of the [false boundaries](https://forums.grsecurity.net/viewtopic.php?t=2522), there was a bit of confusion, why bother with capabilities when an attacker can simply extend it to a get full root access with all the capabilities enabled? or even simpler what is the point if you can revert back to UID 0 from your saved UID? Well, it is not always case of memory corruptions and complete control flow hijack, sometimes as Norman Hardy described it is a case of ***confused deputy***![^1]

The original paper lays out a problem about a compiler program running in a Unix like environment. A user interacting with the compiler:

> would use the compiler by saying "RUN (SYSX)FORT", and could provide the name of a file to receive some optional debugging output.

The compiler is instrumented to collect statistics about language feature usage, the file name to write the statistics is hard-coded in the compiler. But to enable the compiler to write the STAT file, it needs to run with a special permission (originally called *home files license*). The operating system allowed a program with such permission to write files in its home directory. The billing information file BILL was also stored in the home directory, so naturally:

> some user came to know the name BILL and supplied it to the compiler as the name of the file to receive the debugging
> information. The compiler passed the name to the operating system in a request to open that file for output. The operating system, observing that the compiler had home files license, let the compiler write debugging information over BILL. *The billing information was lost*.

Obviously you can fix this issue by adding conditions on which user can write to, but this quickly make the problem more complex and unamenable (e.g. multiple files and directories, changes in importance, change in directory and file names, changes in the compiler, etc.). The actual problem lies elsewhere, the problem arise the moment you give the compiler special permission to write into home directory, Here the author says *the fundamental problem*:

> is that ***the compiler runs with authority stemming from two sources***. (That's why the compiler is a confused deputy.)

In one hand compiler should serve invoker of "RUN (SYSX) FORT" and be able to provide debugging information to fulfill its request and on the other hand it has a special permission (*home files license*) to write the confidential billing information in the home directory and fulfil another kind of request, it can't keep these two different authorities a part.

The preliminary solution was to modify the system by providing a new system call to ***switch hats*** which could be used to select one of its two authorities (if you were wondering where names like [aa_change_hat(2)](http://manpages.ubuntu.com/manpages/trusty/man2/aa_change_hat.2.html) came from). So upon user request, compiler wears the Invoker hat, this enables it to run programs and provide debugging information back to user, but it has no special permission at this point in time, no matter how hard an attacker tries, it is simply not possible to gain access to privileged parts of the system. But when it needs to write STAT and BILL information, it switches to another hat to regain required permissions. The author continues that:

> soon became clear, however, that more than two "authorities" were necessary for some of our applications. A further problem was that there were other authority mechanisms besides access to files. 

So as generalized solution, the capability systems came to life (first theoretical designs appeared in 1960*). I should mention, Linux interpretation of capabilities is different than pure capability bases systems, but it is still rooted in the same problem/solution space.



------



[^1]: Hardy, N. (1988). The Confused Deputy: (or why capabilities might have been invented). *ACM SIGOPS Operating Systems Review*, *22*(4), 36-38.

