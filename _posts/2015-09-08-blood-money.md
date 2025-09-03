---
layout: post
title: Write up for Iranian Society of Cryptology CTF
date: 2015-09-08 10:51
author: Shahriyar Jalayeri
comments: true
categories: [oldblog, re]
---

<div dir="ltr" lang="en">

<p style="text-align:justify;">This is my write-up for Amnpardaz (Iranian AV company, I’ve <a href="https://github.com/shjalayeri/Padvish-AV">played</a> with their products before) and ISC (Iranian Society of Cryptology) Ransomware’s data decryption challenge. I’m not lying, it was really easy comparing to CTFs that I’ve played (and failed ;) ). It was three steps in total, you get a bunch of files for each step and you most decrypt them in order to get the next step email address.</p>

<h2><strong>Step One</strong></h2>
<p style="text-align:justify;">We have a screenshot from the Ransomware’s window which says your files got encrypted with <em><strong>AES-256</strong></em> blah blah blah, a <strong><em>solveme.gif</em></strong> which we most decrypt in order to get the next level email address, and a <em><strong>PCAP file</strong></em> which contains network traffic at infection time. Obviously we most get encryption key from the PCAP file.</p>
<p style="text-align:justify;">I used <a href="https://github.com/madpowah/ForensicPCAP">forensicPCAP</a> for examining the PCAP file. forensicPCAP is python script based on scapy for Network Forensics. The given PCAP has 12026 packets captured inside, I started by looking on HTTP traffic:</p>
<p style="text-align:justify;"><a href="\assets\img\posts\1.png"><img class="size-large wp-image-50 aligncenter" src="\assets\img\posts\1.png?w=660" alt="PCAP's web traffic" width="660" height="420" /></a></p>
<p style="text-align:justify;">As I expected there were some many of it, so I decided to take a look at DNS traffics to see if there is any unusual DNS requests or any random looking domain (like what a domain generation algorithm may produce). My suspicion was right and there was a domain that looks randomly generated in DNS records list:</p>
<a href="\assets\img\posts\2.png"><img class="size-large wp-image-51 aligncenter" src="\assets\img\posts\2.png?w=660" alt="DGA domain" width="660" height="419" /></a>

<br><br>>Next thing I do was checking the DNS packet to find the domain IP address:

<pre>
<code>
###[ DNS ]###
           id        = 60305
           qr        = 1L
           opcode    = QUERY
           aa        = 1L
           tc        = 0L
           rd        = 1L
           ra        = 1L
           z         = 0L
           rcode     = ok
           qdcount   = 1
           ancount   = 1
           nscount   = 1
           arcount   = 1
           \qd        \
            |###[ DNS Question Record ]###
            |  qname     = 'www.qwleofjwih.com.'
            |  qtype     = A
            |  qclass    = IN
           \an        \
            |###[ DNS Resource Record ]###
            |  rrname    = 'www.qwleofjwih.com.'
            |  type      = A
            |  rclass    = IN
            |  ttl       = 86400
            |  rdlen     = 4
            |  rdata     = '91.226.213.198'
           \ns        \
            |###[ DNS Resource Record ]###
            |  rrname    = 'qwleofjwih.com.'
            |  type      = NS
            |  rclass    = IN
            |  ttl       = 86400
            |  rdlen     = 20
            |  rdata     = 'ns1.qwleofjwih.com.'
           \ar        \
            |###[ DNS Resource Record ]###
            |  rrname    = 'ns1.qwleofjwih.com.'
            |  type      = A
            |  rclass    = IN
            |  ttl       = 86400
            |  rdlen     = 4
            |  rdata     = '91.226.213.198'

</code>
</pre>

Then I checked the corresponding packets and found a GZIP encoded reply from the web server:

<a href="\assets\img\posts\3.png"><img class="size-large wp-image-52 aligncenter" src="\assets\img\posts\3.png?w=660" alt="DGA domain's traffic" width="660" height="421" /></a>

Decoding the data and gave me this:

