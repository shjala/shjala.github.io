---
layout: post
title: Implementing Authorization on Linux local IPC using SO_PEERCRED
date: 2022-05-21
author: Shahriyar Jalayeri
comments: true
categories: [unix]
---

We are using many different local IPC protocols (dbus, someip, thrift, ...) in our system and often developers face a security problem that can't be easily solved by MAC or DAC. Usually there is an endpoint which implements multiple interfaces over a UNIX domain socket, equally there are multiple clients which consume this interfaces, so access to the socket file has to be granted to all of them, and we can't rely DAC or MAC to provide access control at the interface level (sure breaking down the interface to multiple applications can help, but often too costly).

Having peer credentials (UID/GID) can certainty help in this situation, with these information, IPC server can implement additional access control mechanism at interface level to limit it's service to different clients which all run in the same operating system. There are a few ways to get the peer credential from an UNIX domain socket fd. You can get the PID and query `/proc/<pid>/status` which is not recommended (for reason of PID race condition), there is [SCM_CREDENTIALS](https://man7.org/linux/man-pages/man7/unix.7.html) but it needs cooperation from the client, and finally there is [SO_PEERCRED](https://man7.org/linux/man-pages/man7/unix.7.html) which can be used to simply ask kernel for credential information in one call:

```
// excerpt from sock_getsockopt
	case SO_PEERCRED:
	{
		struct ucred peercred;
		if (len > sizeof(peercred))
			len = sizeof(peercred);

		spin_lock(&sk->sk_peer_lock);
		cred_to_ucred(sk->sk_peer_pid, sk->sk_peer_cred, &peercred);
		spin_unlock(&sk->sk_peer_lock);

		if (copy_to_user(optval, &peercred, len))
			return -EFAULT;
		goto lenout;
	}
```

This is already implemented in some of the well-known IPC mechanism, for example in dbus you can ask for peer credentials using [GetConnectionCredentials](https://dbus.freedesktop.org/doc/dbus-specification.html), COVESA implementation of SOME/IP has security [configuration](https://github.com/COVESA/vsomeip/blob/17cc55f24d1c56f6a5dcca6065a227ca91d01c90/config/vsomeip-local-security.json#L28) base on UID/GID, and in Thrift the actual socket fd is usually accessible trough the transport class and call to getsockopt(SO_PEERCRED) can be easily made.

If you want to be extra, there is always [SO_PEERSEC](https://lwn.net/Articles/62370/) ;)
