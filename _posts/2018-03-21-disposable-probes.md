---
layout: post
title: Reducing Code Coverage Overhead using "Disposable Probes" (Fuzzing)
date: 2018-03-21 13:26
author: Shahriyar Jalayeri
comments: true
categories: [oldblog, fuzzing]
---

One of the main sources of overhead in a guided fuzzer is the instrumentation probes it uses to collect information about branch/block coverage. These probes are usually inserted at compile time (in case of AFL/LibFuzzer) or post compile time using binary rewriting/hooks (in case of KFUZZ), but the fact is we do not need to re-execute this probes after they got executed and provided us the collected information. There has been some works in the past to reduce the cost of code coverage. But before I talk about the technique that I've implemented and benchmark-ed in KFUZZ, I will share with you a brief introduction to the overall static/dynamic approaches. Static approach are generally more interesting but it requires a little bit of background.

To the best of my knowledge first attempt to reduce the cost of collecting coverage information comes from Agrawal[0] paper, the paper introduced a technique to find subsets of nodes of a flowgraph that satisfy the following property: "<em>A test set that exercises all nodes in a subset exercises all nodes in the flow graph</em>". In other words, we can <strong><em>statically</em> </strong>find a couple of basic-blocks (a subset of control flowgraph - CFG) that if we monitor the execution of only those basic-blocks the remaining basic-blocks are automatically covered (we can achieve 100% node coverage using the reduced subset) and we don't have to put instrumentation probe on every basic-block of CFG.
Agrawal used post/pre dominators (famous for its use in loop detection) and concept of superblocks to deduce that optimal subset. I'm going to briefly mention and define the required concepts here (with examples from original paper), please refer to the original paper for more detailed explanation.

A <script type="math/tex"> control flowgraph </script> (CFG) of a program is a four-tuple <script type="math/tex"> \left ( N, E, entry, exit \right )</script> where <script type="math/tex">N</script> is the set of <script type="math/tex">nodes</script> (basic-blocks) in the program, <script type="math/tex">E</script> is the set of directed edges between nodes, and <script type="math/tex">entry</script> and <script type="math/tex">exit</script> are two distinguished nodes in <script type="math/tex">N</script>. Every <script type="math/tex">node</script> in <script type="math/tex">N</script> is reachable from the <script type="math/tex">entry</script> node and the <script type="math/tex">exit</script> node is reachable from every basic-block by following edges in <script type="math/tex">E</script>.

| ![](\assets\img\posts\prog_cfg.png) |
|:--:|
| *Figure 1: A C Program and Its corresponding CFG* |