<pre>
<code>
{id:&quot;23945yr8',bit:&quot;3wkh8C3AU4tdKQ==&quot;,p:&quot;vXc1ARd1dNWdFELzZ9TpfuEe8vYwLJcqMzluPHp42TE=&quot;,t:&quot;138542922&quot;,k:&quot;34VJcOLfchVZTFD/gPmwyQ==&quot;}
</code>
</pre>

<p style="text-align:justify;">Then I wrote a python script to decrypt the given GIF file, deleted two junk bytes from beginning of the file to got the next level e-mail address.</p>
<a href="\assets\img\posts\4.gif"><img class="size-large wp-image-53 aligncenter" src="\assets\img\posts\4.gif?w=660" alt="Next level mail address" width="660" height="294" /></a>
<h2><strong>Step Two</strong></h2>
<p style="text-align:justify;">Incident report says encryption algorithm is AES and we have <em><strong>solveme-enc.jpg</strong></em> which again we most decrypt, a bunch of files from a compromised <em><strong>Drupal</strong></em> website that used by Ransomware as some sort of key generation source.</p>
<p style="text-align:justify;">I started by looking at the <em><strong>CHANGELOG</strong> </em>of the given Drupal, got the Drupal version, downloaded the original one and started diffing the files. The only noticeable changes were in <em><strong>databse.in</strong><strong>c</strong></em>:</p>
<p style="text-align:justify;"><a href="\assets\img\posts\5.png"><img class="size-large wp-image-54 aligncenter" src="\assets\img\posts\5.png?w=660" alt="Drupal comparison" width="660" height="82" /></a></p>
<p style="text-align:justify;">I seems to me like lousy key generation algorithm. The only problem here for getting the right key is <em><strong>time()</strong></em> function which used as a <em><strong>seed</strong></em> to PHP random number generator, So I needed the exact <em><strong>EPOCH time</strong></em> to get the same key as malware got in the infection process. For getting the right time, I checked the given 7zip file, and there I see the <em><strong>solveme-enc.jpg</strong></em>'s last modification time.</p>
<p style="text-align:justify;"><a href="\assets\img\posts\61.png"><img class="size-full wp-image-59 aligncenter" src="\assets\img\posts\61.png" alt="JPEG's last modification time" width="623" height="115" /></a></p>
<p style="text-align:justify;">Unfortunately it misses the seconds, so I wrote another simple python script to generate a PHP script with EPOCH times in range of <em><strong>10:34 PM</strong></em>. Then I had a file like this which produced some keys after I ran it through:</p>


<pre>
<code>
mt_srand(1440957610);for ($i=0;$i&lt;128/8;$i++) echo sprintf(&quot;%02x&quot;, mt_rand(0,255)); echo &quot;&lt;/br&gt;&quot;;
mt_srand(1440957611);for ($i=0;$i&lt;128/8;$i++) echo sprintf(&quot;%02x&quot;, mt_rand(0,255)); echo &quot;&lt;/br&gt;&quot;;
mt_srand(1440957612);for ($i=0;$i&lt;128/8;$i++) echo sprintf(&quot;%02x&quot;, mt_rand(0,255)); echo &quot;&lt;/br&gt;&quot;;
mt_srand(1440957613);for ($i=0;$i&lt;128/8;$i++) echo sprintf(&quot;%02x&quot;, mt_rand(0,255)); echo &quot;&lt;/br&gt;&quot;;
mt_srand(1440957614);for ($i=0;$i&lt;128/8;$i++) echo sprintf(&quot;%02x&quot;, mt_rand(0,255)); echo &quot;&lt;/br&gt;&quot;;
mt_srand(1440957615);for ($i=0;$i&lt;128/8;$i++) echo sprintf(&quot;%02x&quot;, mt_rand(0,255)); echo &quot;&lt;/br&gt;&quot;;
[...]
</code>
</pre>


<p style="text-align:justify;">Again with help of another python script, I was able to decrypt the given file with each key until I found one of them actually got decrypts as valid JPEG file. Diffing it with the original famous picture, revealed the next level email.</p>
<a href="\assets\img\posts\7.png"><img class="size-large wp-image-55 aligncenter" src="\assets\img\posts\7.png?w=660" alt="Next level email address" width="660" height="66" /></a>
<h4>Update :</h4>
<a href="https://twitter.com/pwnslinger">@pwnslinger</a> <a href="https://twitter.com/pwnslinger/status/641348232694464513">pointed out</a> that no brute-force is needed, exact seed is <strong><em>filetime(solveme-enc.jpg) . </em></strong>
<h2><strong>Step Three</strong></h2>
Yes, here is the fun part ;) We are given a <em><strong>PE</strong></em> and a <em><strong>Result.txt</strong></em> file, we most decrypt the <em><strong>Result.txt</strong></em>.
<p style="text-align:justify;">The given PE was packed with a custom packer, I used the old fashion PUSHAD/POPAD and hardware break points to get to the OEP and then dumped the unpacked version.</p>
<p style="text-align:justify;"><a href="\assets\img\posts\8.png"><img class="size-full wp-image-56 aligncenter" src="\assets\img\posts\8.png" alt="Packed binary" width="152" height="309" /></a></p>
<p style="text-align:justify;">OpenSSL debug string and asserts helped me a bit to understand the program flow, it started by generating a 2048 RSA key and used the this freshly generated key to encrypt the result.txt content :</p>


