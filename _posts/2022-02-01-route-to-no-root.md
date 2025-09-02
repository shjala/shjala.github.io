---
layout: post
title: Rethinking SETUID root, Historical Approaches to Least Privilege
date: 2022-02-01
author: Shahriyar Jalayeri
comments: true
categories: [unix, caps]
---

#### Introduction
The principle of least privilege has been a cornerstone of computer security for decades, yet achieving it on Linux remains surprisingly difficult. Despite being introduced nearly half a century ago [1], the operating system’s reliance on mechanisms like setuid continues to force applications into broader privilege boundaries than they actually need. In this post, I’ll walk through the history and notable attempts, both redesigns of the OS itself and creative uses of existing features.

#### Xenix's early attempt in 1987
Xenix[2] was one of the earliest attempts to create a secure version of Unix. Xenix followed the traditional subjects, objects, and the access privilege set, to enforce security and accountability policies. In Xenix subjects are unique and _**non-reusable**_ PIDs and objects are : processes, files, devices, pipes, etc. Xenix use a ACL semantic similar to Multics[3], a mandatory access control modeled after Bell-LaPadula[4] and supports SETUID/SETGID mode.

First to secure the SETUID mode, write is disallowed for SETUID programs, attempt to open a SETUID file with write flag results in drop of SETUID privilege. The second introduced security change is an **explicit user command** to kernel through a trusted path. This path is mainly used for system-calls like `chmod`, to prevent an autonomous malicious program to steal user's credentials or create a backdoored SETUID program.

In Xenix, the trusted path was implemented using the Secure Attention Key (SAK) concept. Pressing the SAK (a special key combination recognized by the terminal driver) would invoke a minimal, verified shell that ran as part of a trusted process. This mechanism ensured that users could communicate directly with the kernel or trusted processes without interference. By design, no untrusted process could interpose itself, meaning interception, modification, delay, or replay of user–kernel communication was impossible.

The kernel’s restricted shell also enforced separation of security management functions. Instead of granting superuser rights, it spawned a dedicated trusted process for each administrative command. These processes do not require superuser privileges exposed only the necessary interfaces and executed with the minimum privileges required.

#### Compartmented Mode Prototypes in 1990
Emerge of Compartmented Mode Workstation (CMW) [5] was the earliest attempt that I could find that tried to integrate (POSIX like) capabilities in the operating system design to break down the super-user privileges[^1]. CMW find access controls mechanics often too coarse and tries to solve it by introducing an "allowance", such that processes with “privileges” could ***bypass*** some, or all, of the security restrictions and implement their own security-related functions.

