---
layout: post
title: Algorithm for Constructing Grammar Graph (Fuzzing)
date: 2022-05-24
author: Shahriyar Jalayeri
comments: true
categories: [fuzzing]
---

A few years ago, I was tasked to write a grammar fuzzer, I started looking at EBNF and BNF formats and one of the first (obvious?) ideas that popped in to my head was to convert the given grammar to a graph and then randomly walk the graph from a node with some ending condition to derive an instance of the grammar. The final fuzzer was more complicated but anyways here is the algorithm I came up with to convert a BNF to graph:

```
Inputs:  
G = Grammar Graph with the Initial starting node 
P = Starting Node
Seen = ∅  
Grammar = BNF Grammar
procedure ConstructGrammarGraph 
    if P ∈ Grammar then 
        if P ∉ Seen then 
            Seen ←  Seen ∪ {P} 
            for each C ∈ Grammar[P]  do /* each production rule of P */ 
                G ←  AddNode(G, C)
                G ←  AddEdge(G, P, C)
                ConstructGrammarGraph(G, C, Seen, Grammar)
            end for 
        end if 
    else
        NonTerminals ← GetNonTerminals(P)
        for each N ∈ NonTerminals do 
            if N ∉ Seen then 
                G ←  AddNode(G, N)
                G ←  AddEdge(G, P, N)
                ConstructGrammarGraph(G, N, Seen, Grammar)
            else 
                G ←  AddEdge(G, P, N) 
            end if 
        end for 
    end if
end procedure
```

This excerpt form the GrammarFuzzer python class, ignore the probability values, there are the because I had this idea to compute the uniform probability distribution of each non-terminal node within the grammar by counting number of possible distinct trees each non-terminal can produce, plus used probability factor to escape from recursion hell by reducing the node probability after each selection.

```python
    def __build_grammar_graph(self, G, p, __seen=None):
        """
        [INTERNAL] Build the grammar graph by walking each non-terminal and its production rules.

        Arguments:
            G {NetworkX DiGraph} -- grammar graph, starts empty.
            p {str} -- production rule.

        Keyword Arguments:
            seen {set} -- internal (default: {set()})

        Returns:
            NetworkX Graph -- the grammar graph.
        """
        if __seen is None:
            __seen = set()

        if p in self.grammar:
            if p not in __seen:
                __seen.add(p)
                for c in self.grammar[p]:
                    if not c or c == "":
                        c = EMPTY_MARK

                    # for start, give every node probablity of 1
                    G.add_node(c, cur_prob=1.0, org_prob=1.0, fall_prob=0)
                    G.add_edge(p, c)

                    if p in self.grammar[p]:
                        G.add_edge(p, p)

                    self.__build_grammar_graph(G, c, __seen)
        else:
            nonterms = parser.nonterminals(p)
            for n in nonterms:
                if n not in __seen:
                    G.add_node(n, cur_prob=1.0, org_prob=1.0, fall_prob=0)
                    G.add_edge(p, n)
                    self.__build_grammar_graph(G, n, __seen)
                else:
                    G.add_edge(p, n)
```

running this can for example result in the following simple graph for JSON grammar:

![](/assets/img/posts/gram/json.svg)

or a more complicate graph, like drop table statement in SQL:

![](/assets/img/posts/gram/drop_table_stmt.svg)