<pre>
<code>
.rsrc:00401AF0                 push    ebp
.rsrc:00401AF1                 mov     ebp, esp
.rsrc:00401AF3                 sub     esp, 144h
.rsrc:00401AF9                 push    0
.rsrc:00401AFB                 push    0
.rsrc:00401AFD                 push    10001h
.rsrc:00401B02                 push    800h
.rsrc:00401B07                 call    RSA_generate_key
[...]
.rsrc:00402851                 lea     eax, [ebp+var_38]
.rsrc:00402854                 push    eax             ; output_buffer
.rsrc:00402855                 mov     ecx, [ebp+var_4]
.rsrc:00402858                 push    ecx             ; data size
.rsrc:00402859                 mov     edx, [ebp+var_154]
.rsrc:0040285F                 push    edx             ; rsa key
.rsrc:00402860                 mov     eax, [ebp+var_170]
.rsrc:00402866                 push    eax             ; data
.rsrc:00402867                 call    sub_401F80
</code>
</pre>

<p style="text-align:justify;">Then it encodes the newly generated RSA private key using base64 encoding (function renamed manually after identification):</p>

<pre>
<code>
.rsrc:00402945                 mov     eax, [ebp+var_164]
.rsrc:0040294B                 push    eax
.rsrc:0040294C                 mov     ecx, [ebp+var_18]
.rsrc:0040294F                 push    ecx
.rsrc:00402950                 mov     edx, ds:dword_49DAD4
.rsrc:00402956                 add     edx, ds:dword_49DAD8
.rsrc:0040295C                 push    edx
.rsrc:0040295D                 mov     eax, [ebp+var_30]
.rsrc:00402960                 push    eax
.rsrc:00402961                 call    base64encode
.rsrc:00402966                 add     esp, 10h
.rsrc:00402969                 mov     [ebp+var_10], eax
</code>
</pre>

<p style="text-align:justify;">After that It decodes the word <em><strong>“challenge”</strong></em> (Xor’ed with some 1 byte key) and passes it to the this function:</p>
<p style="text-align:justify;"><a href="\assets\img\posts\9.png"><img class="size-large wp-image-57 aligncenter" src="\assets\img\posts\9.png?w=660" alt="RC4 init phase" width="660" height="377" /></a></p>
<p style="text-align:justify;">Loop counter (<em><strong>256</strong></em>) and memory writes look suspiciously like a RC4 key initiation phase. Using some trial and error I found that my suspicion was right and it is actually RC4 key initiation. Obviously the next function most be RC4 encryption function, so I renamed it to rc4_enc (after looking at it and making sure its actually RC4 encryption). In next step, program encrypts the base64 encoded RSA private key with the RC4 encryption algorithm:</p>

<pre>
<code>
.rsrc:004029B8                 lea     ecx, [ebp+var_148]
.rsrc:004029BE                 push    ecx             ; key
.rsrc:004029BF                 mov     edx, [ebp+var_164]
.rsrc:004029C5                 sub     edx, 1
.rsrc:004029C8                 push    edx             ; priv key base64 size
.rsrc:004029C9                 mov     eax, [ebp+var_18]
.rsrc:004029CC                 push    eax             ; base 64 priv key
.rsrc:004029CD                 call    rc4_enc
.rsrc:004029D2                 add     esp, 0Ch
.rsrc:004029D5                 jmp     loc_402B3B
</code>
</pre>

<p style="text-align:justify;">After that, encrypted key is passed to another function which <em><strong>Rijndael_Te1</strong></em> string immediately reveals its <em><strong>AES</strong></em> encryption:</p>