In CMW an executable file has a privilege set associated to it. When a file is executed, the privileges set becomes the process’s maximum privilege set (similar to Linux's _Permitted_ capability set). However, in the interest of ensuring that processes execute with the minimum number of privileges necessary to accomplish their task, processes start executing with no privileges in effect (similar to Linux's _Effective_ capability set and [_exec(3)_](https://man7.org/linux/man-pages/man3/exec.3.html) behavior). Processes must explicitly request a specific privilege for it to become effective.

CMW formulates Orange Book[6] access control definition to Process Sensitivity Level, and to perform the access control checks a kernel function `maccess` was developed. `maccess` compares the subject’s sensitivity level and the object’s sensitivity level. In addition `maccess` also checked the process extra privileges that allow it to bypass security features, for example if sensitivity level of the process _**doesn't**_ dominates the sensitivity level of the object, but it is executing with the privilege (read capability) to read above its current sensitivity level, `maccess` simply grants the access.

In the following example[7] you can see how `forceprivs` was used to enable just the necessary privilege for changing a process sensitivity level (`SEC_CHSUBJSL` allows changes to subject sensitivity label) and finally `seteffprivs` restored the process privilege state back to the saved state:
```c
/* Turn on only privileges needed to allow user to change levels */
if (forceprivs(privvec(SEC_CHSUBJSL, SEC_CVTLABEL, -1), save_privs)== 0) {
    /* Get user’s desired level */
    fprintf (stderr, “Enter desired sensitivity label: ”);
    fgets (string1, 199, stdin);

    /* Convert from named level to internal representation */
    if ((iri = mand_er_to_ir (string1)) == NULL) {
        exit(1);
    }

    /* Set user’s desired level. Will fail if not dominated by user’s clearance */
    if (setslabel (iri)) {
        fprintf (stderr, “Not authorized\n”);
        psecerror(“Error”);
    }
    else {
        /* Check and be sure it worked */
        getslabel (iro);
        fprintf (stderr, “New sensitivity level for process: %s\n” mand_ir_to_er (iro));
}

/* Restore privileges user had on entrance */
(void)seteffprivs(save_privs, NULL);
```

The following figure shows available privileges in VirtualVault [8], a CMW Operating System released in 2000s. You can trace the similarities with some of the current POSIX/Linux capabilities:

| ![CMW Capabilities](\assets\img\posts\no-root\cmw_capabilities.jpg) |
|:--:|
| *Figure 1 : CMW Capabilities* |

#### Sendmail's attempt at 1993
Case of Sendmail is "an exercise in the application of the concept of least privilege"[9]. Support for capabilities dose not exist yet, Unix daemons are commonly running as super-user and a vulnerability in complex mail systems can easily result in a Internet worm.

At this time, the mail system architecture consists of three parts: a frontend mail viewer/creator, the middle man (sendmail), and the backend local mail delivery agent. The frontend is a complex piece, consist of tools for viewing and saving incoming mail and composing outgoing messages, but normally doesn't need to run with super-user privilege. The backend normally runs as root since it needs to write to every user's mailbox at `/var/spool/mail/<username>`.

The Sendmail was running as super-user to handle a few different tasks. It was used to handle outgoing messages, accept incoming SMTP mail and was invoked administratively to updated configuration files. In an earlier attempt, to remove the need for super-user privilege, Xenix mail tried to utilize existing DAC:

> The mail middlemen and backends are made setgid mail, rather than setuid root. The various mail configuration files, directories and mailboxes are then set up to be writable by group mail. This allows the whole mail system to work without any exemption from discretionary access control. Mail administration (e.g. compiling alias files) requires only membership in group mail, rather than root ID. Only mail-related files are (installed) in this group, so granting mail administration rights does not grant any other extraordinary rights.

But this turned out to be problematic for Sendmail, since a privileged (root) access is required for initial setup and in realty the configuration is quite complex and prone to error. Carson suggested two approaches to secure Sendmial with adherence to POLP:

1. Since super-user privilege is required to accept connections at user's level, in the Sendmail daemon the privilege is dropped except around the accept call. Sendmail then *1)* determines the user privilege needed to handle the message, *2)* creates a child process with corresponding privilege, *3)* child process permanently drops all the privileges before handling the message.
2. Conceptually similar to first approach, a privileged inetd-like program would listen for and accept new connections, then it invokes a non-privileged Sendmail at the appropriate level to handle the SMTP traffic.

Later Postfix[10] and popa3d[11] followed similar design to avoid a SETUID root program processing untrusted information.

#### 1997-1999 Birth of Linux Capabilities

In 1997 IEEE Standard 1003.1e draft[12] was published, this standard amongst other security related advances, introduced POSIX Capabilities. Around the same time Linux kernel version 2.2 with capability support was released, in 1998 Linux Capabilities FAQ version 0.1 by Alexander Kjeldaas [13] was published Linux kernel List and later in 1999 refined to v0.2 by Boris Tobotras [14]. It took 14 years for the first manpage[15] to appear in Linux Kernel List in 2012.

#### 2002 Plan9's Invovating Factotum

Factotum[16] is one the many innovations that came out of Plan9 and it is one of my personal favorites. In a nutshell, *factotum* allows an unprivileged process to switch to an authorized UID! this is in contrast to current Linux security model that allows a program with `CAP_SETUID` capability or SETUID root to switch to an arbitrary UID. Using *factotum*, a system can have a unprivileged *logind* or *su*, preventing the risk that comes from vulnerabilities found in those critical programs.

In more details, *factotum* works as follows:

> A kernel device driver implements two files, `/dev/caphash` and `/dev/capuse`. The write-only file `/dev/caphash` can be opened only by the host owner, and only once. Factotum opens this file immediately after booting.

Now when a program like *login* needs to change its identity, by running an authentication protocol it proves to the host owner’s factotum (host owner is a user that owns the local resources of a machine, weakly analogues to Unix root, but with no special power) that it has the required credentials to run as the requested identity. Upon successful authentication:

> *factotum* creates a string of the form userid1@userid2@<random-string>, uses SHA1 HMAC to hash userid1@userid2 with key being <random-string>, and writes that hash to `/dev/caphash`. *factotum* then passes the original string to *login* on the same machine, running as user userid1, which writes the string to `/dev/capuse`. The kernel hashes the string and looks for a matching hash in its list. If it finds one, the writing processes user id changes from userid1 to userid2. Once used, or if a timeout expires, the capability is discarded by the kernel.

| ![Factotum Flow](\assets\img\posts\no-root\factotum.png) |
|:--:|
| *Figure 2 : Factotum Flow* |

The above figure sums up the *factotum* working flow. At some point there was an attempt to bring Factotum to Linux[17]. The driver[18] once lived in the staging tree `drivers/staging/`, but eventually got removed. Later it got revived through an attempt to make login unprivileged[19] but that also didn't last.

This problem is so prominent in Linux that in an earlier attempt Provos Et al.[20] tried to implement a similar solution to prevent privilege escalation in OpenSSH, they proposed to export state of the unprivileged child process to the privilege parent for UID switching. Authors tried to achieve this in a unmodified Linux system without any kernel changes.

In the proposed design, a Monitor is running with super-user privilege exposing a limited set of IPC procedures, upon accepting a connection it forks a standard unprivileged process (switches to unused UID/GID and chroot to a empty directory with no read/write access), unprivileged child process then handles the key exchange and authentication using exposed parent IPC, upon success it exports session data (algorithm, secret keys, sequence numbers, compression state, etc.) to the parent process, parent then forks to the *authenticated user* and imports the session data to continue the communication. The following figure sums it up nicely:


| ![OpenSSH](\assets\img\posts\no-root\openssh.JPG) |
|:--:|
| *Figure 3 : Unprivileged OpenSSH Design* |

#### Conclusion

Unfortunately completely removing SETUID root binaries and not relying on `CAP_SETUID` still remains unsupported in Linux (at least for UID switching), there were even more attempts to solve this problem than what I've listed here, from FD revocation to using LSM to granting special access for privilege operation, but none become officially part of Linux. Capabilities in Linux are coarse[21] and to make them work securely we need complex configuration and system re-design (e.g. *securebits*[22]).


[^1]: actually a series of documents related to CMW was published between 1980 to 1985 by US Defense Intelligence Agency, but I couldn't find a copy.

------

##### References

[1] Saltzer, Jerome H., and Michael D. Schroeder. "The protection of information in computer systems." *Proceedings of the IEEE* 63.9 (1975): 1278-1308.

[2] Gligor, Virgil D., et al. "Design and implementation of secure Xenix." *IEEE Transactions on Software Engineering* 2 (1987): 208-221.

[3] Saltzer, Jerome H. "Protection and the control of information sharing in Multics." *Communications of the ACM* 17.7 (1974): 388-402.

[4] Bell, D. Elliott, and Leonard J. LaPadula. *Secure computer systems: Mathematical foundations*. MITRE CORP BEDFORD MA, 1973.

[5] Berger, Jeffrey L., et al. "Compartmented mode workstation: Prototype highlights." *IEEE Transactions on Software Engineering* 16.6 (1990): 608-618.

[6] Latham, Donald C. "Department of defense trusted computer system evaluation criteria." *Department of Defense* (1986).

[7] Rome, James. "Compartmented mode workstations." *Oal Ridge National Laboratory. http://www.ornl.gov/jar/doecmw.pdf April* 23 (1995).

[8] Hewlett-Packard. “VirtualVault Operating System Reference.” *Cbn.Gov.Ng*, 1999, www.cbn.gov.ng/out/Publications/bullion/ITD/2004/b5413-90058.pdf.

[9] Carson, Mark E. "Sendmail without the Superuser." *4th {UNIX} Security Symposium ({UNIX} Security 93)*. 1993.

[10] Venema, Wietse. “Postfix Overview.” *Postfix*, 2002, www.postfix.org/motivation.html.

[11] Designer, Solar. “The Design of Popa3d.” *Openwall*, 2002, www.openwall.com/popa3d/DESIGN.shtml.

[12] Portable Application Standards Committee. "Draft Standard for Information Technology–Portable Operating System Interface (POSIX) Part 1: System Application Program Interface (API)–Amendment m: Checkpoint/Restart Interface." *IEEE Computer Society, p1003. 1m/*.

[13] Kjeldaas, Alexander. “Linux Capability FAQ v0.1.” *Linux-Kernel Archive*, 1998, lkml.iu.edu/hypermail/linux/kernel/9808.1/0178.html.

[14] Tobotras, Boris. “Linux Capabilities FAQ 0.2.” *Linux-Kernel Archive*, 1999, mirrors.edge.kernel.org/pub/linux/libs/security/linux-privs/kernel-2.2/capfaq-0.2.txt.

[15] Lutomirski, Andy. “Document How Capability Bits Work.” *LWN.Net*, 2012, lwn.net/Articles/528542.

[16] Cox, Russ, et al. "Security in Plan 9." *USENIX Security Symposium*. Vol. 2. 2002.

[17] Ganti, Ashwin. "Plan 9 authentication in Linux." *ACM SIGOPS Operating Systems Review* 42.5 (2008): 27-33.

[18] Hallyn, Serge E. “P9auth: Add P9auth Driver.” *The Linux Kernel Mailing List Archive*, 2010, lkml.org/lkml/2010/4/20/406.

[19] Hallyn, Serge, and Jonathan T. Beard. "Unprivileged login daemons in Linux." *Linux Symposium*. 2010.

[20] Provos, Niels, Markus Friedl, and Peter Honeyman. "Preventing Privilege Escalation." *USENIX Security Symposium*. 2003.

[21] Spengler, Brad. “False Boundaries and Arbitrary Code Execution.” *Grsecurity Forums*, 2011, forums.grsecurity.net/viewtopic.php?t=2522.

[22] “Capabilities(7).” *Linux Manual Page*, man7.org/linux/man-pages/man7/capabilities.7.html. Accessed 1 Feb. 2022.
