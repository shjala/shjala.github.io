---
layout: post
title: TPM Fault Injection
date: 2025-09-03
author: Shahriyar Jalayeri
comments: true
categories: [tpm]
---

[EVE OS](https://lfedge.org/projects/eve/) uses TPM as one of its core security components. A while back I was trying to make the TPM related functionality more robust in presence of faulty TPMs, so I wrote a small tool to inject faults into the TPM and test the system's resilience.

The tool is ebpf-based and it's fault injection capabilities are simple (based on what I needed at the time). It can basically intercept TPM commands and responses at the kernel level with modifies response error codes to simulate various failure scenarios. Check out the [source code](https://github.com/shjala/tpm-fault-injection/), maybe it can be useful for you.