<pre>
<code>
.rsrc:0040500A                 mov     eax, ds:Rijndael_Te2[eax*4]
.rsrc:00405011                 mov     ebx, esi
.rsrc:00405013                 shr     ebx, 10h
.rsrc:00405016                 and     ebx, 0FFh
.rsrc:0040501C                 xor     eax, ds:Rijndael_Te1[ebx*4]
.rsrc:00405023                 mov     ebx, edx
.rsrc:00405025                 shr     ebx, 18h
.rsrc:00405028                 xor     eax, ds:Rijndael_Te0[ebx*4]
.rsrc:0040502F                 mov     ebx, edi
.rsrc:00405031                 and     ebx, 0FFh
.rsrc:00405037                 xor     eax, ds:Rijndael_Te3[ebx*4]
.rsrc:0040503E                 mov     ebx, ebp
.rsrc:00405040                 xor     eax, [ecx+10h]
</code>
</pre>

<p style="text-align:justify;">Encryption key for AES phase is constant hex value <em><strong>“726A5C7C475670706F6862567E465E5C”. </strong></em>last encryption phase takes place right before writing the result into the disk, at first glance I thought I might be a variant of some simple encryption algorithms like TEA but I was totally wrong, It was way simpler than TEA :) after a while and being unable to determine the encryption algorithm, I decided to reverse engineer it (it is really small ;) ). Here is the whole code:</p>


<pre>
<code>
.rsrc:00402440 unknown_enc     proc near               ; CODE XREF: sub_402500+892p
.rsrc:00402440
.rsrc:00402440 var_4C          = byte ptr -4Ch
.rsrc:00402440 out_buff        = dword ptr -1Ch
.rsrc:00402440 var_18          = dword ptr -18h
.rsrc:00402440 out_buff_ret    = dword ptr -14h
.rsrc:00402440 var_10          = word ptr -10h
.rsrc:00402440 var_C           = dword ptr -0Ch
.rsrc:00402440 internal_size   = dword ptr -8
.rsrc:00402440 var_4           = dword ptr -4
.rsrc:00402440 inbuff          = dword ptr  8
.rsrc:00402440 size            = dword ptr  0Ch
.rsrc:00402440
.rsrc:00402440                 push    ebp
.rsrc:00402441                 mov     ebp, esp
.rsrc:00402443                 sub     esp, 1Ch
.rsrc:00402446                 push    ebx
.rsrc:00402447                 push    esi
.rsrc:00402448                 push    edi
.rsrc:00402449                 mov     eax, [ebp+size]
.rsrc:0040244C                 sub     eax, 1
.rsrc:0040244F                 mov     [ebp+var_4], eax
.rsrc:00402452                 mov     cx, word ptr [ebp+var_4]
.rsrc:00402456                 mov     [ebp+var_10], cx
.rsrc:0040245A                 mov     edx, [ebp+size]
.rsrc:0040245D                 add     edx, 1
.rsrc:00402460                 mov     [ebp+internal_size], edx
.rsrc:00402463                 mov     eax, [ebp+size]
.rsrc:00402466                 push    eax
.rsrc:00402467                 call    unknown_libname_5 ; Microsoft VisualC 2-10/net runtime
.rsrc:0040246C                 add     esp, 4
.rsrc:0040246F                 mov     [ebp+out_buff], eax
.rsrc:00402472                 mov     ecx, [ebp+out_buff]
.rsrc:00402475                 mov     [ebp+out_buff_ret], ecx
.rsrc:00402478                 pusha
.rsrc:00402479                 mov     esi, [ebp+inbuff]
.rsrc:0040247C                 mov     edi, [ebp+out_buff_ret]
.rsrc:0040247F                 add     edi, [ebp+var_4]
.rsrc:00402482                 inc     edi
.rsrc:00402483                 mov     bx, [ebp+var_10]
.rsrc:00402487                 mov     ebp, [ebp+internal_size]
.rsrc:0040248A
.rsrc:0040248A loc_40248A:                             ; CODE XREF: unknown_enc+A3j
.rsrc:0040248A                 mov     dx, bx          ; size - 1
.rsrc:0040248D                 and     dx, 3
.rsrc:00402491                 mov     ax, 1C7h
.rsrc:00402495                 push    eax
.rsrc:00402496                 sahf
.rsrc:00402497                 jmp     short loc_4024BA ; al = inbuff[i]
.rsrc:00402499 ; ---------------------------------------------------------------------------
.rsrc:00402499
.rsrc:00402499 loc_402499:                             ; CODE XREF: unknown_enc+85j
.rsrc:00402499                 mov     [ebp+var_C], 0
.rsrc:004024A0                 mov     edx, [ebp+var_C]
.rsrc:004024A3                 add     edx, 0Ah
.rsrc:004024A6                 mov     [ebp+var_C], edx
.rsrc:004024A9                 mov     [ebp+var_18], 0Fh
.rsrc:004024B0                 mov     eax, [ebp+var_C]
.rsrc:004024B3                 imul    eax, [ebp+var_18]
.rsrc:004024B7                 mov     [ebp+var_C], eax
.rsrc:004024BA
.rsrc:004024BA loc_4024BA:                             ; CODE XREF: unknown_enc+57j
.rsrc:004024BA                 lodsb                   ; al = inbuff[i]
.rsrc:004024BB                 pushf
.rsrc:004024BC                 db      36h
.rsrc:004024BC                 xor     al, [esp+50h+var_4C] ; 0xc7
.rsrc:004024C1                 xchg    dl, cl          ; 60
.rsrc:004024C3                 jmp     short loc_4024C7
.rsrc:004024C5 ; ---------------------------------------------------------------------------
.rsrc:004024C5                 jmp     short loc_402499
.rsrc:004024C7 ; ---------------------------------------------------------------------------
.rsrc:004024C7
.rsrc:004024C7 loc_4024C7:                             ; CODE XREF: unknown_enc+83j
.rsrc:004024C7                 rol     ah, cl
.rsrc:004024C9                 popf
.rsrc:004024CA                 adc     al, ah          ; 1, 1, 2
.rsrc:004024CC                 xchg    dl, cl
.rsrc:004024CE                 xor     edx, edx
.rsrc:004024D0                 and     eax, 0FFh
.rsrc:004024D5                 add     bx, ax          ; resutl + size
.rsrc:004024D8                 stosb
.rsrc:004024D9                 mov     cx, dx
.rsrc:004024DC                 pop     eax
.rsrc:004024DD                 jecxz   short loc_4024E7
.rsrc:004024DF                 sub     edi, 2
.rsrc:004024E2                 dec     ebp
.rsrc:004024E3                 jnz     short loc_40248A ; size - 1
.rsrc:004024E5                 jmp     short loc_4024E9
.rsrc:004024E7 ; ---------------------------------------------------------------------------
.rsrc:004024E7
.rsrc:004024E7 loc_4024E7:                             ; CODE XREF: unknown_enc+9Dj
.rsrc:004024E7                 xor     eax, eax
.rsrc:004024E9
.rsrc:004024E9 loc_4024E9:                             ; CODE XREF: unknown_enc+A5j
.rsrc:004024E9                 popa
.rsrc:004024EA                 mov     eax, [ebp+out_buff_ret]
.rsrc:004024ED                 pop     edi
.rsrc:004024EE                 pop     esi
.rsrc:004024EF                 pop     ebx
.rsrc:004024F0                 mov     esp, ebp
.rsrc:004024F2                 pop     ebp
.rsrc:004024F3                 retn
.rsrc:004024F3 unknown_enc     endp
</code>
</pre>


