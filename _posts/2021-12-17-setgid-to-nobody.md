---
layout: post
title: Why setgid to nobody?
date: 2021-12-17
author: Shahriyar Jalayeri
comments: true
categories: [unix]
---

Today while I was looking at the SSH's agent design for privilege separation, I learned a small trick used to prevent [ptrace(2)](https://man7.org/linux/man-pages/man2/ptrace.2.html)'ing a process, even if it is running with same cred as logged in user. A ssh-agent holds cryptographic keys in its memory, so to prevent accessing its memory using `ptrace`, developers set the process primary group to `nobody`  (safe to say it owns no file) and then made it *setgid*.

The requirement to `ptrace` a remote process is either having a `CAP_SYS_PTRACE` in the **tracee's user-namespace** or tracing process must have the same real/effective/saved UID and GID as the target process, and obviously being *setuid* or *setgid* binary **breaks this [equality](https://elixir.bootlin.com/linux/v5.15.11/source/kernel/ptrace.c#L332) even if they both are running under same real UID**:

```c
// excerpt from __ptrace_may_access
if (uid_eq(caller_uid, tcred->euid) &&
    uid_eq(caller_uid, tcred->suid) &&
    uid_eq(caller_uid, tcred->uid)  &&
    gid_eq(caller_gid, tcred->egid) &&
    gid_eq(caller_gid, tcred->sgid) &&
    gid_eq(caller_gid, tcred->gid))
        goto ok;
```

Looking at a piece of history from [2002](https://lists.debian.org/debian-ssh/2002/10/msg00003.html), when some one asked about the *setgid-to-nobody*: 

> ...making ssh-agent setgid, other processes are prevented from using ptrace to attach to ssh-agent and steal secrets. the group is of no consequence. It's the fact that the binary is setgid anygroup that's important.

BSD also has a similar mechanism implemented, after a credential change kernel sets `P_SUGID` flag for the process, which prevents it receiving signals or getting traced by any other user except root. In Linux, there is a another way to prevent tracing process with same credentials, which can be done by simply setting the `PR_SET_DUMPABLE` to `SUID_DUMP_DISABLE` using [prctl(2)](https://man7.org/linux/man-pages/man2/prctl.2.html) at startup. This attribute is also [checked](https://elixir.bootlin.com/linux/v5.15.11/source/kernel/ptrace.c#L356) by `ptrace` before any trace attempt:

```c
// excerpt from __ptrace_may_access
if (mm && ((get_dumpable(mm) != SUID_DUMP_USER) && !ptrace_has_cap(mm->user_ns, mode)))
    return -EPERM;
```

Another way to make the process not dumpable (without touching the code) is to make the binary **not readable by the user that is executing it**, doing so will [set](https://elixir.bootlin.com/linux/v5.15.11/source/fs/exec.c#L1411) the `BINPRM_FLAGS_ENFORCE_NONDUMP` in the `linux_binprm.interp_flags` of the executing binary:

```c
// excerpt from would_dump
struct inode *inode = file_inode(file);
struct user_namespace *mnt_userns = file_mnt_user_ns(file);
if (inode_permission(mnt_userns, inode, MAY_READ) < 0) {
    struct user_namespace *old, *user_ns;
    bprm->interp_flags |= BINPRM_FLAGS_ENFORCE_NONDUMP;
    [...]
}
```

`would_dump` is called right before [begin_new_exec](https://elixir.bootlin.com/linux/v5.15.11/source/fs/exec.c#L1280) finishes.
