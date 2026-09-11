> **Public app update:** the live website now includes REINFORCE, A2C, PPO, and TRPO in addition to the six methods below. The historical 8,910-run study still covers only the original six. See the repository README and in-app field guide for the four new one-step specializations.

# Reward transformations and policy learning: a worked lab

The question is whether changing the reward scale can improve learning, preserve useful intermediate outputs, or prevent a high-reward mode from separating from the rest of the distribution. This lab lets you distinguish those possibilities by actually updating small policies.

These are illustrative experiments created for this discussion. They are not replications of LLM training or evidence that one method universally wins. A reward histogram does not reveal the semantic distance between answers.

## 1. What the lab contains

- Eleven starting distributions: bell shaped, uniform, mostly low, mostly high, two modes, an almost-empty middle, a rare excellent outcome, a narrow cluster, all zero, absent excellent outputs, and a moderate spike with a thin excellent tail. You can also paste your own initial quality samples.
- Three output tasks: continuous quality, binary correctness, and illustrative code rewrites. Code outcomes are failures (reward 0), unchanged correct code (0.35), and increasingly good rewrites (0.55–1). These are invented scores; the lab does not execute code.
- Three policies: 21 independent logits; four shared curve parameters; and a trainable 1→8→1 tanh network. The shared models use the output's position on a quality axis, not text embeddings. They illustrate parameter coupling, not semantic reasoning.
- Six learning rules: RLOO, GRPO, thresholded MaxRL, TailRL, PKPO, and an elite-selection baseline.
- Fixed and group-fitted transformations, accurate or noisy judges, editable sampling budgets, learning rates, seeds, and a support floor.
- True-reward distributions, learning curves, checkpoint replay, sampled advantages, and a multi-seed stress test.

Every method samples from its own current policy. Methods share random uniforms to reduce irrelevant differences in comparisons, although those uniforms select different outputs once policies diverge. All receive the same number of rollout opportunities. Compute time per update is not equalized.

**MaxRL has a different target in continuous tasks:** it treats judged reward ≥0.9 as success. Its binary rewards bypass the selected continuous transformation. That is deliberate. Applying arbitrary signed, centered values to its mean-dividing formula would no longer be the correctness-based MaxRL method.

## 2. The three operations to keep separate

1. **Relabeling a plot:** Replace the x-axis coordinate r by g(r). The policy's probabilities have not changed.
2. **Changing the training reward:** Optimize using g(r). Reward gaps change, so the policy update can change.
3. **Normalizing advantages:** Process a batch's training weights after sampling. Whether this changes an objective depends on the formula and whether its statistics depend on the same samples.

Making a plot resemble a Gaussian does not by itself create missing behaviors. Centering and dividing by standard deviation does not make arbitrary data normal. With binary rewards, a deterministic transformation still produces at most two reward values.

## 3. How each rule works

Let y_i be the training reward after the chosen transformation, n the rollout count, μ its group mean, and σ its population standard deviation within that group. The lab uses the common update convention

    gradient = (1/n) Σ_i A_i ∇ log π(output_i).