<p style="text-align:justify;">Encryption mechanism is bit tricky (saving/restoring EFLAGS and using ADC while carry flag is always set on). After some messy prototypes, I wrote the following C code for the encryption pahse:</p>


<pre>
<code>
void EncryptBuffer(char* input, char* output, int size)
{
    int i = 0;
    char internal_size = size - 1;

    do
    {
        output[size] = (input[i] ^ 0xc7) + __rol(1, (internal_size &amp;amp; 3)) + 1;
        internal_size += output[size];

        size--;
        i++;
    } while (size &gt;= 0);
}
</code>
</pre>

<p style="text-align:justify;">The hard part was writing the decryption phase of the algorithm, I had to produce the same state (internal_size value) for each iteration to get the right input. Again, after playing with it, I wrote the decryption algorithm as follows:</p>


<pre>
<code>
void DecryptBuffer(char* input, char* output, int size)
{
    int i = 0;
    char internal_size = size -1;

    do
    {
        output[i] = (input[size] - (__rol(1, (internal_size &amp;amp; 3)) + 1)) ^ 0xc7;
        internal_size += input[size];

        size--;
        i++;
    } while (size &gt;= 0);
}
</code>
</pre>

<p style="text-align:justify;">Program uses this algorithm to encrypt 3 blocks of 50 bytes each at locations 0, 100 and 200 of the encrypted RSA key buffer (from the last AES step), then It wrote encrypted RSA key alongside the RSA encrypted file content in the result.txt . Getting the RAS key was just matter of doing the same encryption chain in backwards. By doing this, I got the following RSA private key from given <em><strong>result.txt</strong></em> :</p>