A node, <script type="math/tex">u</script>, <script type="math/tex">predominates</script> a node, <script type="math/tex">v</script>, if every path from the <script type="math/tex">entry</script> node to <script type="math/tex">v</script> contains <script type="math/tex">u</script>. A node, <script type="math/tex">w</script>, <script type="math/tex">postdominates</script> a node, <script type="math/tex">v</script>, if every path from <script type="math/tex">v</script> to the <script type="math/tex">exit</script> node contains <script type="math/tex">w</script>. For example, in above graph, nodes 1, 2, and 3 predominate node 8 (because every path from entry node to node 8 must contains nodes 1,2,3 and we can't reach node 8 without passing through those nodes) and nodes 2 and 14 postdominate node 8 (similarly because to reach<em> </em>exit node starting form node 8, we most pass through nodes 2 and 14, there is no other way).
pre/post dominator relationships can be expressed in the form of trees. <script type="math/tex">u</script>  <script type="math/tex">predominates</script> <script type="math/tex">v</script> if there is a path from <script type="math/tex">u</script> to <script type="math/tex">v</script> in the predominator tree. Similarly, <script type="math/tex">w</script> <script type="math/tex">postdominates</script> <script type="math/tex">v</script> if there is path from <script type="math/tex">w</script> to <script type="math/tex">v</script> in the postdominator tree.

| ![](\assets\img\posts\prepostdom.png) |
|:--:|
| *Figure 2: Predominator tree (left) and Postdominator tree (right)* |

In a more general term we can say <script type="math/tex">u</script> <script type="math/tex">dominates</script> <script type="math/tex">v</script> iff <script type="math/tex">u</script> <script type="math/tex">predominates</script> <script type="math/tex">v</script> or <script type="math/tex">u</script> <script type="math/tex">postdominates</script> <script type="math/tex">v</script>. Dominator relationship among CFG nodes is the union of pre/post dominator relationships. <em>Figure 3</em> shows a <strong><em>basic-block dominator graph</em></strong>, obtained by merging pre/post dominator trees.

| ![](\assets\img\posts\preposdom_graph.png) |
|:--:|
| *Figure 3: Basic-block dominator graph* |

Using this knowledge we can conclude that if node <script type="math/tex">u</script> predominates node <script type="math/tex">v</script> and testcase <script type="math/tex">t</script> covers node <script type="math/tex">v</script>, it also covers node <script type="math/tex">u</script> (because we have to go through <script type="math/tex">u</script> to reach <script type="math/tex">v</script>). As you can see it makes sense to acknowledge this as a first step in reducing number of instrumentation probes required.
To further develop the optimal subset of probe nodes, Agrawal introduced the concept of superblock. A <script type="math/tex">super block</script> contains one or more nodes that form a strongly connected component (in other word a loop) in the basic-block dominator graph. For example in <em>Figure 3</em>, nodes 1, 2 and 14 form a strongly connected component and together are a superblock. This superblock has a special property: <em>each node in a strongly connected component dominates all other nodes in that component</em>! So it is safe to say that if a testcase <script type="math/tex">t</script> covers any node in a strongly connected component, all other nodes in that component must be covered by the same testcase (e.g if a testcase covers node 2, it most also covers node 1 and 14).

| ![](\assets\img\posts\scc_dom.png) |
|:--:|
| *Figure 4: The graph obtained by merging the strongly connected components of the basic block dominator graph (Figure 3)* |

The dominator relationships also applies to superblocks. Therefore we can say a superblock, <script type="math/tex">U</script>, <script type="math/tex">dominates</script> another superblock, <script type="math/tex">V</script> if every path from the <script type="math/tex">entry</script> to the <script type="math/tex">exit</script> node via <script type="math/tex">V</script> in the flowgraph also contains <script type="math/tex">U</script>.
We can obtain a superblock dominator graph by merging the nodes in the strongly connected components of the corresponding basic block dominator graph and removing the composite edges from the resulting graph.

| ![](\assets\img\posts\superblocks.png) |
|:--:|
| *Figure 5: superblock dominator graph* |

Finally, whenever a node in a flowgraph is covered then all its ancestors in the dominator tree are also covered. Thus, if all leaves in the dominator tree are covered then all other nodes in the flowgraph are automatically covered. This is the main assertion that can lead to reduction of instrumentation probes!
In another words covering all the leaves in the superblock dominator graph implies covering all other superblocks as well. Therefore we only need to put instrumentation probes at one basic-block from each leaf in the superblock dominator graph to capture a complete node (basic-block) coverage! This reduces number of probes from 14 to 4. The same principals can be applied to create a branch superblock dominator graph for branch coverage.
As you can see Agrawal's approach is computationally expensive, Tikir et al.[1] argued the same and stated use of post/pre dominator and superblocks puts expensive computation overhead in the analysis phase without a significant reduction in instrumentation overhead. So they developed a much simpler and less costly approach and used only a single dominator tree (with an extension) to deduce the <em><strong>non-optimal</strong></em> subset of nodes we need to instrument to collect node coverage information.

| ![](\assets\img\posts\dt_example.png) |
|:--:|
| *Figure 6 : Another simple CFG and Its Dominator Tree* |

As Agrawal showed, usefulness of dominator tree comes from the fact “<em>that for each basic block <script type="math/tex">n</script> in a dominator tree if <script type="math/tex">n</script> is executed, all the basic-blocks along the path from root node to <script type="math/tex">n</script> in dominator tree are also executed</em>”. So in the above example we can put instrumentation probes on the two leaf nodes {2,4} of dominator tree instead of 5 basic-blocks in CFG. But using a single (pre) domination relation is not sufficient for a complete node coverage in all cases, for example in the <em>Figure 7</em> if we only instrument the leaf nodes, and the testcase <script type="math/tex">t</script> exercises node 4, we can’t distinguish the execution is coming from path &lt;0,1,2,4&gt; or &lt;0,2,4&gt; and therefore can’t be sure of execution of block number 1.

| ![](\assets\img\posts\dt_leaf_example.png) |
|:--:|
| *Figure 7 : Leaf Level Instrumentation* |

To solve this Tikir et al. extended the idea and “<em>instrumented basic block <script type="math/tex">n</script> if <script type="math/tex">n</script> has at least one outgoing edge to a basic block <script type="math/tex">m</script> that <script type="math/tex">n</script> does not dominate</em>”. I the above example this means we should instrument the subset {4,1,3} instead of just {4,3} because we have a path from 1 to 2,  and 1 does not dominate 2.
To deduce the not-optimal solution (means we might instrument more blocks than what we actually need) Tikir et al. used the Langauer-Tarjan[2] algorithm (linear in number of edges) for dominator tree computation.
Tikir et al. also offered deletion of instrumentation probes (for better performance for long running programs) using a time-periodic garbage collector but they stated this might reduce the performance gain due to overhead caused by trampoline memory de-allocation.

In another attempt Shye et al[5] used domination relation together with PMU's Branch Trace Buffer to achieve 50-80% code coverage with only 3% overhead. On a different view[6] we can reduce probe numbers by arguing "there is no need to collect coverage information that has already been collected in the testing phase, so before deployment, the application is statically re-instrumented only in the locations that were not covered during the testing phase of development".
Next, we have the interesting work of Chilakamarri and Elbaum[3], which my work is based on. They improved the performance of coverage testing for Java programs by <em><strong>dynamically</strong> </em>“disposing” of instrumentation probes when it is no longer needed. The idea is simple, they modified the JVM to replace the probe (Collector method) function CALL with NOP after execution.

So it removes a instrumentation probe after it has done its job and collected the coverage information we needed, intuitively we don't need to re-execute that same probe again and again just to see it has no new information to collect!
Some might argue, dynamic and instantaneous removal of instrumentation from an instruction stream is not cache friendly and "memory hierarchies make many assumptions about the read-only nature of code in order to maintain consistency and to cache it". Therefore  removing probes is likely to incur a significant overhead and reduce the gain provided by not using the cheaper and cache-friendly static instrumentation probes. but I doubt that, at least in my case this is not true. I think caching plays a more significant role in bitmap access and making bitmap memory cache friendly is much more wiser choice.

In case of fuzzers like AFL/LibFuzzer you cannot use disposable probes, because the cost of stopping, re-building, and re-executing the program every time we update the bitmap is much more expensive than executing not-anymore-useful probes (not saying impossible, obviously you can still rewrite the code at run-time). However, in KFUZZ it is much easier, because I am using dynamic hooks to collect edge-coverage information, So I can simply change the hook callback (probe function) after its execution just like what Chilakamarri and Elbaum did. In the first attempt I implemented a simple version to maintain the edge-coverage consistency; KFLOG changes the probe callback after execution if a block <script type="math/tex">in</script> degree is <strong><em>one </em></strong>(hope my assumption is not wrong). We can't completely remove the probe callback, because we will get a invalid <em>branch coverage</em> (remember <em>prev_location = cur_location &gt;&gt; 1</em> ), So KFLOG replaces the probe with one that just updates the <em>prev_location</em> without manipulating the bitmap array. It still reduces the coverage overhead, around 50-60% of blocks have <script type="math/tex">in</script> degree 1 in the binaries I have tested. I statically collect the basic-blocks  information (rva, size, degree, etc) just once at the analysis phase and pass them to the KFLOG (kernel instrumentation part) at run-time.
After implementing disposable probes, KFLOG probes overhead went from <strong><em><a href="https://gist.githubusercontent.com/shjalayeri/69b3dbd9b2f0a68159f2d9f63441de61/raw/d834093f12105a9a7ce350fa95d545e771072abe/kfuzz_benchmark.txt">2.44x</a></em></strong> to <strong><em><a href="https://gist.githubusercontent.com/shjalayeri/5d60923f5989065d6b20dcb0c028ec4b/raw/51d2b25651c7ad2568a1f33b5760f4f888a55006/kfuzz_dp_benchmark">1.66x</a></em></strong> slowdown according to <a href="https://gist.github.com/richinseattle/78e40e36e3215d1ff26eb1d39c0580e1">Richard Johnson’s benchmark</a>. However, I found the Prime benchmark inaccurate, so I implemented some programs from CHStone[4]  and here is the result from a not optimized, quick PoC.

| ![](\assets\img\posts\dp_overhead_new.png) |
|:--:|
| *Figure 8 : KFLOG Disposable Probes (Branch Coverage) Overhead* |

Overhead cost reduction varies from 10-40%, If you are happy with block coverage, results are even better (15-80%) because in this case we can actually delete the instrumentation probe.

| ![](\assets\img\posts\dx8hucdu8aecxfj-large.jpg) |
|:--:|
| *Figure 9 : KFLOG Disposable Probes (Block Coverage) Overhead* |

It is possible to further improve "Disposable Probes" for blocks with <script type="math/tex">in</script> degree more than one, one way would be tracking every incoming edge and changing the probe when we had set bits equal to blocks <script type="math/tex">in</script> degree in bitmap. We can further improve this by combining static/dynamic approaches and reduce the initial probes count even more by dominator tree relations. Obviously it is not easy to use this method for self-modifying programs. In the above implementation I skipped the functions entry block (even if we have only one reference to function there are still dynamic address resolution, call table, etc) and assumed a second edge to a block with <script type="math/tex">in</script> degree 1 that is not statically reachable is caused by a bug and therefore crashes the program under the test.

You can find raw benchmark data <a href="https://github.com/shjalayeri/kflog_bp_benchmark">here</a> and a copy of my testing suite KTest in my <a href="https://github.com/shjalayeri/ktest">github</a>.

<p><strong>This post is imported from my old WP blog, <a href="https://repret.wordpress.com/2017/05/01/improving-coverage-guided-fuzzing-using-static-analysis/">original post</a>.</strong></p>

<pre>[0] http://www.utdallas.edu/~ewong/SE6367/03-Lecture/10-Hira-01.pdf
[1] https://dl.acm.org/citation.cfm?id=566186
[2] https://www.cs.princeton.edu/courses/archive/fall03/cs528/handouts/a%20fast%20algorithm%20for%20finding.pdf
[3] http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.61.7720&amp;rep=rep1&amp;type=pdf
[4] http://www.ertl.jp/chstone/
[5] http://www.ece.northwestern.edu/~ash451/docs/aadebug05-pmu.pdf
[6] http://design.cs.iastate.edu/papers/AOSD-2005/aosd05.pdf</pre>
