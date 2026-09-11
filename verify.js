const assert = require("node:assert/strict");
const C = require("./core.js");
const near = (a, b, tol = 1e-7) =>
  assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const vector = (a, b, tol = 1e-7) => a.forEach((x, i) => near(x, b[i], tol));
const sample = [0.1, 0.3, 0.5, 0.8, 1],
  binary = [0, 0, 0, 0, 0, 0, 0, 1];
vector(C.advantage(binary, "tailrl"), C.advantage(binary, "maxrl"));
vector(C.advantage([0.2, 0.9], "tailrl"), C.advantage([0.2, 0.9], "rloo"));
vector(
  C.advantage(
    sample.map((x) => 2 * x + 3),
    "grpo",
  ),
  C.advantage(sample, "grpo"),
);
vector(
  C.advantage(
    sample.map((x) => 2 * x + 3),
    "rloo",
  ),
  C.advantage(sample, "rloo").map((x) => 2 * x),
);
vector(
  C.advantage(
    sample.map((x) => 2 * x + 3),
    "tailrl",
  ),
  C.advantage(sample, "tailrl").map((x) => 2 * x),
);
vector(C.rankNormal([0.5, 0.5, 0.5]), [0, 0, 0]);
near(C.invNorm(0.975), 1.959963984540054, 1e-7);
for (const m of C.methods) vector(C.advantage([0, 0, 0, 0], m), [0, 0, 0, 0]);
// Elite is rank-only even for tiny nonzero gaps; ties at the cutoff stay selected.
vector(C.advantage([0, 1e-14, 2e-14], "elite"), [0, 0, 3]);
vector(C.advantage([0, 1e-14, 1e-14], "elite"), [0, 1.5, 1.5]);
vector(C.advantage([0.7, 0.7, 0.7], "elite"), [0, 0, 0]);

// Exhaustive finite-batch expected gradients versus derivatives of the claimed objectives.
const rewards = [0, 0.4, 1],
  p = [0.7, 0.2, 0.1],
  n = 4;
function softmax(a) {
  const exp = a.map(Math.exp),
    s = exp.reduce((x, y) => x + y, 0);
  return exp.map((x) => x / s);
}
function best(p, k) {
  let c = 0,
    v = 0;
  rewards.forEach((r, i) => {
    const old = c;
    c += p[i];
    v += r * (c ** k - old ** k);
  });
  return v;
}
function objective(p, m) {
  if (["rloo", "reinforce", "a2c"].includes(m)) return best(p, 1);
  if (m === "maxrl")
    return Array.from(
      { length: n - 1 },
      (_, i) => -((1 - p[2]) ** (i + 1)) / (i + 1),
    ).reduce((x, y) => x + y, 0);
  if (m === "tailrl")
    return Array.from(
      { length: n - 1 },
      (_, i) => (best(p, i + 1) - 1) / (i + 1),
    ).reduce((x, y) => x + y, 0);
  if (m === "pkpo") return best(p, 3);
}
for (const method of ["reinforce", "a2c", "rloo", "tailrl", "maxrl", "pkpo"]) {
  const expected = [0, 0, 0];
  for (let code = 0; code < 3 ** n; code++) {
    let v = code,
      prob = 1;
    const ids = [];
    for (let i = 0; i < n; i++) {
      const id = v % 3;
      v = Math.floor(v / 3);
      ids.push(id);
      prob *= p[id];
    }
    const a = C.advantage(
      ids.map((i) =>
        method === "maxrl" ? Number(rewards[i] >= 0.9) : rewards[i],
      ),
      method,
      3,
      0.4,
    );
    for (let j = 0; j < 3; j++)
      expected[j] +=
        (prob *
          a.reduce((s, x, i) => s + x * ((ids[i] === j ? 1 : 0) - p[j]), 0)) /
        n;
  }
  const logits = p.map(Math.log),
    h = 1e-5;
  const numeric = logits.map((_, j) => {
    const plus = logits.slice(),
      minus = logits.slice();
    plus[j] += h;
    minus[j] -= h;
    return (
      (objective(softmax(plus), method) - objective(softmax(minus), method)) /
      (2 * h)
    );
  });
  vector(expected, numeric, 1e-7);
}

// Shared-parameter and neural backprop checks.
for (const type of ["shared", "neural"]) {
  const state = C.create({ model: type, preset: "bell" }),
    model = state.models.rloo,
    p = C.forward(model),
    mu = p.reduce((s, x, i) => s + x * state.rewards[i], 0),
    g = p.map((x, i) => x * (state.rewards[i] - mu));
  const keys = type === "shared" ? ["theta"] : ["w", "b", "v"],
    clone = JSON.parse(JSON.stringify(model)),
    h = 1e-5;
  const expected = {};
  for (const key of keys) {
    expected[key] = model[key].map((_, j) => {
      const old = model[key][j];
      model[key][j] = old + h;
      const a = C.forward(model).reduce(
        (s, x, i) => s + x * state.rewards[i],
        0,
      );
      model[key][j] = old - h;
      const b = C.forward(model).reduce(
        (s, x, i) => s + x * state.rewards[i],
        0,
      );
      model[key][j] = old;
      return (a - b) / (2 * h);
    });
  }
  C.update(model, g, 1e-3);
  for (const key of keys) {
    const length = type === "shared" ? 4 : model[key].length;
    for (let j = 0; j < length; j++)
      near((model[key][j] - clone[key][j]) / 1e-3, expected[key][j], 1e-7);
  }
}

let cases = 0;
for (const preset of Object.keys(C.presets).filter((x) => x !== "custom"))
  for (const model of ["independent", "shared", "neural"])
    for (const transform of [
      "identity",
      "ranknormal",
      "reciprocal",
      "frozen",
    ]) {
      const s = C.create({
        preset,
        model,
        transform,
        n: 8,
        k: 4,
        judge:
          cases % 3 === 0
            ? "noise"
            : cases % 3 === 1
              ? "falsepositive"
              : "clean",
        layout: ["quality", "binary", "code"][cases % 3],
      });
      for (const m of C.methods) vector(C.forward(s.models[m]), s.base, 1e-9);
      for (let i = 0; i < 12; i++) C.step(s);
      for (const m of C.methods) {
        const p = C.forward(s.models[m]);
        near(
          p.reduce((a, b) => a + b, 0),
          1,
          1e-9,
        );
        assert.ok(p.every((x) => Number.isFinite(x) && x >= 0));
        s.base.forEach((x, i) => {
          if (x === 0) near(p[i], 0, 1e-15);
        });
      }
      cases++;
    }
console.log(
  `PASS: exact finite-batch gradients, neural/shared derivatives, invariances, ties, and ${cases} simulation combinations.`,
);
