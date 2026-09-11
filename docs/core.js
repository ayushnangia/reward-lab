/* Reward Distribution Lab. Toy on-policy learning, not an LLM benchmark. */
const RewardLab = (() => {
  const methods = [
    "rloo",
    "grpo",
    "maxrl",
    "tailrl",
    "pkpo",
    "elite",
    "reinforce",
    "a2c",
    "ppo",
    "trpo",
  ];
  const names = {
    rloo: "RLOO",
    grpo: "GRPO",
    maxrl: "MaxRL · success ≥ 0.9",
    tailrl: "TailRL",
    pkpo: "PKPO · best-of-k",
    elite: "Elite · top 20%",
    reinforce: "REINFORCE",
    a2c: "A2C · one-step",
    ppo: "PPO · clipped",
    trpo: "TRPO · KL constrained",
  };
  const presets = {
    bell: "Bell shaped",
    uniform: "Uniform",
    right: "Mostly low, long right tail",
    left: "Mostly high, long left tail",
    bimodal: "Two separated modes",
    valley: "Middle almost empty",
    rare: "Rare excellent outcome",
    narrow: "Almost constant quality",
    zero: "Single outcome · reward 0",
    missing: "Excellent outputs absent",
    spike: "Moderate spike + thin excellent tail",
    custom: "Custom shape",
  };
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const center = (a) => {
    const m = mean(a);
    return a.map((x) => x - m);
  };
  const normalize = (a) => {
    const s = a.reduce((x, y) => x + y, 0);
    return a.map((x) => x / s);
  };
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function invNorm(p) {
    if (!(p > 0 && p < 1)) throw Error("Normal quantile requires 0 < p < 1");
    const a = [
      -39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269,
      -30.6647980661472, 2.50662827745924,
    ];
    const b = [
      -54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197,
      -13.2806815528857,
    ];
    const c = [
      -0.00778489400243029, -0.322396458041136, -2.40075827716184,
      -2.54973253934373, 4.37466414146497, 2.93816398269878,
    ];
    const d = [
      0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742,
    ];
    if (p < 0.02425 || p > 1 - 0.02425) {
      const q = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
      const v =
        (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
      return p < 0.5 ? v : -v;
    }
    const q = p - 0.5,
      r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  function rankNormal(a) {
    return a.map((x) => {
      const below = a.filter((y) => y < x).length,
        equal = a.filter((y) => y === x).length;
      return invNorm((below + equal / 2) / a.length);
    });
  }
  function initial(preset, custom = "", weights = null) {
    const g = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2);
    const xs = Array.from({ length: 21 }, (_, i) => i / 20);
    if (preset === "custom") {
      if (weights !== null) {
        if (
          !Array.isArray(weights) ||
          weights.length !== 21 ||
          Array.from(weights).some(
            (w) =>
              typeof w !== "number" || !Number.isFinite(w) || w < 0 || w > 1,
          ) ||
          !weights.some((w) => w > 0)
        )
          throw Error(
            "Use 21 weights between 0 and 1, with at least one above zero.",
          );
        return normalize(weights);
      }
      const values = custom
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map(Number);
      if (
        !values.length ||
        values.some((x) => !Number.isFinite(x) || x < 0 || x > 1)
      )
        throw Error(
          "Enter reward samples between 0 and 1, separated by commas.",
        );
      const p = xs.map(() => 0);
      values.forEach((x) => p[Math.round(x * 20)]++);
      return normalize(p);
    }
    return normalize(
      xs.map((x) => {
        switch (preset) {
          case "bell":
            return g(x, 0.5, 0.15);
          case "uniform":
            return 1;
          case "right":
            return Math.exp(-7 * x);
          case "left":
            return Math.exp(-7 * (1 - x));
          case "bimodal":
            return g(x, 0.2, 0.06) + 0.7 * g(x, 0.85, 0.055);
          case "valley":
            return x === 0.2 ? 0.65 : x === 0.6 ? 0.05 : x === 1 ? 0.3 : 0;
          case "rare":
            return x === 0.2 ? 0.999 : x === 1 ? 0.001 : 0;
          case "narrow":
            return x === 0.45 ? 0.2 : x === 0.5 ? 0.6 : x === 0.55 ? 0.2 : 0;
          case "zero":
            return x === 0 ? 1 : 0;
          case "missing":
            return x <= 0.7 ? g(x, 0.4, 0.13) : 0;
          case "spike":
            return 0.95 * g(x, 0.5, 0.025) + 0.01 * g(x, 0.95, 0.025);
          default:
            return 1;
        }
      }),
    );
  }
  function trueRewards(layout) {
    return Array.from({ length: 21 }, (_, i) =>
      layout === "binary"
        ? i >= 18
          ? 1
          : 0
        : layout === "code"
          ? i < 8
            ? 0
            : i < 16
              ? 0.35
              : 0.55 + (0.45 * (i - 16)) / 4
          : i / 20,
    );
  }
  function frozenMap(rewards, p) {
    return (x) => {
      let below = 0,
        equal = 0;
      rewards.forEach((r, i) => {
        if (r < x) below += p[i];
        if (r === x) equal += p[i];
      });
      return invNorm(Math.max(0.001, Math.min(0.999, below + equal / 2)));
    };
  }
  function transform(a, type, lambda = 0.5, frozen = (x) => x, shape = {}) {
    const power = (x, l) =>
      Math.abs(l) < 1e-10 ? Math.log(x) : Math.expm1(l * Math.log(x)) / l;
    switch (type) {
      case "hinge": {
        const {
          tailAt = 0.7,
          bulkScale = 0.4,
          tailScale = 2,
          jump = 0,
        } = shape;
        const end = bulkScale * tailAt + tailScale * (1 - tailAt) + jump;
        return a.map(
          (x) =>
            (bulkScale * Math.min(x, tailAt) +
              tailScale * Math.max(0, x - tailAt) +
              (x > tailAt ? jump : 0)) /
            end,
        );
      }
      case "affine":
        return a.map((x) => 2 * x + 1);
      case "log":
        return a.map((x) => Math.log1p(9 * x) / Math.log(10));
      case "square":
        return a.map((x) => x * x);
      case "sqrt":
        return a.map(Math.sqrt);
      case "boxcox": {
        const lo = power(0.01, lambda),
          hi = power(1.01, lambda);
        return a.map((x) => (power(x + 0.01, lambda) - lo) / (hi - lo));
      }
      case "yeojohnson": {
        const hi = power(2, lambda);
        return a.map((x) => power(1 + x, lambda) / hi);
      }
      case "reciprocal":
        return a.map((x) => 1 / (1 + 9 * x));
      case "zscore": {
        const c = center(a),
          s = Math.sqrt(mean(c.map((x) => x * x)));
        return c.map((x) => (s > 1e-12 ? x / s : 0));
      }
      case "ranknormal":
        return rankNormal(a);
      case "frozen":
        return a.map(frozen);
      default:
        return a.slice();
    }
  }
  function combination(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let v = 1;
    for (let i = 1; i <= k; i++) v = (v * (n - k + i)) / i;
    return v;
  }
  function advantage(a, method, k = 4, baseline = 0) {
    const n = a.length,
      c = center(a);
    if (n < 2) throw Error("A rollout group needs at least two samples.");
    if (method === "reinforce") return a.slice();
    if (method === "a2c" || method === "ppo") return a.map((x) => x - baseline);
    if (method === "trpo") return advantage(a, "rloo");
    if (method === "rloo") return c.map((x) => (x * n) / (n - 1));
    if (method === "grpo") {
      if (a.every((x) => x === a[0])) return a.map(() => 0);
      const s = Math.sqrt(mean(c.map((x) => x * x)));
      return c.map((x) => x / (s + 1e-8));
    }
    if (method === "maxrl") {
      const m = mean(a);
      return m > 1e-12 ? c.map((x) => x / m) : a.map(() => 0);
    }
    if (method === "tailrl") {
      const order = a.map((r, i) => ({ r, i })).sort((u, v) => u.r - v.r),
        w = a.map(() => 0);
      let previous = order[0].r,
        acc = 0;
      order.forEach((o, j) => {
        acc += (o.r - previous) / (n - j);
        w[o.i] = acc;
        previous = o.r;
      });
      return center(w).map((x) => n * x);
    }
    if (method === "pkpo") {
      k = Math.max(1, Math.min(n, k));
      if (k === 1) return advantage(a, "rloo");
      const denominator = combination(n - 1, k - 1),
        weights = Array.from(
          { length: n - 1 },
          (_, j) => combination(j, k - 2) / denominator,
        );
      return a.map(
        (r, i) =>
          k *
          a
            .filter((_, j) => j !== i)
            .sort((u, v) => u - v)
            .reduce((s, v, j) => s + weights[j] * Math.max(0, r - v), 0),
      );
    }
    if (method === "elite") {
      if (a.every((x) => x === a[0])) return a.map(() => 0);
      const cutoff = a.slice().sort((u, v) => v - u)[
          Math.max(0, Math.ceil(0.2 * n) - 1)
        ],
        count = a.filter((x) => x >= cutoff).length;
      return a.map((x) => (x >= cutoff ? n / count : 0));
    }
    throw Error("Unknown method");
  }
  function softmax(a) {
    const m = Math.max(...a);
    return normalize(a.map((x) => Math.exp(x - m)));
  }
  function features(i) {
    const x = i / 10 - 1;
    return [x, x * x, Math.sin(Math.PI * x), Math.cos(Math.PI * x)];
  }
  function makeModel(base, type, seed) {
    const rand = rng(seed);
    return {
      type,
      base: base.map((p) => (p > 0 ? Math.log(p) : -Infinity)),
      theta: Array(21).fill(0),
      w: Array.from({ length: 8 }, () => rand() * 2 - 1),
      b: Array.from({ length: 8 }, () => rand() - 0.5),
      v: Array.from({ length: 8 }, () => 0.2 * (rand() - 0.5)),
    };
  }
  function forward(model) {
    const logits = model.base.map((b, i) => {
      if (model.type === "shared") {
        const f = features(i);
        return b + f.reduce((s, x, j) => s + x * model.theta[j], 0);
      }
      if (model.type === "neural") {
        const x = i / 10 - 1;
        return (
          b +
          model.w.reduce(
            (s, w, j) => s + model.v[j] * Math.tanh(w * x + model.b[j]),
            0,
          )
        );
      }
      return b + model.theta[i];
    });
    return softmax(logits);
  }
  function update(model, grad, lr, unit = false) {
    let vector, apply;
    if (model.type === "shared") {
      vector = Array.from({ length: 4 }, (_, j) =>
        grad.reduce((s, g, i) => s + g * features(i)[j], 0),
      );
      apply = (v) => v.forEach((g, j) => (model.theta[j] += lr * g));
    } else if (model.type === "neural") {
      const dw = Array(8).fill(0),
        db = Array(8).fill(0),
        dv = Array(8).fill(0);
      grad.forEach((g, i) => {
        const x = i / 10 - 1;
        model.w.forEach((w, j) => {
          const h = Math.tanh(w * x + model.b[j]),
            q = g * model.v[j] * (1 - h * h);
          dv[j] += g * h;
          dw[j] += q * x;
          db[j] += q;
        });
      });
      vector = [...dw, ...db, ...dv];
      apply = (v) => {
        for (let j = 0; j < 8; j++) {
          model.w[j] += lr * v[j];
          model.b[j] += lr * v[8 + j];
          model.v[j] += lr * v[16 + j];
        }
      };
    } else {
      vector = grad;
      apply = (v) => v.forEach((g, j) => (model.theta[j] += lr * g));
    }
    const norm = Math.sqrt(vector.reduce((s, x) => s + x * x, 0));
    if (unit && norm > 1e-12) vector = vector.map((x) => x / norm);
    apply(vector);
    return norm;
  }
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  function parameters(model) {
    return model.type === "neural"
      ? [...model.w, ...model.b, ...model.v]
      : model.theta.slice(0, model.type === "shared" ? 4 : 21);
  }
  function setParameters(model, values) {
    if (model.type === "neural") {
      model.w = values.slice(0, 8);
      model.b = values.slice(8, 16);
      model.v = values.slice(16, 24);
    } else values.forEach((v, i) => (model.theta[i] = v));
  }
  function jacobian(model) {
    return model.base.map((_, i) => {
      if (model.type === "independent")
        return Array.from({ length: 21 }, (_, j) => (i === j ? 1 : 0));
      if (model.type === "shared") return features(i);
      const x = i / 10 - 1,
        h = model.w.map((w, j) => Math.tanh(w * x + model.b[j])),
        q = h.map((v, j) => model.v[j] * (1 - v * v));
      return [...q.map((v) => v * x), ...q, ...h];
    });
  }
  function kl(old, p) {
    return old.reduce(
      (s, v, i) =>
        s + (v > 0 ? v * (Math.log(v) - Math.log(Math.max(1e-300, p[i]))) : 0),
      0,
    );
  }
  function surrogate(p, old, ids, adv) {
    return mean(
      ids.map((id, j) => (p[id] / Math.max(1e-300, old[id])) * adv[j]),
    );
  }
  function ppoGradient(p, old, ids, adv, clip) {
    const weights = ids.map((id, j) => {
      const ratio = p[id] / Math.max(1e-300, old[id]);
      return (adv[j] >= 0 && ratio > 1 + clip) ||
        (adv[j] < 0 && ratio < 1 - clip)
        ? 0
        : ratio * adv[j];
    });
    const grad = p.map((v) => -v * mean(weights));
    ids.forEach((id, j) => (grad[id] += weights[j] / ids.length));
    return {
      grad,
      clipped:
        weights.filter((v, j) => v === 0 && adv[j] !== 0).length / ids.length,
    };
  }
  function ppoUpdate(model, old, ids, adv, cfg) {
    let norm = 0,
      clipped = 0;
    for (let epoch = 0; epoch < cfg.ppoEpochs; epoch++) {
      const result = ppoGradient(forward(model), old, ids, adv, cfg.ppoClip);
      norm = update(model, result.grad, cfg.lr, cfg.unit);
      clipped = Math.max(clipped, result.clipped);
    }
    return {
      norm,
      kl: kl(old, forward(model)),
      clipped,
      epochs: cfg.ppoEpochs,
    };
  }
  function conjugateGradient(multiply, b, iterations = 12) {
    let x = b.map(() => 0),
      r = b.slice(),
      direction = r.slice(),
      rr = dot(r, r);
    for (let i = 0; i < iterations && rr > 1e-18; i++) {
      const Ad = multiply(direction),
        den = dot(direction, Ad);
      if (!(den > 1e-20)) break;
      const alpha = rr / den;
      x = x.map((v, j) => v + alpha * direction[j]);
      r = r.map((v, j) => v - alpha * Ad[j]);
      const next = dot(r, r);
      direction = r.map((v, j) => v + (next / rr) * direction[j]);
      rr = next;
    }
    return x;
  }
  function trpoUpdate(model, old, ids, adv, cfg) {
    const J = jacobian(model),
      dimension = J[0].length,
      expected = Array.from({ length: dimension }, (_, j) =>
        old.reduce((s, p, i) => s + p * J[i][j], 0),
      );
    const scores = J.map((row) => row.map((v, j) => v - expected[j]));
    const gradient = Array.from({ length: dimension }, (_, j) =>
        mean(ids.map((id, i) => adv[i] * scores[id][j])),
      ),
      norm = Math.sqrt(dot(gradient, gradient));
    if (norm < 1e-12) return { norm, kl: 0, accepted: false, backtracks: 0 };
    // Exact categorical Fisher over the 21 actions, plus numerical damping.
    const multiply = (vector) => {
      const projections = scores.map((row) => dot(row, vector));
      return vector.map(
        (v, j) =>
          0.01 * v +
          old.reduce((s, p, i) => s + p * scores[i][j] * projections[i], 0),
      );
    };
    const direction = conjugateGradient(multiply, gradient),
      quadratic = dot(direction, multiply(direction));
    if (!(quadratic > 1e-20))
      return { norm, kl: 0, accepted: false, backtracks: 0 };
    const length = Math.sqrt((2 * cfg.trustKL) / quadratic),
      initial = parameters(model),
      before = mean(adv);
    for (let backtracks = 0; backtracks < 12; backtracks++) {
      const fraction = Math.pow(0.5, backtracks);
      setParameters(
        model,
        initial.map((v, j) => v + fraction * length * direction[j]),
      );
      const p = forward(model),
        distance = kl(old, p),
        gain = surrogate(p, old, ids, adv) - before;
      if (Number.isFinite(gain) && distance <= cfg.trustKL && gain > 1e-12)
        return { norm, kl: distance, accepted: true, backtracks };
    }
    setParameters(model, initial);
    return { norm, kl: 0, accepted: false, backtracks: 12 };
  }
  function metrics(p, rewards, k = 16) {
    const pairs = p
      .map((p, i) => ({ p, r: rewards[i] }))
      .sort((a, b) => a.r - b.r);
    let cum = 0,
      best = 0;
    for (const a of pairs) {
      const old = cum;
      cum += a.p;
      best += a.r * (Math.pow(Math.min(1, cum), k) - Math.pow(old, k));
    }
    return {
      mean: p.reduce((s, x, i) => s + x * rewards[i], 0),
      high: p.reduce((s, x, i) => s + (rewards[i] >= 0.9 ? x : 0), 0),
      bad: p.reduce((s, x, i) => s + (rewards[i] < 0.3 ? x : 0), 0),
      middle: p.reduce(
        (s, x, i) => s + (rewards[i] >= 0.3 && rewards[i] < 0.9 ? x : 0),
        0,
      ),
      best,
      entropy: -p.reduce((s, x) => s + (x > 0 ? x * Math.log(x) : 0), 0),
    };
  }
  function create(config = {}) {
    const cfg = {
      preset: "spike",
      layout: "quality",
      transform: "identity",
      model: "independent",
      n: 32,
      k: 4,
      evalK: 16,
      lr: 0.15,
      seed: 42,
      judge: "clean",
      lambda: 0.5,
      unit: false,
      floor: 0,
      tailAt: 0.7,
      bulkScale: 0.4,
      tailScale: 2,
      jump: 0,
      ppoClip: 0.2,
      ppoEpochs: 4,
      trustKL: 0.01,
      criticRate: 0.1,
      custom: "0.2,0.2,0.2,0.6,1",
      customWeights: null,
      ...config,
    };
    const base = normalize(
        initial(cfg.preset, cfg.custom, cfg.customWeights).map(
          (p) => p + cfg.floor,
        ),
      ),
      rewards = trueRewards(cfg.layout),
      frozen = frozenMap(rewards, base),
      random = rng(cfg.seed);
    const modelSeed = cfg.seed + 17,
      models = Object.fromEntries(
        methods.map((m) => [m, makeModel(base, cfg.model, modelSeed)]),
      );
    if (cfg.model === "neural") {
      // Start all models at exactly the selected base distribution.
      for (const model of Object.values(models)) {
        const raw = forward(model);
        model.base = model.base.map((b, i) =>
          b === -Infinity ? b : b + Math.log(base[i] / raw[i]),
        );
      }
    }
    const states = {
      cfg,
      rewards,
      base,
      frozen,
      random,
      models,
      step: 0,
      history: [],
      last: {},
    };
    record(states);
    return states;
  }
  function record(s) {
    s.history.push({
      step: s.step,
      methods: Object.fromEntries(
        methods.map((m) => {
          const p = forward(s.models[m]);
          return [m, { p, metrics: metrics(p, s.rewards, s.cfg.evalK) }];
        }),
      ),
    });
  }
  function step(s) {
    const { cfg } = s,
      n = cfg.n;
    const uniforms = Array.from({ length: n }, () => s.random()),
      noise = Array.from({ length: n }, () => [s.random(), s.random()]);
    for (const method of methods) {
      const model = s.models[method],
        p = forward(model),
        ids = uniforms.map((u) => {
          let sum = 0;
          for (let j = 0; j < p.length; j++) {
            sum += p[j];
            if (u < sum) return j;
          }
          return p.length - 1;
        });
      const raw = ids.map((i) => s.rewards[i]);
      const judged = raw.map((r, j) =>
        cfg.judge === "noise"
          ? Math.max(
              0,
              Math.min(
                1,
                r +
                  0.12 *
                    Math.sqrt(-2 * Math.log(Math.max(1e-12, noise[j][0]))) *
                    Math.cos(2 * Math.PI * noise[j][1]),
              ),
            )
          : cfg.judge === "falsepositive" && r < 0.3 && noise[j][0] < 0.02
            ? 1
            : r,
      );
      const transformed =
        method === "maxrl"
          ? judged.map((r) => (r >= 0.9 ? 1 : 0))
          : transform(judged, cfg.transform, cfg.lambda, s.frozen, cfg);
      const baseline = model.critic || 0,
        adv = advantage(transformed, method, cfg.k, baseline),
        grad = p.map((x) => -x * mean(adv));
      ids.forEach((id, i) => (grad[id] += adv[i] / n));
      const diagnostics =
        method === "ppo" || method === "grpo"
          ? ppoUpdate(model, p, ids, adv, cfg)
          : method === "trpo"
            ? trpoUpdate(model, p, ids, adv, cfg)
            : { norm: update(model, grad, cfg.lr, cfg.unit) };
      if (method === "a2c" || method === "ppo")
        model.critic =
          baseline + cfg.criticRate * (mean(transformed) - baseline);
      s.last[method] = {
        ids,
        raw,
        judged,
        transformed,
        adv,
        ...diagnostics,
        ...(method === "a2c" || method === "ppo"
          ? { baseline, critic: model.critic }
          : {}),
      };
    }
    s.step++;
    record(s);
    return s;
  }
  return {
    methods,
    names,
    presets,
    mean,
    center,
    normalize,
    rng,
    invNorm,
    rankNormal,
    initial,
    trueRewards,
    transform,
    advantage,
    combination,
    metrics,
    create,
    step,
    forward,
    update,
    features,
    parameters,
    setParameters,
    jacobian,
    kl,
    surrogate,
    ppoGradient,
    ppoUpdate,
    trpoUpdate,
    conjugateGradient,
  };
})();
if (typeof module !== "undefined") module.exports = RewardLab;
