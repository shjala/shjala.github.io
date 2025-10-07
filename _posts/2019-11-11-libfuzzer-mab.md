---
layout: post
title: Optimizing LibFuzzer Mutator Selection with Multi-Armed Bandits
date: 2019-11-11
author: Shahriyar Jalayeri
comments: true
categories: [fuzzing]
---

LibFuzzer's random mutator selection is simple but suboptimal. By applying Multi-Armed Bandit algorithms, we can improve fuzzing performance by learning which mutators work best for specific targets.

## LibFuzzer Default Mutator Selection

LibFuzzer uses a straightforward approach for mutator selection, it randomly selects a mutator from a list at every iteration, and applies it to the testcase. `MutationDispatcher::MutateImpl` is implemented in `lib/fuzzer/FuzzerMutate.cpp` and works as follows:

```cpp
size_t MutationDispatcher::MutateImpl(uint8_t *Data, size_t Size,
                                      size_t MaxSize,
                                      Vector<Mutator> &Mutators) {
    assert(MaxSize > 0);
    // Some mutations may fail (e.g. can't insert more bytes if Size == MaxSize),
    // in which case they will return 0.
    // Try several times before returning un-mutated data.
    for (int Iter = 0; Iter < 100; Iter++) {
        auto M = Mutators[Rand(Mutators.size())];
        size_t NewSize = (this->*(M.Fn))(Data, Size, MaxSize);
        [...]
```

This uniform random selection treats all mutators equally, regardless of their past performance. We can do better. To optimize mutator selection, we can borrow techniques from reinforcement learning.

## The Multi-Armed Bandit Problem and Fuzzing

The Multi-Armed Bandit (MAB) problem is a classical problem in Reinforcement Learning. A MAB is a slot machine where a player pulls an arm (lever) and receives a reward (payout) based on a probability distribution. The goal is to find which slot machine will give us the maximum cumulative reward over a sequence of time.

We can formulate the fuzzing process as a MAB problem, pulling an arm equals running a test case or selecting a mutator, and the reward equals new code coverage. By applying MAB solutions, we can optimize the fuzzing process and increase our chances of finding bugs.

## Notations

In our MAB/Fuzzing problem, we start with $k$ actions (mutators) labeled by integers $\{1, \ldots, k\}$. At each time step $t$, the fuzzer performs an action $a_t$ (selects a mutator and runs it over a test case) and receives a reward $r_t$ (increase in code coverage). We define the value of an action $Q(a)$ as the average rewards received by it:

$$Q(a) = \frac{\text{Sum of rewards received from action}}{\text{Total number of times the action was selected}}$$

By this definition, the optimal action is always the one that gives us the maximum cumulative reward:

$$Q(a^*) = \max_{1 \leq i \leq k} Q(a_i)$$

A **policy** is a randomized algorithm $A$ which picks an action in each round based on the history of chosen actions and observed rewards so far.

Given an algorithm $A$ and a set of actions $\{1, \ldots, k\}$, the cumulative **regret** of $A$ in rounds $1, \ldots, T$ is the difference between the expected reward of the best action (the action with the highest expected payout) and the expected reward of $A$ for the first $T$ rounds. **The final goal in solving the MAB/Fuzzing problem is to minimize the regret throughout the $T$ rounds.**

## The ε-Greedy Policy

The ε-greedy policy is very simple: either we select the best action with probability $1 - \varepsilon$, or we select a random action with probability $\varepsilon$. This provides a straightforward way to balance exploitation of known good mutators with exploration of alternatives.

## The Upper Confidence Bound Policy

With ε-greedy, we explore random actions with a probability. The random action is useful for exploring various actions, but *in theory* it might also lead us to try actions that will not give us a good reward at all. This also leads to missing actions that are actually good but gave poor rewards in the initial rounds.

To avoid these problems, we can use a policy called **Upper Confidence Bound (UCB1)**. UCB helps when, despite our lack of knowledge about which test case is best, we construct an optimistic guess as to how good the expected payoff of each action is, and pick the action with the highest guess. If our guess is wrong, our optimistic guess will quickly decrease and we'll be compelled to switch to a different action. On the other hand, if we pick well, we'll be able to exploit that action and incur little regret. In this way we balance exploration and exploitation.

The "optimism" comes in the form of an **upper confidence bound**, which is usually calculated using Hoeffding's inequality. Hoeffding's inequality gives an **exponential** bound on the deviation of sums of random variables from their expected value.

