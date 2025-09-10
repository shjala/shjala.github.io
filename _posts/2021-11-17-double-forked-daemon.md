---
layout: post
title: What is PR_SET_CHILD_SUBREAPER, How is it related to double-forked daemon?
date: 2021-11-17
author: Shahriyar Jalayeri
comments: true
categories: [unix]
---

I recently stumbled across `PR_SET_CHILD_SUBREAPER` option in [prctl(2)](https://man7.org/linux/man-pages/man2/prctl.2.html), this option enables you to set a specific process as parent of descendant processes instead of [init(1)](https://man7.org/linux/man-pages/man1/init.1.html), in a case they get re-parented. [prctl(2)](https://man7.org/linux/man-pages/man2/prctl.2.html) man page states the reason is because it is "useful in session management frameworks" for example when a "double-forked daemon—terminates (perhaps so that it can restart that process)". But why can't we just keep the original session manager (parent) alive? and what is *double-forked daemon*?

The [patch](https://lwn.net/Articles/474787/) (*landed in 2012*) for `PR_SET_CHILD_SUBREAPER` also mentions the practice of *daemonize by double-forking* and shines some light into why this option is needed:

> Many services daemonize by double-forking and get implicitly
> re-parented to PID 1. The service manager will no longer be able to
> receive the SIGCHLD signals for them, and is no longer in charge of
> reaping the children with wait(). All information about the children
> is lost at the moment PID 1 cleans up the re-parented processes.

From the patch description, it is clear why `PR_SET_CHILD_SUBREAPER` should exist, but it is still not clear why do double-forking?  Looking into Advanced Programming in the UNIX® Environment (*published in 2005*), Chapter 13 Daemon Processes, there is section that talks about basic rules to coding a daemon, here the author notes:

> Under System V based systems, some people recommend calling fork again at this point and having the parent terminate. The second child continues as the daemon. This guarantees that the daemon is not a session leader, which prevents it from acquiring a controlling terminal under the System V rules.

Under System V rules, a session can have a single controlling terminal and only the session leader can establishes the connection to the controlling terminal. Tracing the origin of this technique, I found Patrick Horgan in [comp.unix.programmer](https://web.archive.org/web/20060526061648/http://www.erlenstar.demon.co.uk/unix/faq_toc.html) FAQ (*published 1996*), on section [1.7 How do I get my program to act like a daemon?](https://web.archive.org/web/20050712013045/http://www.erlenstar.demon.co.uk/unix/faq_toc.html#TOC16) describes process of creating a daemon process as follows:

> Here are the steps to become a daemon:
>
> 1. `fork()` so the parent can exit, this returns control to the command line or shell invoking your program. This step is required so that the new process is guaranteed not to be a process group leader. The next step, `setsid()`, fails if you're a process group leader.
> 2. `setsid()` to become a process group and session group leader. Since a controlling terminal is associated with a session, and this new session has not yet acquired a controlling terminal our process now has no controlling terminal, which is a Good Thing for daemons.
> 3. `fork()` again so the parent, (the session group leader), can exit. This means that we, as a non-session group leader, can never regain a controlling terminal.
> 4. `chdir("/")` to ensure that our process doesn't keep any directory in use. Failure to do this could make it so that an administrator couldn't unmount a filesystem, because it was our current directory. [Equivalently, we could change to any directory containing files important to the daemon's operation.]
> 5. `umask(0)` so that we have complete control over the permissions of anything we write. We don't know what umask we may have inherited. [This step is optional]
> 6. `close()` fds 0, 1, and 2. This releases the standard in, out, and error we inherited from our parent process. We have no way of knowing where these fds might have been redirected to. Note that many daemons use `sysconf()` to determine the limit `_SC_OPEN_MAX`. `_SC_OPEN_MAX` tells you the maximun open files/process. Then in a loop, the daemon can close all possible file descriptors. You have to decide if you need to do this or not. If you think that there might be file-descriptors open you should close them, since there's a limit on number of concurrent file descriptors.
> 7. Establish new open descriptors for stdin, stdout and stderr. Even if you don't plan to use them, it is still a good idea to have them open. The precise handling of these is a matter of taste; if you have a logfile, for example, you might wish to open it as stdout or stderr, and open `/dev/null` as stdin; alternatively, you could open `/dev/console'` as stderr and/or stdout, and `/dev/null` as stdin, or any other combination that makes sense for your particular daemon.

So reason behind double-forking is to become a truly non-interactive background process by preventing the daemon to acquire a controlling terminal ever again. At (2) calling [setsid(2)](https://man7.org/linux/man-pages/man2/setsid.2.html) not only makes the process the session leader, but also breaks any association with any existing controlling terminal and subsequent fork at (3) seals the deal.

When following this practice —as a side of effect— daemon process is guaranteed to get re-parented to [init(1)](https://man7.org/linux/man-pages/man1/init.1.html) and hence an existing session manager process loses its control over receiving `SIGCHILD`, but here having `PR_SET_CHILD_SUBREAPER` makes it possible to regain control.

Interestingly some other books like UNIX Internals A Practical Approach (*published in 1996*) and UNIX System V Network Programming (*published in 1993*) do not advise the double-forking practice, but rather (1)`fork()` (2)`setsid()` and then making sure to set `O_NOCTTY` flag if opening any new terminal device.

Excerpt from UNIX Internals A Practical Approach, Section 2.9.1 Daemon Processes:

> To achieve the desired effect the process must call fork(S) and the parent process should then call the exit(S) or exit(S) system calls.  The child process is now running in a separate process group from the shell and is not a process group leader. This allows the process to call setsid(S) to create a new session in order to divorce itself from its controlling terminal. The process then becomes the session leader and sole member of the newly created session. It is also the process group leader of a newly created process group whose process group ID is set to the process ID of the child process. The process must take care when opening subsequent files. If a file is a terminal device and the O_NOCTTY flag is not passed to open(S), the kernel sets the terminal to be the controlling terminal of the process. This is not the required behavior for a daemon.



Excerpt from UNIX System V Network Programming, section Creating Daemons:

> daemon needs to disassociate itself from the controlling terminal. This prevents signals from the terminal from affecting the daemon and allows the terminal to be reallocated as the controlling terminal for later sessions. Disassociation can be performed by creating a new session for which the daemon will be the session leader. By leaving the old session, the daemon process forces the disassociation between itself and the old session' s controlling terminal. The one drawback with this course of action is the next terminal device that the daemon opens will be allocated as the daemon's controlling terminal, as long as the device is not already some other session' s controlling terminal. This can be avoided by specifying the O_NOCTTY flag to open.
