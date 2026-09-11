const assert = require("node:assert/strict");
const T = require("./transfer-math.js");
const M = require("./output-math.js");
const E = require("./transfer-data.js");
const close = (a, b, tol = 1e-8) =>
  assert(Math.abs(a - b) < tol, `${a} != ${b}`);
// Check the transfer formula against an actual conditional binary softmax response.
for (const angle of [-180, -90, 0, 35, 90, 180]) {
  const weights = [-0.9, -0.2, 0.1, 1];
  const g = T.geometry(weights, angle, 1e-5);
  const u = g.target;
  // At theta=0, features +/-u give gradient u for the positive answer.
  const logp = (theta) => {
    const z = theta.reduce((s, x, i) => s + x * u[i], 0);
    return z - Math.log(Math.exp(z) + Math.exp(-z));
  };
  const delta = logp(g.update.map((x) => x * 1e-5)) - logp([0, 0]);
  close(delta, g.change, 1e-9);
  const weightedMean = [0, 1].map(
    (j) => weights.reduce((s, w, i) => s + w * g.gradients[i][j], 0) / 4,
  );
  weightedMean.forEach((x, j) => close(x, g.update[j]));
}
close(T.geometry([0, 0, 0, 0]).change, 0);
assert.equal(T.bootstrap([0, 1, 0, 1]), null);
assert.deepEqual(T.bootstrap([0.2, 0.2, 0.2, 0.2, 0.2]), [0.2, 0.2]);
assert.deepEqual(
  T.bootstrap([-0.3, 0.2, 0.7, 0, 0.5]),
  T.bootstrap([-0.3, 0.2, 0.7, 0, 0.5]),
);
const rows = [];
for (let i = 0; i < 6; i++)
  for (const checkpoint of ["base", "rl"]) {
    const count = i === 0 ? 17 : 1;
    for (let j = 0; j < count; j++)
      rows.push({
        checkpoint,
        prompt_id: `p${i}`,
        prompt: `Question ${i}`,
        output: `Answer ${j}`,
        score: 0.5,
        correct: checkpoint === "base" ? i < 3 : i > 0,
        domain: "math",
        split: "test",
      });
  }
const data = M.validate({ training_domains: ["science"], rows });
const d = T.domains(data)[0];
close(d.before, 0.5);
close(d.after, 5 / 6);
close(d.delta, 1 / 3);
assert.equal(d.improved, 3);
assert.equal(d.regressed, 1);
assert.equal(d.n, 6);
assert(d.interval[0] <= d.delta && d.interval[1] >= d.delta);
assert.deepEqual(data.trainingDomains, ["science"]);
const bad = structuredClone(rows);
bad[0].split = "train";
assert.throws(() => M.validate(bad), /split differs/);
const badDomain = structuredClone(rows);
badDomain[0].domain = null;
assert.throws(() => M.validate(badDomain), /domain differs/);
assert.throws(
  () => M.validate({ ...data, rows, training_domains: "science" }),
  /training_domains/,
);
assert.throws(
  () => M.validate(rows.map((r) => ({ ...r, split: "heldout" }))),
  /split must/,
);
assert.throws(
  () => M.validate(rows.map((r) => ({ ...r, domain: 42 }))),
  /domain must/,
);
const absent = M.validate(rows.map(({ domain, split, ...r }) => r));
assert.equal(T.domains(absent)[0].split, "unknown");
// Factual transcription spot checks, including runs with different baselines.
assert.deepEqual(E.results[1][0], [41.8, 62.6]);
assert.deepEqual(E.results[2][2], [21.14, 97.7]);
assert.equal(E.results.length, 4);
assert(
  E.results.every(
    (r) =>
      r.length === 4 &&
      r.every((p) => p.length === 2 && p.every((v) => v >= 0 && v <= 100)),
  ),
);
console.log(
  "PASS: first-order response against finite differences, paired prompt weighting, deterministic intervals, metadata validation, and source-table transcription.",
);

const namedUnknown = M.validate({
  training_domains: ["Unlabeled"],
  rows: rows.map((r) => ({ ...r, domain: "Unlabeled" })),
});
assert.equal(T.domains(namedUnknown)[0].domain, "Unlabeled");
assert.equal(T.domains(absent)[0].domain, null);