**RLOO:** A_i = y_i − mean(other y_j). This is REINFORCE with a leave-one-out baseline. It targets expected reward when the reward function is fixed and samples are independent. For a fixed transformation, the target becomes E[g(R)]. [RLOO paper](https://arxiv.org/abs/2402.14740)

**GRPO:** A_i = (y_i − μ)/(σ + 10⁻⁸). A positive affine transformation, ay+b with a>0, leaves these advantages essentially unchanged, except for the stabilizing epsilon. A nonlinear transformation generally changes them. The lab isolates the advantage rule; it does not reproduce GRPO's complete token-level clipped objective or KL regularization. [DeepSeekMath, §4.1](https://arxiv.org/html/2402.03300v3#S4)

**MaxRL:** A_i = (b_i − mean(b))/mean(b), where b is binary success. All-failure groups are skipped. Its finite-sample objective approaches expected log success probability as sampling grows. [MaxRL, §4.3](https://arxiv.org/pdf/2602.02710)

**TailRL:** Sort rewards, accumulate each reward gap divided by how many outputs clear that gap, then center the weights. The lab multiplies the paper's centered weights by n because it uses the mean-gradient convention above. [TailRL, §4 and Appendix F](https://arxiv.org/pdf/2609.02987)

**PKPO:** The lab implements the paper's leave-one-out-minus-one best-of-k estimator. For k≥2, its mean-convention weight is k times the average marginal improvement made by output i over the maximum of k−1 other outputs, averaging all such subsets. For k=1 it uses RLOO. [PKPO, equation 33](https://arxiv.org/html/2505.15201v5#S4.SS3)

**Elite selection:** Keep the top 20% of a sampled group, including all ties at the cutoff; increase their likelihood equally. All-tied groups are skipped. This is a simple comparison heuristic, related to cross-entropy methods, rather than a claim to reproduce a particular implementation. [Cross-entropy method](https://jmlr.csail.mit.edu/proceedings/papers/v28/goschin13.pdf)

## 4. What transformations change

For a fixed differentiable increasing g on [0,1], define p(t)=P(R>t). A change of variables gives the following threshold-gradient weights:

| Objective | Weight multiplying ∇p(t) after transformation |
|---|---|
| Expected transformed reward | g′(t) |
| Best-of-k transformed reward | g′(t) k(1−p(t))^(k−1) |
| Population TailRL on transformed rewards | g′(t)/p(t) |
| Order-T TailRL | g′(t)[1−(1−p(t))^T]/p(t) |

For TailRL, use a bounded transformed reward range and integrate over that range. The paper explicitly proves the reward-axis/threshold-weighting equivalence in Proposition 9. [TailRL, Appendix C.3.4](https://arxiv.org/pdf/2609.02987)

Thus transformation and rarity weighting are different factors. A log-like transformation compresses high-reward gaps; a square expands high-end gaps relative to low-end gaps. Either can be combined with rarity weighting. Neither guarantees preservation of the middle.

These expressions do not directly describe GRPO's continuous-reward population update: its group standard deviation depends on the whole reward distribution. Nor do they automatically apply when g is re-estimated from the same sampled group.

### Fixed transformation choices

| Transformation | What to look for | Main edge case |
|---|---|---|
| Positive affine, ar+b | RLOO/TailRL/PKPO scale by a; GRPO mostly unchanged | Raw update magnitudes are not an apples-to-apples ranking |
| Log-like | High-reward differences compress | Raw log(0) is undefined; the lab uses log(1+9r)/log(10) |
| Square on nonnegative rewards | Larger high-end gaps | Can magnify a falsely high judge score |
| Square root | Larger low-end gaps | Derivative is singular at zero; this lab differences reward values rather than differentiating through reward |
| Box–Cox | Tune curvature with λ | Requires positive inputs; the lab adds 0.01 and rescales endpoints |
| Yeo–Johnson | Tune curvature without a positivity-only domain | Automatic centering can destroy MaxRL's meaningful zero point |
| Reciprocal | Quality ranking reverses | A Gaussian-looking transformed variable can still reward the wrong behavior |

The lab normalizes Box–Cox and Yeo–Johnson endpoints to keep 0→0 and 1→1. It does not fit λ. Scikit-learn's PowerTransformer normally estimates λ and, by default, additionally standardizes its output. Those defaults are different from this experiment. [PowerTransformer documentation](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.PowerTransformer.html)

### Distribution-fitted transformation choices

**Group z-score:** Recompute mean and standard deviation each update. Applying it before GRPO is mostly redundant. Applying it before RLOO effectively introduces group-standardized weighting, so the original fixed-reward unbiasedness argument no longer applies unchanged.

**Group normal scores:** Map each output's midrank to a standard-normal quantile. Ties share the same value. This is an illustrative rank transformation, not an implementation of sklearn's QuantileTransformer. It removes absolute reward gaps and can amplify tiny differences. A group of identical rewards still maps to one point.

**Frozen initial normal scores:** Use the initial true-reward distribution's mid-CDF, then a Gaussian inverse CDF. Values are clipped to CDF probabilities [0.001,0.999] to avoid infinite endpoints. This reference is frozen throughout learning. Discrete masses and ties prevent an exactly normal output distribution.

Quantile transformations use an estimated CDF and can alter correlations; observations outside the fitted range are mapped to boundary values. [QuantileTransformer documentation](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.QuantileTransformer.html)

There is a deeper issue with continuously refitting to the current policy: for a continuous R and its exact current CDF F_θ, F_θ(R) is uniform. Consequently, a fully differentiated objective E[Φ⁻¹(F_θ(R))] is constant. Updating from ranks while treating the mapping as fixed is a different operation. It can learn, but one cannot justify it by claiming to maximize that constant objective. Finite samples and atoms introduce further differences.

## 5. Binary rewards reveal several invariances

Any deterministic increasing transformation of binary r can be written, on its two possible values, as

    g(r) = c + d r, with d > 0.

By direct substitution:

- RLOO weights scale by d.
- GRPO weights remain the same, apart from epsilon effects.
- Centered TailRL weights scale by d.
- Best-of-k weights scale by d.
- Elite ordering remains the same.

If someone naively substitutes g(r) into MaxRL's mean-dividing formula, the result is

    A_i = d(r_i − mean(r)) / (c + d mean(r)).

When c=0, d cancels. A positive c weakens rare-success amplification. A denominator near zero is unstable; a negative denominator can reverse the update. This substitution is not the method simulated in the MaxRL panel.

For seven failures and one success, the exact illustrative advantages are:

| Rule | Each failure | Success |
|---|---:|---:|
| RLOO | −1/7 | 1 |
| GRPO | −1/√7 | √7 |
| MaxRL | −1 | 7 |
| TailRL, mean convention | −1 | 7 |

With a rollout group of two, centered TailRL equals RLOO under this convention, for arbitrary real reward values. Larger rollout groups are therefore necessary to see TailRL's additional within-group weighting behavior.

## 6. A guided sequence of experiments

**A. See the ordinary learning loop.** Use bell shaped, continuous quality, independent logits, original rewards. Run 300 updates. Switch the curve among mean, best-of-k, excellent probability, and middle mass. Replay checkpoints. A positive sampled advantage encourages that output, but shared parameters can move many probabilities together.

**B. Test your chasm hypothesis.** Use moderate spike + thin excellent tail. Compare original rewards, square, and log-like transformation with the same seed. Watch whether the moderate mass shrinks, where its probability goes, and whether poor outputs increase. Repeat with shared and neural policies. A hollow middle alone is not evidence of losing useful reasoning steps.

**C. Separate missing from rare.** Compare rare excellent outcome with excellent outputs absent. At zero support floor, the absent outputs have log probability −∞ and remain impossible under every policy in this lab. Add the support floor before restarting: exploration is now possible, but still sampling-limited. This models a hard support restriction; ordinary finite-logit softmax models often instead have tiny nonzero probabilities.

**D. Observe zero-signal batches.** Use only zero-quality outputs. Every method's reward-driven update is zero here. With a narrow quality cluster, GRPO and rank transforms can still generate substantial relative weights from small differences. In the binary task, an all-failure group has no within-group quality information.

**E. Distinguish real excellence from a judge error.** Turn on false high scores. The learner sees a false reward of 1 for 2% of poor sampled outputs. The charts still evaluate true rewards. Look for growing poor-output mass or a lower true mean. Try different seeds: this failure need not appear in every short run.

**F. Change model sharing.** The independent model can adjust every output separately. The shared curve and neural scorer couple output probabilities. These are actual gradient updates through the stated functions. They do not model language, token sequences, curricula, or which partial answers are useful stepping stones.

**G. Test ranking invariance.** Compare original, log, and square with the elite rule. With strictly increasing transformations and unchanged ties, the selected samples and resulting trajectory are identical for a fixed seed. Reciprocal reverses them. For binary tasks, many other differences also disappear.

**H. Check robustness.** Use the built-in sweep, then vary learning rate, rollout count, PKPO k, and seed. Do not treat a single fixed-learning-rate run as a ranking of algorithms. The optional equal-gradient-length setting isolates update direction, but changes the optimizer and the expected update; it is another experiment, not a fairness guarantee.

## 7. What the saved sweep actually found

The saved results cover 11 distributions × 3 models × 3 output tasks × 5 transforms × 3 seeds = **1,485 trials**, with six algorithms per trial (**8,910 method runs**). Each uses 150 updates, n=16, PKPO k=4, evaluation k=16, learning rate 0.15, an accurate judge, and no support floor. Transforms are original, log-like, square, group normal scores, and reciprocal. This does not exhaust all possible distributions or settings.

A few directly computed observations:

- In the moderate-spike continuous task with independent logits, TailRL's mean true reward was 0.794 with original rewards and 0.896 with squared rewards after 150 updates. These are means over three seeds, not a general superiority claim.
- With excellent outputs absent, all algorithms retained exactly zero excellent-output probability. Several still improved intermediate quality. Thresholded MaxRL did not update because it never observed success.
- With only 0.1% initial probability of an excellent output, results were sensitive to sampling luck. MaxRL's final mean had a between-seed standard deviation of about 0.274 in the independent continuous task.
- The reciprocal transform substantially reduced true reward for several methods despite being numerically well-defined.
- Outcomes changed sharply with model sharing and training horizon. These differences are precisely why a single histogram or final mean is insufficient.

The machine-readable files include initial metrics and final mean, excellent probability, poor probability, middle mass, entropy, and best-of-16, with sample standard deviations across the three seeds. Standard deviations are not confidence intervals. The browser's built-in sweep uses the currently selected settings and may differ from the saved sweep.

## 8. Limits and the next serious test

This lab discretizes outcomes into 21 positions. It cannot faithfully represent unbounded or infinite-variance tails, semantic clusters, autoregressive token credit assignment, long-horizon exploration, or real judge reliability. Normality is not a requirement of these policy-gradient estimators. Some objectives require finite moments or suitable support; changing the plot cannot repair a mathematically undefined expectation.

To test your intermediate-behavior hypothesis on a real model, collect per-prompt outputs across checkpoints and seeds, retain original reward values, and label recurring strategies. Track the probability of useful intermediate strategies alongside failure rate, mean reward, and best-of-k. Then run a controlled intervention that preserves those strategies while matching the other training settings. A histogram gap by itself cannot establish the causal mechanism.

For transforms, first compare a small set of fixed functions with the same reward scale and meaningful zero point. Fit any learned mapping on an explicit training-only reference set, freeze it for the initial comparison, and tune learning rates per method. Keep the untouched evaluation reward. Only then test adaptive transforms, carefully specifying their sample dependence and update rule.

## 9. Verification and files

- `core.js`: the actual learning equations, transforms, toy policies, and metrics.
- `verify.js`: exact enumeration of finite-batch gradient expectations for RLOO, TailRL, and PKPO; numerical derivatives for both shared models; affine invariances; binary equivalence; tied groups; and 132 combinations checked for finite normalized probabilities and support preservation.
- `stress-results.json` / `stress-results.csv`: the saved 1,485-trial sweep.
- `sweep.js`: reproduces that sweep using Node.js alone.
- `index.html`, `app.js`, `views.js`, `charts.js`, and `styles.css`: the standalone local website.
- `worker.js`: independent paired comparisons and all-distribution sweeps.
- `config.js` and `verify-site.js`: validated settings and checks for the piecewise map and worker experiments.

The original inline interface was checked at 736px and 360px. The standalone website adds a separate browser verification script, `qa-site.cjs`; see `README.md` for the local application and its controls.


## 10. The local website and your two-piece reward idea

The local website adds a continuous or deliberately discontinuous piecewise transformation:

    g(r) = [a min(r,t) + b max(0,r-t) + j 1(r>t)] / [a t + b (1-t) + j].

Here a and b are positive slopes for the bulk and tail, t is the dividing threshold, and j ≥ 0 is an optional jump. The denominator rescales the endpoints to 0 and 1. At j = 0 the pieces meet continuously. A positive jump leaves a gap on the transformed score axis; that gap exists before any policy update. With continuous positive density over an interval, a continuous strictly increasing map cannot create a literal support gap, although it can make parts of the density much sparser or change its modes. Actual policy learning can independently concentrate probability or empty out intermediate reward bins.

Use Reward shaping to inspect the mapping, then the matched comparison in Experiments to train original and transformed rewards from the same settings and seeds. The saved 8,910 method runs predate this addition; they do not include the piecewise transform.
