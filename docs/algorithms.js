/* LaTeX, lessons and finite experiments. Numerical rules live in core.js. */
const RhoAlgorithms = {
  grpo: {
    name: "Group Relative Policy Optimization",
    short: "Group advantages + clipping",
    lead: "Compare several answers to the same prompt, then use their relative scores in a clipped update. GRPO gets its baseline from the group instead of a critic.",
    equation: "A_i = \\frac{r_i-\\mu}{\\sigma}",
    terms: [
      ["r_i", "The training reward for sample i."],
      [
        "\\mu,\\sigma",
        "Group mean and standard deviation; the variance is the mean squared deviation (divisor n).",
      ],
      [
        "A_i",
        "The sample’s advantage, held fixed during the optimization epochs.",
      ],
    ],
    here: "We apply the group advantages through a PPO-style clipped categorical surrogate. We add \\(10^{-8}\\) to \\(\\sigma\\) for numerical stability; equal-reward groups use zero advantages. The paper’s token averaging and reference-policy KL penalty are omitted (\\(\\beta=0\\)).",
    clipped: true,
    why: [
      "Subtracting the average distinguishes better from worse attempts. Dividing by the standard deviation expresses the difference in units of the group’s spread. This is an advantage calculation, not a recipe for changing scores into a Gaussian distribution.",
    ],
    read: [
      "Compute the group mean \\(\\mu\\), subtract it from each score, and divide by the group standard deviation \\(\\sigma\\). A weight of +1 means one group standard deviation above the mean.",
      "Keep these advantages fixed while optimizing the clipped surrogate. The original GRPO objective averages over tokens and includes a reference-policy KL penalty. Here each episode has one action, and the KL penalty is omitted.",
    ],
    shaping: [
      "For \\(f(r)=ar+b\\) with \\(a>0\\), the shift and scale cancel in the ideal standardized advantage. Our numerical stabilizer makes this approximate for extremely small spreads. Try the affine map in the worked example.",
      "Squaring scores preserves their order but changes relative gaps, so the standardized weights can change. A preceding z-score is largely redundant. The group-dependent divisor means this is not generally an unbiased estimate of the fixed expected-reward gradient.",
    ],
    transfer:
      "Real groups contain answers to the same prompt. Standardization can give a small reward difference on one prompt a comparable weight to a large difference on another. Whether that helps depends on what the score differences mean. Shared token parameters, reward reliability and the prompt mixture determine the resulting generalization.",
    citation:
      "DeepSeekMath · §§4.1.1–4.1.2, clipped objective and outcome advantages",
    cases: [
      {
        title: "Every answer ties",
        text: "The standard deviation is zero. This implementation explicitly uses zero advantages; adding numerical epsilon is not new information.",
        settings: {
          preset: "zero",
        },
      },
      {
        title: "Almost tied answers",
        text: "Compare GRPO with RLOO on a narrow score range. Inspect advantage magnitudes; a visible update need not imply a large quality difference.",
        settings: {
          preset: "narrow",
        },
      },
      {
        title: "A faulty judge",
        text: "A false high score can make a poor answer rank first in its group. Relative normalization cannot detect that judge error.",
        settings: {
          preset: "right",
          judge: "falsepositive",
        },
      },
    ],
    comparison: ["grpo", "ppo", "rloo"],
  },
  ppo: {
    name: "Proximal Policy Optimization",
    short: "Learned baseline + clipping",
    lead: "Reuse scored answers for several updates. PPO clips terms in the probability-ratio objective to limit the incentive for further movement in the favored direction.",
    equation:
      "\\begin{aligned} L &= \\frac{1}{n}\\sum_{i=1}^{n}\\ell_i, \\\\[4pt] \\ell_i &= \\min\\!\\left(q_i A_i,\\widetilde{q}_i A_i\\right). \\end{aligned}",
    terms: [
      [
        "q_i",
        "Current probability divided by the probability when this group was sampled.",
      ],
      [
        "\\widetilde{q}_i",
        "The ratio \\(q_i\\) clipped to \\([1-\\epsilon,1+\\epsilon]\\).",
      ],
      ["A_i", "Reward minus the learned value baseline in this example."],
      ["\\ell_i", "Clipped surrogate term for one sample."],
      ["\\epsilon", "The clipping width. Default: 0.2."],
      ["n", "Number of samples in the group."],
    ],
    here: "The scalar critic is updated after each group. There are no sequences, temporal GAE or entropy bonus. Clipping is active in the displayed policy updates.",
    clipped: true,
    why: [
      "Generating a group can be expensive. Several optimization passes, called epochs, can reuse it. After the first pass, however, the current policy differs from the one that produced those samples.",
      "The ratio \\(q_i\\) measures that change for an answer. If its probability moves from 0.20 to 0.28, the ratio is 1.4: it is 40% more likely, not 1.4 probability.",
    ],
    read: [
      "The plain term \\(q_i A_i\\) rewards increasing the ratio for a positive advantage and decreasing it for a negative one. Hold the advantage and rollout probability fixed throughout the epochs.",
      "PPO takes the smaller of the plain and clipped terms. With \\(\\epsilon=0.2\\), a positive-advantage term stops improving beyond \\(q=1.2\\); a negative-advantage term stops improving below \\(q=0.8\\). Movement in the harmful direction is still penalized.",
    ],
    shaping: [
      "Clipping happens after rewards have become advantages. It clips a probability-ratio term, so it neither caps high rewards nor makes their distribution normal.",
      "A score map can change which advantages are positive, their sizes, and when clipping becomes active. With a learned critic, shifting score units also changes baseline calibration. Keeping the same clipping width does not make different reward maps equivalent.",
    ],
    transfer:
      "In language-model training, ratios are often computed at token positions, and value estimates, masks, length averaging and reference-policy penalties matter. Here each answer is one action and the critic is one scalar. The clipping geometry transfers; the exact probability changes below do not predict a token model’s changes.",
    citation: "Schulman et al. (2017) · §3, clipped surrogate, equation 7",
    cases: [
      {
        title: "Many epochs, a large step",
        text: "Inspect the clipped-gradient fraction and KL after each update. A flat surrogate term does not constrain every probability ratio to the clipping interval.",
        settings: {
          preset: "bell",
          lr: 1,
          ppoEpochs: 8,
        },
      },
      {
        title: "All tied scores",
        text: "A learned critic can still be wrong even when all rewards agree. In the all-zero, single-outcome preset here, there is no probability change.",
        settings: {
          preset: "zero",
        },
      },
      {
        title: "False successes",
        text: "Clipping can limit an incentive while still reinforcing a mislabeled answer. Compare poor-output probability with the training signal.",
        settings: {
          preset: "right",
          judge: "falsepositive",
        },
      },
    ],
    comparison: ["ppo", "grpo", "trpo"],
  },
  tailrl: {
    name: "Tail-Likelihood Reinforcement Learning",
    short: "Tail-weighted gradient",
    lead: "Ask how likely an answer is to clear each reward threshold. Improving a threshold that few answers clear receives more weight.",
    equation:
      "J(\\theta)=\\int_0^1\\log\\operatorname{Pr}_{\\theta}(R>t)\\,\\mathrm{d}t",
    terms: [
      ["t", "A reward threshold."],
      [
        "\\operatorname{Pr}_{\\theta}(R>t)",
        "Probability of exceeding that threshold.",
      ],
      [
        "J",
        "Population objective. The visualizer uses a finite-group gradient estimator.",
      ],
      ["R", "The reward of a random answer."],
      ["\\theta", "The parameters determining answer probabilities."],
    ],
    here: "The displayed population integral uses rewards in \\([0,1]\\). With a fixed reward map, the centered estimator implements finite order \\(T=n-1\\) using \\(n\\) independent samples and a mean-gradient update. A group-fitted map changes that fixed-reward argument. Sorting computes weights; it does not reorder the policy’s bars.",
    why: [
      "Mean reward averages scores. TailRL averages log probabilities of exceeding reward thresholds. What a threshold means depends on how the reward is defined.",
      "If a threshold is cleared with probability \\(p\\), a small absolute improvement has local weight \\(1/p\\) inside \\(\\log p\\). Integrating over thresholds extends the log-success idea to graded rewards.",
    ],
    read: [
      "\\(\\Pr_\\theta(R>t)\\) is the probability mass to the right of threshold \\(t\\). The integral combines these log tail probabilities over rewards normalized to \\([0,1]\\).",
      "The browser uses a finite-group estimator. Sort the scores, divide each new score gap by how many samples survive above the previous level, and accumulate those increments. Center the accumulated values and multiply by group size before the mean-gradient update.",
    ],
    shaping: [
      "For a fixed smooth increasing map \\(f\\), rescaling the reward axis weights thresholds by \\(f'(t)\\). Changing relative slopes therefore changes the objective. The piecewise option is rescaled to keep endpoints at 0 and 1; its slope and jump controls are relative.",
      "A continuous increasing map of a fully supported interval cannot insert a literal support gap. It can change density and make a region look sparse. A jump in the score map can create a gap in score space; learning changes the probabilities separately.",
    ],
    transfer:
      "Thresholds come from the judge, not from the model’s internal reasoning. A rare false high score can receive strong weight. A hollow middle in a histogram does not show that intermediate reasoning skills disappeared: that requires tests on actual outputs and prompts.",
    citation: "TailRL · tail objective, Proposition 9 and Appendix F",
    cases: [
      {
        title: "A judge error in the tail",
        text: "Compare true poor-output probability with the training score. A rare high label may reward the wrong outcome.",
        settings: {
          preset: "right",
          judge: "falsepositive",
        },
      },
      {
        title: "No upper-tail support",
        text: "The population log objective is singular if an interval of thresholds has zero survival probability. Finite-group weights remain computable, but they cannot create missing support here.",
        settings: {
          preset: "missing",
        },
      },
      {
        title: "Different slopes",
        text: "Use the continuous piecewise map to shrink low-score gaps relative to high-score gaps. Inspect original-reward probabilities; stretching score gaps does not itself move probability mass.",
        settings: {
          preset: "spike",
          transform: "hinge",
          jump: 0,
        },
      },
    ],
    comparison: ["tailrl", "grpo", "rloo"],
  },
  rloo: {
    name: "REINFORCE Leave-One-Out",
    short: "Other-sample baseline",
    lead: "Judge an answer relative to the other attempts at the same problem. Those other scores provide a baseline without training a critic.",
    equation: "A_i = r_i - \\frac{\\sum_{j\\ne i}r_j}{n-1}",
    terms: [
      ["n", "Number of sampled outcomes in this group."],
      ["A_i", "Reward relative to the other samples."],
      ["r_i", "The training score of answer i."],
      [
        "j",
        "An index over the other samples; \\(j\\ne i\\) excludes this answer.",
      ],
    ],
    here: "One categorical policy-gradient step per group. A fixed nonlinear reward map changes the target from expected reward to expected mapped reward.",
    why: [
      "A reward of 0.5 might be encouraging on a difficult problem and disappointing on an easy one. A baseline supplies that context. An advantage is the reward minus this comparison value.",
      "RLOO uses the other answers in the group as the comparison. Leaving the current answer out matters: otherwise that answer would help determine the baseline being subtracted from itself.",
    ],
    read: [
      "For answer \\(i\\), sum the other \\(n-1\\) rewards and divide by \\(n-1\\). Subtract that average from \\(r_i\\). A negative weight is allowed; it is not a negative probability.",
      "For independent samples from the same policy and a fixed reward function, the other-sample baseline preserves the expected policy gradient. The resulting update still uses \\(A_i\\nabla_\\theta\\log\\pi_\\theta(y_i)\\).",
    ],
    shaping: [
      "A shared additive offset cancels exactly. Multiplying scores by a positive constant multiplies the advantages by that constant. A nonlinear map changes the relative gaps and therefore the expected-reward objective.",
      "Normal scores fitted separately to each group are a different case: an answer’s training score now depends on its companions. The usual fixed-reward unbiasedness argument no longer applies directly. No Gaussian reward assumption is needed.",
    ],
    transfer:
      "In sequence-level RL, the group contains multiple completions of one prompt. An easy prompt’s answers should not serve as the baseline for an unrelated hard prompt. RLOO removes the need for a learned baseline, but the extra completions still cost generation time.",
    citation: "Ahmadian et al. · §2.3, leave-one-out estimator",
    cases: [
      {
        title: "Too few rare successes",
        text: "Use a small group and a rare excellent outcome. Many groups contain only poor answers and produce no relative signal. Increase the group size and compare several seeds.",
        settings: {
          preset: "rare",
          n: 8,
        },
      },
      {
        title: "All scores tied",
        text: "No answer beats its companions, so every advantage is zero. Normalizing the tied scores cannot invent an ordering.",
        settings: {
          preset: "zero",
        },
      },
      {
        title: "A nonlinear score map",
        text: "Compare Identity and Square on two modes. Inspect the weights in a sampled group before interpreting the changed bars.",
        settings: {
          preset: "bimodal",
          transform: "square",
        },
      },
    ],
    comparison: ["rloo", "grpo", "tailrl"],
  },
  maxrl: {
    name: "Maximum Likelihood Reinforcement Learning",
    short: "Binary success weights",
    lead: "Treat an answer as a success or a failure. Scale its relative success label by how often the group succeeds, so a rare success receives a strong weight.",
    equation:
      "A_i = \\begin{cases} \\dfrac{b_i-\\widehat{p}}{\\widehat{p}}, & \\widehat{p}>0, \\\\[5pt] 0, & \\widehat{p}=0. \\end{cases}",
    terms: [
      ["b_i", "1 if the judged reward is at least 0.9; otherwise 0."],
      ["\\widehat{p}", "Fraction of successful samples in the group."],
      ["A_i", "The weight applied to this answer’s log-probability gradient."],
    ],
    here: "This finite-group binary rule bypasses the reward map. We use zero weights when the group has no successes; an all-success group also has zero centered weights. It is not the paper’s full LLM training system. With n samples, this centered-and-skipped estimator targets finite order T = n − 1; it is not an exact estimator of the infinite-order log objective.",
    why: [
      "Let \\(p\\) be the chance of a correct answer on one prompt. Maximizing \\(\\log p\\) puts more gradient weight on an equal absolute improvement when \\(p\\) is small, since its derivative is \\(1/p\\).",
      "For one unconstrained prompt, success probability and log success probability have the same maximizer. Across prompts sharing model parameters, weighting improvements differently can matter. MaxRL uses a finite-sample family related to this log-success objective.",
    ],
    read: [
      "Convert judged scores into binary labels \\(b_i\\). Here a score of at least 0.9 counts as success. Compute their mean \\(\\widehat p\\), then divide centered labels by that mean.",
      "For labels \\([0,0,1]\\), \\(\\widehat p=1/3\\), giving weights \\([-1,-1,2]\\). A no-success group must be handled separately because division by zero is undefined; this app skips it.",
    ],
    shaping: [
      "The success definition must stay meaningful. This app thresholds the judge’s original score and bypasses continuous reward maps. Selecting Square or an affine map in the worked example therefore leaves MaxRL unchanged.",
      "Turning a continuous task into pass/fail discards progress below the threshold. Going from 0.1 to 0.8 is useful according to the original scores, but both are failures under the chosen threshold. MaxRL does not fit a normal distribution.",
    ],
    transfer:
      "A correctness checker can supply binary labels for model completions. Difficulty-dependent weights can redistribute learning across prompts, but an unseen success still supplies no sampled success signal. A false positive is particularly consequential when genuine successes are rare.",
    citation:
      "Tajwar et al. · §4.3, Algorithm 1 (centered; no-success groups skipped)",
    cases: [
      {
        title: "No successful sample",
        text: "Try missing successes. Every judged score is below 0.9, so this rule has zero weights even when other methods distinguish partial progress.",
        settings: {
          preset: "missing",
        },
      },
      {
        title: "Rare successes",
        text: "Some groups contain no success; occasional groups do. Compare seeds and group sizes before calling a single jump an algorithm advantage.",
        settings: {
          preset: "rare",
          n: 8,
        },
      },
      {
        title: "False positives",
        text: "A mislabeled poor output can receive the rare-success weight. Inspect true poor-output probability, not just the binary training score.",
        settings: {
          preset: "right",
          judge: "falsepositive",
        },
      },
    ],
    comparison: ["maxrl", "rloo", "tailrl"],
  },
  pkpo: {
    name: "Pass@K Policy Optimization",
    short: "Best-of-k gradient",
    lead: "Train for the best result among several attempts. An answer is useful when it improves on what the other attempts would already provide.",
    equation:
      "\\begin{aligned} m_S &= \\max_{j\\in S}r_j, \\\\[4pt] A_i &= k\\,\\mathbb{E}_S\\!\\left[(r_i-m_S)_+\\right]. \\end{aligned}",
    terms: [
      ["k", "Target number of attempts, at most the group size here."],
      [
        "S",
        "A uniformly chosen subset of \\(k-1\\) other sample indices, excluding \\(i\\).",
      ],
      ["(x)_+", "\\(\\max(0,x)\\)."],
      ["\\mathbb{E}_S", "Average over those subsets."],
      ["r_i", "The training score of answer i."],
      ["m_S", "The best score in the chosen subset."],
      ["n", "The number of samples in the group."],
      ["A_i", "The weight used in the group-mean gradient."],
    ],
    here: "The continuous-reward leave-one-out-minus-one estimator from equation 33. For \\(k=1\\) we use RLOO. With fixed binary rewards the objective is pass@k; with fixed graded rewards it is expected maximum reward.",
    equationNote:
      "For \\(2\\le k\\le n\\); when \\(k=1\\), the visualizer uses RLOO.",
    why: [
      "If you can try \\(k\\) times and reliably select the best answer, the relevant target can be expected best-of-\\(k\\) reward. A merely adequate answer may add little when another attempt is already better.",
      "For binary correctness this is pass@\\(k\\), the chance that at least one attempt succeeds. For continuous scores the target here is the expected maximum score; selection quality remains an assumption.",
    ],
    read: [
      "Choose \\(k-1\\) other sample indices, called \\(S\\). Their best reward is \\(m_S\\). Measure how much answer \\(i\\) beats that best reward, using zero if it does not.",
      "Average over all eligible subsets and multiply by \\(k\\). Our gradient averages these weights over the group; the paper’s equation 33 folds that group-size factor into its coefficients. This is the continuous leave-one-out-minus-one estimator.",
    ],
    shaping: [
      "An increasing map preserves which member of a set is best, but changes the size of the improvement. Consequently it can change the best-of-k gradient. A shared offset cancels out of these differences for k greater than one.",
      "For k = 1 this app uses RLOO. Training and evaluation budgets are distinct concepts; this interface uses one k control for both. Keep the evaluation budget fixed when comparing runs. A group-fitted reward map no longer estimates best-of-k for a fixed scoring function.",
    ],
    transfer:
      "Retries help only when the system can afford them and can recognize a good answer. A learned judge may select the wrong one. Training for retries and training for one dependable response are different objectives; use both single-attempt and retry metrics when assessing transfer.",
    citation: "PKPO · §4.3, equation 33 (group-mean convention here)",
    cases: [
      {
        title: "Two modes, eight attempts",
        text: "Compare mean reward and expected best-of-8. A higher retry score does not by itself demonstrate better typical answers.",
        settings: {
          preset: "bimodal",
          k: 8,
        },
      },
      {
        title: "A rare excellent answer",
        text: "If the group misses the rare answer, it cannot credit that answer’s marginal contribution. Compare more samples and different seeds.",
        settings: {
          preset: "rare",
          n: 8,
          k: 4,
        },
      },
      {
        title: "A mistaken selector",
        text: "A false high score makes a poor answer appear to improve the set. Compare the judged objective with true-score metrics.",
        settings: {
          preset: "right",
          judge: "falsepositive",
          k: 4,
        },
      },
    ],
    comparison: ["pkpo", "rloo", "tailrl"],
  },
  reinforce: {
    name: "REINFORCE",
    short: "Raw-reward gradient",
    lead: "Weight each sampled answer’s log-probability gradient by its reward. Average those contributions to update the policy, then sample again.",
    equation:
      "\\begin{aligned} g_i &= r_i\\nabla_{\\theta}\\log\\pi_{\\theta}(y_i), \\\\[4pt] \\Delta\\theta &= \\frac{\\eta}{n}\\sum_{i=1}^{n}g_i. \\end{aligned}",
    terms: [
      ["r_i", "The training reward for sample i."],
      [
        "\\pi_\\theta(y_i)",
        "Probability of sampled answer y_i under the current policy.",
      ],
      ["\\theta", "The outcome logits in this example."],
      ["\\eta", "Learning rate."],
      ["y_i", "A sampled outcome."],
      ["g_i", "One sample’s reward-weighted score gradient."],
      ["n", "Number of samples in the group."],
    ],
    here: "No baseline, critic or temporal credit assignment. Rewards come from one terminal action.",
    why: [
      "Suppose an answer checker can give you a score but cannot tell you how to edit the model. REINFORCE uses a different piece of information: the model knows how its own parameters affect the probability of the answer it just generated.",
      "Its target is expected reward: the average score you would obtain over many fresh attempts. One lucky high score is only one noisy observation of that target.",
    ],
    read: [
      "\\(\\nabla_\\theta\\log\\pi_\\theta(y_i)\\) is a direction in parameter space that increases the log probability of sampled answer \\(y_i\\). You do not differentiate the checker.",
      "Multiply that direction by the reward. Average over the \\(n\\) samples, then take a step of size \\(\\eta\\). The expectation of this estimate is the gradient of expected reward for a fixed reward function.",
    ],
    shaping: [
      "An increasing nonlinear map still preserves which individual score is better, but changes how much better. Squaring scores makes the gap between 0.5 and 1 larger relative to the gap between 0 and 0.5. The target becomes \\(\\mathbb{E}[f(R)]\\).",
      "Adding a constant does not change the expected gradient. It can change a sampled update because the sampled score gradients need not cancel. In the balanced three-answer example below they do cancel; repeated random groups in the full visualizer need not.",
    ],
    transfer:
      "For a language model, an answer’s log probability is the sum of its token log probabilities. A final score can weight that whole sequence. This does not identify which reasoning step caused success. Shared parameters can also change answers that were never sampled.",
    citation: "Williams (1992) · statistical gradient estimation",
    cases: [
      {
        title: "A reward offset",
        text: "Run several seeds with Identity and Positive affine. Compare fluctuations and mean reward. The affine option also doubles score gaps, so separate that scale effect from the added constant.",
        settings: {
          preset: "narrow",
          transform: "affine",
        },
      },
      {
        title: "A missing outcome",
        text: "With exactly zero support, an excellent answer cannot be sampled in this app. Giving existing answers larger weights does not create that missing support.",
        settings: {
          preset: "missing",
        },
      },
      {
        title: "False high scores",
        text: "A poor answer that the judge scores highly gets a positive gradient weight. Its final probability change also depends on the other samples. Track poor-output probability.",
        settings: {
          preset: "right",
          judge: "falsepositive",
        },
      },
    ],
    comparison: ["reinforce", "rloo", "grpo"],
  },
  a2c: {
    name: "Advantage Actor–Critic",
    short: "Learned value baseline",
    lead: "Keep a running prediction of how rewarding an attempt will be. The actor learns from the difference between the observed reward and that prediction.",
    equation:
      "\\begin{aligned} A_i &= r_i-V, \\\\[4pt] V &\\leftarrow V+\\alpha(\\bar{r}-V). \\end{aligned}",
    terms: [
      ["V", "The learned scalar value of the single state."],
      [
        "\\alpha",
        "Critic learning rate, separate from the actor learning rate.",
      ],
      ["\\bar r", "Mean training reward of the sampled group."],
      ["r_i", "The training score of this answer."],
      ["A_i", "Reward minus the current value prediction."],
    ],
    here: "A synchronous one-state actor–critic. The visualizer’s critic starts at zero; the worked example sets it to 0.4. It updates after the actor. Mnih et al. provide the actor–critic foundations; this does not reproduce their asynchronous A3C architecture.",
    why: [
      "The actor is the policy that produces answers. The critic predicts the return before the answer is known. Their difference is an advantage: better or worse than expected.",
      "Here there is one prompt and one terminal action, so the critic is just a number. This makes it possible to see baseline learning without introducing a second neural network.",
    ],
    read: [
      "Compute \\(A_i=r_i-V\\) using the critic value from before this group. Use those advantages for the actor’s policy-gradient step.",
      "Then move \\(V\\) a fraction \\(\\alpha\\) of the way toward the group’s mean reward \\(\\bar r\\). The actor learning rate \\(\\eta\\) and critic learning rate \\(\\alpha\\) control different updates.",
    ],
    shaping: [
      "The critic must use the same score units as the actor. If scores change from 0–1 to 1–3, an unchanged critic prediction is temporarily badly calibrated. A smaller critic learning rate takes longer to catch up.",
      "A baseline independent of the sampled action preserves the expected one-step gradient even if inaccurate; its quality affects variance. In a multi-step task, bootstrapping from an approximate critic introduces additional estimation issues absent here.",
    ],
    transfer:
      "A full actor–critic predicts value from a state or token prefix and deals with future rewards. Our terminal-answer example has neither delayed rewards nor temporal bootstrapping. The cited Mnih paper develops asynchronous actor–critic foundations; this synchronous scalar example is not an A3C reproduction.",
    citation:
      "Mnih et al. · actor–critic foundations; terminal specialization shown here",
    cases: [
      {
        title: "A slow critic",
        text: "Start on shifted scores with a slow critic. Inspect the baseline and critic values alongside the sampled weights. Its prediction begins in the wrong score range.",
        settings: {
          preset: "bell",
          transform: "affine",
          criticRate: 0.01,
        },
      },
      {
        title: "A noisy judge",
        text: "The critic learns the average observed score, including judge errors. A good baseline does not fix a bad reward signal.",
        settings: {
          preset: "right",
          judge: "noise",
        },
      },
      {
        title: "A narrow score range",
        text: "Small meaningful differences can coexist with a large baseline error. Compare A2C with RLOO, which recomputes a baseline from the current group.",
        settings: {
          preset: "narrow",
        },
      },
    ],
    comparison: ["a2c", "reinforce", "rloo"],
  },
  trpo: {
    name: "Trust Region Policy Optimization",
    short: "KL-constrained step",
    lead: "Choose a promising update, then check how far it moves the whole policy. Reject or shorten the step if its probability change exceeds a budget.",
    equation:
      "\\begin{gathered} \\underset{\\theta}{\\operatorname{maximize}}\\quad L(\\theta) \\\\[4pt] \\operatorname{KL}\\!\\left(\\pi_{\\mathrm{old}}\\,\\|\\,\\pi_{\\theta}\\right)\\le\\delta. \\end{gathered}",
    terms: [
      ["L", "The sampled probability-ratio surrogate."],
      [
        "\\delta",
        "Allowed average KL; exact across outcomes in this one-state example.",
      ],
      ["\\theta", "Policy parameters."],
      [
        "\\pi_{\\mathrm{old}},\\pi_\\theta",
        "Answer probabilities before and after a proposed update.",
      ],
      [
        "\\operatorname{KL}",
        "An asymmetric measure of distribution change: \\(\\sum_y p_{\\mathrm{old}}(y)\\log\\frac{p_{\\mathrm{old}}(y)}{p_\\theta(y)}\\). Zero means the distributions agree.",
      ],
    ],
    here: "Exact categorical Fisher-vector products with 0.01 damping, up to 12 conjugate-gradient iterations and up to 12 line-search trials. RLOO supplies the advantages. The step uses its KL budget rather than the shared learning rate.",
    why: [
      "A fixed learning rate measures distance in parameter space. The same parameter step can have very different effects on probabilities, especially near rare outcomes.",
      "TRPO instead measures policy change with KL divergence. Its natural-gradient direction uses the Fisher matrix, which describes local sensitivity of probabilities to parameter changes.",
    ],
    read: [
      "\\(L(\\theta)\\) is a sampled surrogate: a local estimate of improvement using the old rollout distribution. The KL constraint limits the change from \\(\\pi_{\\mathrm{old}}\\) to the new policy.",
      "The practical procedure computes a direction, proposes a step and backtracks: try a shorter step until the surrogate improves and the measured KL fits the budget. If none passes, keep the old policy. The population guarantee and this sampled procedure have different assumptions.",
    ],
    shaping: [
      "In an ideal natural-gradient calculation with a fixed KL budget, a positive scaling of all advantages cancels when the step is normalized to the budget. Finite precision and line-search tolerances can affect this in practice.",
      "A nonlinear map can change the direction itself. KL only measures movement; it does not determine whether the rewards are truthful. In this app TRPO uses RLOO advantages and ignores the common actor learning rate.",
    ],
    transfer:
      "Here Fisher-vector products and KL sum over all 21 actions. Large models need tractable estimates across states and actions; Fisher-vector products avoid constructing a full parameter-sized matrix. Small KL on training states does not establish improvement on unseen prompts.",
    citation: "Schulman et al. (2015) · §§4–6 and Appendix C",
    cases: [
      {
        title: "A noisy small group",
        text: "Compare the accepted step and KL with true mean reward. A surrogate improvement on a few samples can disagree with population improvement.",
        settings: {
          preset: "rare",
          n: 8,
        },
      },
      {
        title: "No direction to follow",
        text: "When every advantage is zero, the procedure has no improving direction and leaves the policy alone.",
        settings: {
          preset: "zero",
        },
      },
      {
        title: "A larger KL budget",
        text: "A larger budget permits more movement; it does not require it. Compare the change in poor and excellent probabilities.",
        settings: {
          preset: "bell",
          trustKL: 0.05,
        },
      },
    ],
    comparison: ["trpo", "ppo", "rloo"],
  },
  elite: {
    name: "Elite selection baseline",
    short: "Top-20% likelihood heuristic",
    lead: "Keep the highest-scoring part of a group and increase its likelihood. This selection baseline uses rank, discarding the size of reward gaps.",
    equation:
      "A_i = \\begin{cases} \\dfrac{n}{|\\mathcal{E}|}, & i\\in\\mathcal{E}, \\\\[5pt] 0, & \\text{otherwise}. \\end{cases}",
    terms: [
      [
        "\\mathcal{E}",
        "Samples at or above the top-20% cutoff, including ties.",
      ],
      ["n", "Number of samples in the group."],
      ["|\\mathcal E|", "Number selected, including cutoff ties."],
      ["A_i", "The weight used in the likelihood update."],
    ],
    here: "An illustrative selection heuristic, not a full cross-entropy method implementation. All-tied groups are skipped. The linked paper supplies context for quantile-based objectives.",
    why: [
      "Select the highest-scoring 20% of samples, rounding the count up and retaining cutoff ties. Use those selected answers as positive examples.",
      "This is a heuristic comparator. Cross-entropy methods motivate quantile-based selection; here we take one likelihood-gradient step instead of refitting the distribution.",
    ],
    read: [
      "\\(\\mathcal E\\) is the selected set. Give each selected sample weight \\(n/|\\mathcal E|\\), so averaging over all \\(n\\) samples is equivalent to averaging the log-likelihood gradient over the elites.",
      "Non-selected samples have zero direct weight. Their probabilities can still fall when the policy increases selected answers and renormalizes. If all scores tie, this implementation skips the group.",
    ],
    shaping: [
      "Any strictly increasing map preserves the selected set if ties are unchanged. Original scores, squares and positive affine scores therefore give the same update for a fixed sampled group here.",
      "A decreasing map reverses preferences. A map that merges previously different scores into ties can change selection too. Rank invariance is narrower than saying reward transformations never matter.",
    ],
    transfer:
      "Selecting good model completions and fitting their likelihood resembles rejection-based fine-tuning. It provides no direct signal about how much better one selected answer is than another. Diversity, judge reliability and whether discarded attempts contain useful behaviors need separate evaluation.",
    citation:
      "Goschin et al. (2013) · quantile-based CEM context; heuristic implemented here",
    cases: [
      {
        title: "Reversed ranking",
        text: "The reciprocal map rewards lower original quality. Selection follows the supplied training scores; inspect the direction of true mean reward.",
        settings: {
          preset: "bell",
          transform: "reciprocal",
        },
      },
      {
        title: "A narrow winner",
        text: "Compare how quickly probability concentrates with a mean-reward method. Fast concentration is not evidence that the judge found a reliable strategy.",
        settings: {
          preset: "spike",
        },
      },
      {
        title: "Every score tied",
        text: "An arbitrary tie break would introduce a preference unsupported by reward. This implementation uses zero weights instead.",
        settings: {
          preset: "zero",
        },
      },
    ],
    comparison: ["elite", "rloo", "grpo"],
  },
};
