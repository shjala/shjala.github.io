---
layout: post
title: Defeating Windows Kernel Driver Singing Enforcement, Not That Hard!
date: 2012-11-04 12:51
author: Shahriyar Jalayeri
comments: true
categories: [oldblog, exploiting]
---

<div dir="ltr" lang="en">

<p style="text-align:justify;">These days everybody talks about Driver Signing Enforcement, and the ways we can bypass it. <a href="http://j00ru.vexillium.org/?p=1169" target="_blank">J00ru talked about the hard way</a>, and I tell you about the easy and very long know way. What we need is just a Singed Vulnerable X64 Driver. As we know, loading drivers require administrator privilege, but these days a normal user with default UAC setting can silently achieve Admin privilege without popping up a UAC dialog.</p>
<p style="text-align:justify;">The driver I was talking about is DCR from DriveCrypt. The X64 version is singed and is vulnerable to a write4 bug.</p>
<p style="text-align:center;"><a href="\assets\img\posts\dcr.png"><img class="aligncenter  wp-image-31" title="DCR.sys Write4" alt="" src="\assets\img\posts\dcr.png" height="231" width="646" /></a></p>
<p style="text-align:justify;">the latest version is not anymore vulnerable but this version still has a valid signature and that’s enough.</p>
<p style="text-align:justify;"><a href="\assets\img\posts\dcr_sig.png"><img class="aligncenter size-full wp-image-30" title="DCR.sys Signature" alt="" src="\assets\img\posts\dcr_sig.png" height="489" width="419" /></a></p>
<p style="text-align:justify;">I think it's obvious that you can make the whole process of escalating privilege from normal user to Admin for loading vulnerable drive ( silently with one of <a href="http://www.pretentiousname.com/misc/win7_uac_whitelist2.html" target="_blank">UAC bypass methods</a>) and exploitation pragmatically automatic.</p>
You can find vulnerable version of drive along the exploit at "<a href="https://gitlab.com/shahjal/drivecrypt-exp" target="_blank">DriveCrypt\x64\Release</a>".

</div>

---

<p><strong>This is imported from my old WP blog, some links might be broken, <a href="https://repret.wordpress.com/2012/11/04/bypassing-driver-singing-not-that-much-hard/">original post</a>.</strong></p>