<pre>
<code>
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEApibgRXncbyC+YYYkJ63OmsN4H3YfROxKFIKaqV4EIplC5+bA
MdWS6qvCHpoPz3AvhUEXceySjybKIotIY7cbWhO8TANXsUzxsMmuBBXs4ILX8EZv
SiLv5Vva1af4MsXsqYbYM97BL7rOg4bHb8rM1RfmqC50yb+/akLHcCIUjycGFaRd
PNRAijh3QHE/ofr9RpRpROIlameuQEjDBLtYlQi1UxqCu9klmR2/py3Qr7wV20oQ
4o0OhxUrNp0Mzu2Zdg63lmSVWsLcIBzSIReygUTMA8qTZ+0Jl/xB2Vhp4vxLDy5e
WR3sbOD/Q97OXFbx7/F6LP5MNrg2uppR2+2N8QIDAQABAoIBAQCNxeReRBI83LK2
YpCdLuh5FEt+hPs/g2PexmaUGD3tC9uUJ0hd/YBkL3TvScQt2+sgiB8qPZP9BDs8
aJ63PznejbKBJeUAy8f7csvCfrbmB5+cTW2O0+rhSZSb9LyLDmnXadE3yV4MjRjE
EBBDKsfHGKLfZOyQbcY2NI8a9mmWj3RwoFcE5eTP9kqfTY6toEJLwI7VFkFX2XPI
Ottho2bxrlc86elKP5Rfir3hEnWU7nea6anvD1y7DADjXJyXoyBNtRDTHPkDvdhG
4plf7kAYp4Rc4sRPobde2aA37pqinLM6IkAhRhHiSg5V0C0vdBcahcvZ/QBbWJqB
krlt6FWlAoGBANjZb56LxOGoPmOSQcmsZi4UbS77kjk7a/GfdkoIEsHK2DJqLfUk
dXRjzl8o8pnXkdT1FVtCvElJzrcwjrP2tJ3TXbcmvMenbUtjM/PhUYjOsb8xozpE
tMBVSfyV00LoaWlVch18K8I/uG3a14K67MwzBnhcKWKbJrppE8zh2eZfAoGBAMQm
QGItEPS2iW0XzQ37HcHXmBoZ00v8Bx+sGDWWyts+GIAvUnS24skFmB9ILbvjxQ+7
IsrVu4VYCxeRJfSWd5TMcv8SNUAfHLCL26/upX/hnAEdCJoqJWXWcpsHJKgvIFks
KXsEpPxFtJNCpSjGtHB7npYzJHmAuBwkDWEf4c2vAoGAUZ10rz13ul6yLJOtgxQJ
2SoC9f3lSPkeZXBY+wAS3zFTMZZY+bzhIA84awRkWpaR4o7jnNd/Oi43SSdTblRa
IlSdHwPLZXGUZx1NPmr9Xvo8V/N8tb+KMCFpmVFik/oZQnXQX1yOs6t75IzLM/7a
hPhnZQF66gvvBZXqx9/xPQ0CgYBcyaOHTb5JpNfZrXqo9HOdMPmYz0KvHSfZibVi
FFUd5X/9k2U0JRee9HCDy8cmrJaZ3HKW9QhiCcYlfdowm8UxtI1psBlUneMaeO6R
iRjtJ7J+rFdXZjyOsiVAxN5IWRK6XDO7J/VMCUVkrBAo++Z7l17ruoG0oHl3hm51
1XkhrQKBgCIZmRxShE8rS1Y6JzTlToG+FHoBk3UqhzfvlVE/k7EfKucNVmviygTc
1TKbuzYDVsVLOqzjUj/I9SIcFRft8O26WGWfwFqptpBuq7akTS0so/VC5T4//lG5
zOEqsCGMWS4sitVN7/eC3dEYXfN5zoiCRIlAEEq9sngtKqa1d0mM
-----END RSA PRIVATE KEY-----
</code>
</pre>

Decrypting the file content  gave me final email address which was <em><strong>“padvish-quest@amnpardaz.com”</strong></em>.

<br><br>You can get files from <a href="https://gitlab.com/shahjal/bloodmoney">here</a>.

<p><strong>This is imported from my old WP blog, some links might be broken, <a href="https://repret.wordpress.com/2015/09/08/blood-money/">original post</a>.</strong></p>
