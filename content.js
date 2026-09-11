"use strict";
const LabContent = {
  transforms: {
    identity: "Identity · no mapping",
    hinge: "Piecewise linear",
    affine: "Positive affine · 2r + 1",
    log: "Log-like · compress high-score gaps",
    square: "Square · expand high-score gaps",
    sqrt: "Square root · expand low-score gaps",
    boxcox: "Box–Cox · shifted and rescaled",
    yeojohnson: "Yeo–Johnson · rescaled",
    zscore: "Group z-score",
    ranknormal: "Group normal scores",
    frozen: "Frozen initial normal scores",
    reciprocal: "Reciprocal · reverses ranking",
  },
  layouts: {
    quality: "Continuous quality · 0 to 1",
    binary: "Binary correctness · 0 or 1",
    code: "Illustrative code rewrites",
  },
  models: {
    independent: "21 independent logits",
    shared: "4 shared curve parameters",
    neural: "Tiny neural scorer · 1 → 8 → 1",
  },
  judges: {
    clean: "No judge error",
    noise: "Gaussian noise · σ = 0.12, scores clipped",
    falsepositive: "False high scores · 2% of poor outputs",
  },
  metrics: {
    mean: "Mean true reward",
    high: "Excellent probability · ≥ 0.9",
    bad: "Poor probability · < 0.3",
    middle: "Middle probability · 0.3–0.9",
    best: "Expected best-of-k reward",
    entropy: "Output entropy · nats",
  },
  names: {
    rloo: "RLOO",
    grpo: "GRPO",
    maxrl: "MaxRL",
    tailrl: "TailRL",
    pkpo: "PKPO",
    elite: "Elite",
    reinforce: "REINFORCE",
    a2c: "A2C",
    ppo: "PPO",
    trpo: "TRPO",
  },
  tags: {
    rloo: "mean reward",
    grpo: "group standardized",
    maxrl: "binary success ≥ 0.9",
    tailrl: "reward tails",
    pkpo: "best-of-k",
    elite: "top 20%",
    reinforce: "Monte Carlo gradient",
    a2c: "learned value baseline",
    ppo: "clipped policy ratio",
    trpo: "KL trust region",
  },
  formulas: {
    rloo: "Aᵢ = yᵢ − mean(other rewards)",
    grpo: "Aᵢ = (yᵢ − μ) / (σ + ε)",
    maxrl: "Aᵢ = (bᵢ − mean(b)) / mean(b)",
    tailrl: "Accumulate sorted gaps / survivors; center; multiply by n",
    pkpo: "Aᵢ = k × E[(yᵢ − max(k−1 others))₊]",
    elite: "Aᵢ = n / elite count for selected outputs; 0 otherwise",
    reinforce: "Aᵢ = yᵢ; no baseline",
    a2c: "Aᵢ = yᵢ − V; fit V to the sampled returns",
    ppo: "Maximize mean min(ρᵢ Aᵢ, clip(ρᵢ, 1−ε, 1+ε) Aᵢ)",
    trpo: "Natural-gradient proposal + backtracking; KL(πold || π) ≤ δ",
  },
  presetNotes: {
    bell: "A broad middle with small probabilities near both extremes.",
    uniform: "Every output position starts equally likely.",
    right: "Mostly poor outputs, with a long but low-probability right tail.",
    left: "Most mass is already near high quality.",
    bimodal: "Two modes are present before any learning happens.",
    valley: "65% at 0.2, 5% at 0.6, 30% at 1. A deliberate hollow middle.",
    rare: "Only 0.1% initial probability of an excellent output. Sampling luck matters.",
    narrow: "Three nearby quality levels: 0.45, 0.50, and 0.55.",
    zero: "One outcome has probability 100% at reward 0. Add initial support to allow other outcomes.",
    missing: "No output above quality 0.7 has initial support.",
    spike: "A narrow moderate-quality peak and a thin excellent tail.",
    custom: "Your shape defines the initial outcome probabilities.",
  },
  modelNotes: {
    independent: "Each output has its own trainable logit.",
    shared:
      "One parameter update can move several output probabilities together.",
    neural:
      "Actual backpropagation through a tanh network. Input is quality position, not text.",
  },
  transformNotes: {
    identity: "Keep the original score gaps.",
    hinge:
      "Slopes and jump are relative: the map is rescaled so 0 maps to 0 and 1 to 1. Zero jump keeps it continuous.",
    affine: "Changes scale and offset while preserving every ordering.",
    log: "Makes low-end score gaps relatively more important.",
    square: "Makes high-end score gaps relatively more important.",
    sqrt: "Expands differences among low scores.",
    boxcox:
      "Adds 0.01 before Box–Cox, then rescales to [0,1]. λ is chosen, not fitted for normality.",
    yeojohnson:
      "Uses the nonnegative branch, rescaled to [0,1]. λ is chosen, not fitted for normality.",
    zscore: "Refits the mean and standard deviation to each sampled group.",
    ranknormal: "Maps tied midranks to normal quantiles within each group.",
    frozen:
      "Uses the initial policy’s reward mid-CDF, clipped to [0.001,0.999], then applies normal quantiles. The map stays fixed and can merge scores into ties.",
    reciprocal:
      "Lower true reward becomes higher training reward. A deliberate failure case.",
  },
  scenarios: [
    {
      title: "Piecewise rewards",
      text: "Start with a moderate spike and a thin excellent tail. Track middle mass, poor outputs, and true mean together.",
      watch:
        "Compare original, square, and piecewise rewards using the matched comparison below. A hollow middle alone is not evidence of damage.",
      cfg: {
        preset: "spike",
        transform: "hinge",
        model: "independent",
        layout: "quality",
        tailAt: 0.7,
        bulkScale: 0.4,
        tailScale: 2,
        jump: 0,
      },
    },
    {
      title: "A jump in the reward map",
      text: "Add a discontinuity to the reward mapping and inspect the two histograms before learning.",
      watch:
        "In Reward shaping, the transformed histogram develops a gap immediately. The true distribution changes only after policy updates.",
      cfg: {
        preset: "uniform",
        transform: "hinge",
        jump: 0.5,
        bulkScale: 1,
        tailScale: 1,
        tailAt: 0.7,
      },
    },
    {
      title: "Rare and absent outcomes",
      text: "Begin with only 0.1% chance of excellence. Then try “Excellent outputs absent,” with and without an initial support floor.",
      watch:
        "An absent outcome cannot be recovered with zero support in this toy model. A rare outcome can be found, but the seed and group size matter.",
      cfg: { preset: "rare", transform: "identity", floor: 0, n: 16 },
    },
    {
      title: "Constant rewards",
      text: "Every sampled output has the same true reward. See what normalization can and cannot create.",
      watch:
        "All-zero rewards produce zero updates for every method here. With a narrow cluster, group normalization can magnify small differences.",
      cfg: { preset: "zero", transform: "ranknormal", floor: 0 },
    },
    {
      title: "Judge errors",
      text: "Give poor outputs a 2% chance of receiving a false score of 1. Evaluation still uses the untouched true reward.",
      watch:
        "Compare low-score probability across seeds. Strong tail weights can amplify false high scores.",
      cfg: {
        preset: "right",
        transform: "square",
        judge: "falsepositive",
        n: 32,
      },
    },
    {
      title: "Shared parameters",
      text: "Run the neural scorer and inspect how an update affects other outputs through shared weights.",
      watch:
        "Compare independent logits, the shared curve, and the neural scorer at the same settings. This tests parameter coupling, not language understanding.",
      cfg: { preset: "bimodal", transform: "identity", model: "neural" },
    },
    {
      title: "Binary rewards",
      text: "Collapse quality to correct or incorrect. A deterministic transformation still has at most two output values.",
      watch:
        "With a clean judge, MaxRL and centered TailRL have identical binary update weights in this lab. Many monotone-transform differences disappear.",
      cfg: {
        preset: "bell",
        layout: "binary",
        transform: "square",
        judge: "clean",
      },
    },
    {
      title: "Reversing reward order",
      text: "The elite rule sees the same ordering under log and square, but the reciprocal deliberately reverses it.",
      watch:
        "Run a matched comparison. With a strictly increasing map and unchanged ties, the elite trajectory is identical for a fixed seed.",
      cfg: { preset: "bell", transform: "reciprocal", model: "independent" },
    },
  ],
  methods: [
    {
      id: "reinforce",
      target:
        "Monte Carlo policy gradient for expected transformed return, with no baseline.",
      edge: "Can have high variance. A constant nonzero reward can still produce noisy individual updates even though its expected gradient is zero.",
      effect:
        "A fixed nonlinear map changes the objective. An offset leaves the expected policy gradient unchanged but can change its sampling variance.",
      url: "https://link.springer.com/article/10.1007/BF00992696",
      source: "Williams · REINFORCE (1992)",
    },
    {
      id: "a2c",
      target:
        "Synchronous actor–critic specialized to a one-state, terminal-action environment.",
      edge: "The critic is a learned scalar value. There is no temporal bootstrapping, discounting, asynchronous actor, or separate value network in this environment.",
      effect:
        "Training uses A = g(r) − V. The critic must track a changed reward scale; a stale baseline can increase variance. The value update follows the policy update.",
      url: "https://arxiv.org/abs/1602.01783",
      source: "Mnih et al. · actor–critic foundations",
    },
    {
      id: "ppo",
      target:
        "The clipped surrogate objective, with multiple epochs on each sampled group and a learned scalar baseline.",
      edge: "PPO clipping limits some policy-ratio incentives; it is not a hard KL guarantee. More epochs use more compute per rollout. No temporal GAE or entropy bonus is included.",
      effect:
        "A = g(r) − V is fixed while reusing the group. Nonlinear maps change advantages; clipping then acts on probability ratios, not directly on reward values.",
      url: "https://arxiv.org/abs/1707.06347",
      source: "Schulman et al. · PPO (2017)",
    },
    {
      id: "trpo",
      target:
        "A Fisher-based natural-gradient direction with a sampled surrogate and explicit KL-constrained backtracking.",
      edge: "The 21-action Fisher is integrated exactly, with 0.01 damping and 12 conjugate-gradient iterations. A proposal can be rejected. This is a one-state specialization, not a full benchmark replication.",
      effect:
        "Uses RLOO advantages. The step is set by the KL budget, not the common SGD rate or unit-gradient option. The line search checks surrogate improvement, not true expected reward.",
      url: "https://arxiv.org/abs/1502.05477",
      source: "Schulman et al. · TRPO (2015)",
    },
    {
      id: "rloo",
      target: "Expected reward for a fixed reward function.",
      edge: "Missing support and all-tied groups give no discovery signal. A transform fitted to the same batch changes the fixed-reward argument.",
      effect:
        "A fixed nonlinear map changes the target to E[g(R)]. Positive affine scaling changes gradient magnitude.",
      url: "https://arxiv.org/abs/2402.14740",
      source: "RLOO paper",
    },
    {
      id: "grpo",
      target:
        "Group-standardized advantages with a clipped categorical policy-ratio surrogate and repeated epochs.",
      edge: "Identical groups have no signal. Small reward differences can receive large relative weights. Token-level aggregation and a reference-policy KL penalty are omitted.",
      effect:
        "Positive affine changes mostly cancel; nonlinear maps alter the relative standardized gaps. A preceding z-score is mostly redundant.",
      url: "https://arxiv.org/html/2402.03300v3#S4",
      source: "DeepSeekMath · §4.1",
    },
    {
      id: "maxrl",
      target:
        "Correctness-based learning; the population limit emphasizes log success probability.",
      edge: "No successful sample means no update; all-success groups also have zero centered signal. Mean division needs a meaningful zero.",
      effect:
        "In this app, b = 1[judged reward ≥ 0.9]. MaxRL bypasses every selected continuous transform. It does not Gaussianize rewards.",
      url: "https://arxiv.org/pdf/2602.02710",
      source: "MaxRL paper",
    },
    {
      id: "tailrl",
      target: "Emphasize survival probabilities across reward thresholds.",
      edge: "Rare false high rewards can be amplified. More upper-tail probability does not guarantee that the middle or every best-of-k metric improves.",
      effect:
        "For a fixed increasing map, threshold weights acquire a g′(t) factor. Finite groups cap rarity amplification.",
      url: "https://arxiv.org/pdf/2609.02987",
      source: "TailRL · Proposition 9 & Appendix F",
    },
    {
      id: "pkpo",
      target:
        "Expected best-of-k reward using the leave-one-out-minus-one estimator.",
      edge: "Training k cannot exceed the group size here. Optimizing best-of-k can trade away one-sample quality.",
      effect:
        "The marginal value of an output depends on transformed reward gaps. For k = 1 this app uses RLOO.",
      url: "https://arxiv.org/html/2505.15201v5",
      source: "PKPO · equation 33",
    },
    {
      id: "elite",
      target:
        "Increase likelihood of the top 20% of each group, including cutoff ties.",
      edge: "A heuristic baseline. Ignores gap sizes and may collapse diversity; all-tied groups are skipped.",
      effect:
        "Strictly increasing maps preserve the selected set. Reciprocal reverses ordering. This is not an exact DSR implementation.",
      url: "https://proceedings.mlr.press/v28/goschin13.html",
      source: "Cross-entropy method context",
    },
  ],
  questions: [
    [
      "Is the “chasm” always bad?",
      "No. Moving middle-quality mass to excellent outputs can be useful. Moving it toward poor outputs can be harmful. Track true mean, poor mass, middle mass, and excellent mass together. The geometry of a reward histogram does not tell you whether useful intermediate reasoning strategies were lost.",
    ],
    [
      "Can a continuous transform split off the tail?",
      "A continuous increasing transform maps an interval to an interval, so it does not introduce a literal support gap into a fully supported continuous distribution. Its varying slope can still create a sparse-looking region or change density modes. A jump can create a literal gap on the transformed axis. Learning can independently change the underlying probabilities.",
    ],
    [
      "Does MaxRL use the forum’s normalizing transformations?",
      "No. The correctness-based MaxRL rule divides centered binary rewards by their group mean. Standardizing a group, transforming a reward function, and forcing a marginal distribution toward Gaussian shape are different operations. Normality is not required by these estimators.",
    ],
    [
      "What does the ordinary non-tail objective weight?",
      "For rewards in [0,1], E[R] = ∫ P(R > t) dt. Its threshold gradient weight is 1. After a fixed increasing reward transform g, that weight becomes g′(t). Population TailRL instead has g′(t)/P(R > t). The finite-group implementation limits amplification.",
    ],
    [
      "What happens if I continuously refit normal scores?",
      "The transformation then depends on the policy or sample. For a continuous variable, its exact current CDF maps it to a uniform variable, so the fully differentiated expected normal score is constant. Stop-gradient rank updates are a different operation. Finite batches and ties complicate it further; use a frozen reference as a separate controlled experiment.",
    ],
    [
      "Does this cover every distribution or an actual language model?",
      "No finite gallery can cover every distribution. These presets are discrete probabilities on 21 output positions, with scores in [0,1]. They cannot represent unbounded or infinite-variance tails. The neural policy is trainable but does not generate language, use semantic embeddings, execute code, or reproduce full LLM RL training.",
    ],
    [
      "Where are DQN, SAC, DDPG, DPO, and DAPO?",
      "DQN, SAC, and DDPG would need additional replay, value-learning, or action-space machinery to expose their defining behavior. DPO is a preference-optimization comparator rather than an on-policy RL update. DAPO and Dr. GRPO include sequence- or group-level distinctions this one-step surface cannot fully show. Their absence is deliberate; adding a familiar name to the same update would be misleading.",
    ],
    [
      "How should I compare algorithms fairly?",
      "Treat the shared learning rate as an experimental setting, not a ranking protocol. Tune rates per algorithm, use multiple seeds, keep evaluation rewards fixed, and compare more than one metric. Equal rollout counts do not imply equal compute cost. Unit-length gradients change the optimizer.",
    ],
    [
      "What would a serious model experiment add?",
      "Track per-prompt strategy clusters through checkpoints and seeds; keep raw judge scores and independent evaluation. Identify useful intermediate behaviors rather than inferring them from reward bins. Fit learned transforms only on an explicit training reference, then freeze them for an initial controlled comparison.",
    ],
  ],
};
if (typeof module !== "undefined") module.exports = LabContent;