We can calculate UCB using the following formula, where $N(a)$ is the number of times the arm was pulled, $t$ is the total number of rounds, and $c$ is an exploration constant similar to the value of epsilon:

$$\text{action} = \arg\max_a \left[Q(a) + \sqrt{\frac{c \ln(t)}{N(a)}}\right]$$

## Applying MAB to Fuzzing

As described, ε-greedy and UCB policies can be applied to both **mutator selection** and **seed selection**. In the case of mutator selection, the process is simple because we have a fixed set of mutators (actions/arms) and we can directly apply the algorithms.

Dealing with test case selection requires different initialization, because the number of test cases can change over time. In order to deal with this issue, I suggest fuzzing test cases in batches over a constant time. Each batch can contain a fixed set of test cases $\{1, \ldots, n\}$. We fuzz each batch for $T_f$ time and then reinitialize the policy with a new batch which contains a new set of test cases, greater or less than the last one.

Our last issue is the reward value. The introduced policies require the reward value to be in $[0, 1]$. In order to normalize the LibFuzzer reward value, we can count the number of available edges in the target as $E$ plus an approximated constant value $c$, because LibFuzzer has other means of gathering coverage information (e.g., data-flow, indirect calls, etc.), and then simply normalize each reward value:

$$r_i = \frac{e_i - \min(e)}{\max(e) - \min(e)}$$

This normalization ensures our rewards are properly scaled for the MAB policies, allowing them to effectively learn which mutators and test cases are most productive for discovering new coverage in your specific target.

## Setup

To evaluate the MAB-based mutator selection, I modified LibFuzzer to implement both ε-greedy and UCB1 policies. The implementation required changes to the mutator selection mechanism and the addition of reward tracking for each mutator based on coverage feedback. The modifications were applied to LibFuzzer commit `69445f095c22aac2388f939bedebf224a6efcdaf` in the LLVM compiler-rt repository. The complete patch implementing the MAB policies is available [here](https://gist.githubusercontent.com/shjala/58b035b61dc57347047dbaf86be3e333/raw/a032e66ad00e55344fcafd449d26c6201e0f3c94/eg_ucb.patch).

Each experiment was conducted for 72 hours. The following commands were used to run the different configurations:

```bash
# Baseline (random mutator selection)
./fuzz_cus -log_cov=1 corpus/& PID=$!; sleep 259200; kill $PID

# UCB1 with path coverage reward
./fuzz_cus -opti_strat=ucb:70000:pc -log_cov=1 -fail_inc=1 corpus/& PID=$!; sleep 259200; kill $PID

# UCB1 with feature coverage reward  
./fuzz_cus -opti_strat=ucb:70000:ft -log_cov=1 -fail_inc=1 corpus/& PID=$!; sleep 259200; kill $PID

# ε-greedy (ε=0.01) with feature coverage reward
./fuzz_cus -opti_strat=eg:0.01:70000:ft -log_cov=1 -fail_inc=1 corpus/& PID=$!; sleep 259200; kill $PID

# ε-greedy (ε=0.01) with path coverage reward
./fuzz_cus -opti_strat=eg:0.01:70000:pc -log_cov=1 -fail_inc=1 corpus/& PID=$!; sleep 259200; kill $PID
```

## Experimental Results

To validate the effectiveness of MAB-based mutator selection, I implemented both ε-greedy and UCB1 policies in LibFuzzer and evaluated them. The results demonstrate improvements in fuzzing performance across multiple metrics.

### Code Coverage Growth

![Path Coverage](/assets/img/posts/mab/pc.svg)

The path coverage results show that both MAB policies consistently outperform the baseline random mutator selection. UCB1 demonstrates better performance at the initial satges (as expected), but overall ε-greedy is the winner.

### Execution Speed

![Execution Speed](/assets/img/posts/mab/exec.svg)

The execution speed measurements show how fast each approach can execute test cases. MAB-guided mutator selection demonstrates improved execution throughput compared to random selection. This increased speed allows for more test cases to be processed in the same time period, contributing to better overall fuzzing performance.

### Feature Discovery Rate

![Feature Discovery](/assets/img/posts/mab/feature.svg)

MAB policies enable the fuzzer to identify interesting program features and edge cases more quickly, leading to better overall exploration of the target program's behavior space.

## Conclusion

Applying Multi-Armed Bandit algorithms to LibFuzzer's mutator selection provides measurable performance improvements across coverage growth, execution speed, and feature discovery. The results demonstrate that intelligent mutator selection can significantly enhance fuzzing effectiveness compared to random selection.