const assert = require("node:assert/strict");
const D = require("./discovery-math.js");
const near = (a, b) => assert(Math.abs(a - b) < 1e-10, `${a} ≠ ${b}`);
// Enumerate all pairs independently of the cumulative-power implementation.
for (const preset of Object.values(D.presets)) {
  for (const p of [preset.a, preset.b]) {
    near(
      p.reduce((a, b) => a + b, 0),
      1,
    );
    near(D.evaluate(p, 1).mean, 0.5);
    near(D.evaluate(p, 1).best, 0.5);
    let exact = 0,
      previous = 0.5;
    for (let i = 0; i < p.length; i++)
      for (let j = 0; j < p.length; j++)
        exact += p[i] * p[j] * Math.max(D.rewards[i], D.rewards[j]);
    near(D.evaluate(p, 2).best, exact);
    for (let k = 1; k <= 128; k++) {
      const m = D.evaluate(p, k);
      near(
        m.bestP.reduce((a, b) => a + b, 0),
        1,
      );
      assert(m.bestP.every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
      assert(m.best >= previous - 1e-12 && m.best <= 1);
      near(m.mean, 0.5);
      previous = m.best;
    }
  }
}
near(D.evaluate(D.presets.jackpot.b, 16).success, 1 - 0.9 ** 16);
near(D.evaluate(D.presets.jackpot.a, 64).best, 0.5);
near(D.evaluate(D.presets.spread.b, 1).bad, 0.5);
assert.throws(() => D.evaluate(D.presets.split.a, 0));
assert.throws(() => D.evaluate(D.presets.split.a, 1.5));
console.log(
  "PASS: matched means, independently enumerated best-of-two, normalized and monotone order statistics across 128 budgets, exact jackpot odds.",
);
