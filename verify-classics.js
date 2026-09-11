"use strict";
const assert = require("node:assert/strict"),
  R = require("./core.js");
const near = (a, b, t = 1e-7) => assert(Math.abs(a - b) < t, `${a} != ${b}`);
// PPO's clipped objective gradient: both signs and both clipping plateaus.
const softmax = (a) => {
  const mx = Math.max(...a),
    e = a.map((v) => Math.exp(v - mx)),
    sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
};
for (const logits of [
  [0, 0, 0],
  [1, -1, 0],
  [-1, 1, 0],
]) {
  const old = [0.3, 0.4, 0.3],
    ids = [0, 1, 1, 2],
    adv = [2, -1, 0.4, -2],
    p = softmax(logits),
    clip = 0.2;
  const objective = (z) => {
    const q = softmax(z);
    return (
      ids.reduce((s, id, j) => {
        const ratio = q[id] / old[id];
        return (
          s +
          Math.min(
            ratio * adv[j],
            Math.max(1 - clip, Math.min(1 + clip, ratio)) * adv[j],
          )
        );
      }, 0) / ids.length
    );
  };
  const analytical = R.ppoGradient(p, old, ids, adv, clip).grad;
  for (let j = 0; j < 3; j++) {
    const plus = logits.slice(),
      minus = logits.slice(),
      h = 1e-5;
    plus[j] += h;
    minus[j] -= h;
    near(analytical[j], (objective(plus) - objective(minus)) / (2 * h));
  }
}
const plateau = R.ppoGradient([0.8, 0.2], [0.5, 0.5], [0, 1], [1, -1], 0.2);
assert.equal(plateau.clipped, 1);
plateau.grad.forEach((g) => near(g, 0));
// Ratios outside the clip interval are not flat when they move against the advantage.
const harmful = R.ppoGradient([0.8, 0.2], [0.5, 0.5], [0, 1], [-1, 1], 0.2);
assert.equal(harmful.clipped, 0);
assert(harmful.grad.some((g) => Math.abs(g) > 0.1));
// Score Jacobians for all three parameterizations, checked against log-policy derivatives.
for (const type of ["independent", "shared", "neural"]) {
  const s = R.create({ model: type, preset: "bell" }),
    model = s.models.trpo,
    p = R.forward(model),
    J = R.jacobian(model),
    params = R.parameters(model),
    h = 1e-5;
  for (let j = 0; j < params.length; j++) {
    const expected = J.reduce((sum, row, i) => sum + p[i] * row[j], 0),
      plus = params.slice(),
      minus = params.slice();
    plus[j] += h;
    minus[j] -= h;
    R.setParameters(model, plus);
    const lp = R.forward(model).map(Math.log);
    R.setParameters(model, minus);
    const lm = R.forward(model).map(Math.log);
    for (let i = 0; i < p.length; i++)
      near(J[i][j] - expected, (lp[i] - lm[i]) / (2 * h));
  }
  R.setParameters(model, params);
}
// TRPO actually enforces its nonlinear KL constraint and improves its sampled surrogate.
let accepted = 0;
for (const model of ["independent", "shared", "neural"])
  for (const preset of ["bell", "rare", "bimodal", "missing"]) {
    const s = R.create({
      model,
      preset,
      transform: "hinge",
      jump: 0.3,
      n: 16,
      trustKL: 0.007,
    });
    for (let i = 0; i < 40; i++) {
      const old = R.forward(s.models.trpo),
        oldCritic = s.models.a2c.critic || 0;
      R.step(s);
      const b = s.last.trpo,
        after = R.forward(s.models.trpo);
      assert(R.kl(old, after) <= s.cfg.trustKL + 1e-10);
      near(b.kl, R.kl(old, after), 1e-10);
      if (b.accepted) {
        accepted++;
        assert(R.surrogate(after, old, b.ids, b.adv) > R.mean(b.adv));
      }
      const a = s.last.a2c;
      near(a.baseline, oldCritic);
      near(
        a.critic,
        oldCritic + s.cfg.criticRate * (R.mean(a.transformed) - oldCritic),
      );
      a.adv.forEach((v, j) => near(v, a.transformed[j] - oldCritic));
    }
  }
assert(accepted > 100);
// Multiple PPO epochs have a real effect; one epoch matches the A2C actor update.
const one = R.create({ ppoEpochs: 1, preset: "bell" }),
  many = R.create({ ppoEpochs: 6, preset: "bell" });
R.step(one);
R.step(many);
R.forward(one.models.ppo).forEach((v, i) =>
  near(v, R.forward(one.models.a2c)[i]),
);
assert(
  R.forward(one.models.ppo).some(
    (v, i) => Math.abs(v - R.forward(many.models.ppo)[i]) > 1e-6,
  ),
);
// REINFORCE is unbiased under a fixed reward offset, though individual samples differ.
const p = [0.6, 0.3, 0.1],
  r = [0, 0.4, 1],
  mu = p.reduce((s, v, i) => s + v * r[i], 0);
for (let j = 0; j < 3; j++) {
  const expected = (offset) =>
    p.reduce(
      (s, prob, i) => s + prob * (r[i] + offset) * ((i === j ? 1 : 0) - p[j]),
      0,
    );
  near(expected(0), p[j] * (r[j] - mu));
  near(expected(7), expected(0));
}
console.log(
  `PASS: PPO clipping derivatives and epochs; all policy Jacobians; ${accepted} accepted KL-bounded TRPO steps; actor–critic ordering; REINFORCE offset invariance.`,
);
// GRPO must use its clipped multi-epoch surrogate, not only standardized SGD.
const tight = R.create({ preset: "bell", lr: 2, ppoClip: 0.05, ppoEpochs: 10 }),
  wide = R.create({ preset: "bell", lr: 2, ppoClip: 0.5, ppoEpochs: 10 });
R.step(tight);
R.step(wide);
assert(tight.last.grpo.clipped > 0, "GRPO should reach a clipping plateau");
assert(
  R.forward(tight.models.grpo).some(
    (v, i) => Math.abs(v - R.forward(wide.models.grpo)[i]) > 1e-5,
  ),
  "GRPO clip width must change the actual update",
);
assert.equal(tight.models.grpo.critic, undefined);
const constant = R.create({ preset: "zero", ppoEpochs: 10, lr: 2 });
for (let i = 0; i < 5; i++) R.step(constant);
assert.deepEqual(R.forward(constant.models.grpo), constant.base);
assert(constant.last.grpo.adv.every((v) => v === 0));
assert(R.advantage(Array(32).fill(0.7), "grpo").every((v) => v === 0));
console.log(
  "PASS: GRPO clipping changes policy updates; constant groups stay fixed without a critic.",
);
