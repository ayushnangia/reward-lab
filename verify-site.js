"use strict";
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const root = __dirname,
  ctx = vm.createContext({ console });
for (const file of ["core.js", "config.js"])
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx);
const R = vm.runInContext("RewardLab", ctx),
  V = vm.runInContext("LabConfig", ctx),
  close = (a, b, tol = 1e-9) =>
    assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const A = require("./audio.js");
const bell = A.notes(R.initial("bell")),
  uniform = A.notes(R.initial("uniform"));
assert(
  bell[10].frequency > bell[5].frequency &&
    bell[5].frequency > bell[0].frequency,
);
bell.forEach((note, i) => {
  close(note.frequency, bell[20 - i].frequency);
  close(note.at, i * 0.1);
  close(note.pan, (i / 20 - 0.5) * 1.4);
});
assert(uniform.every((n) => n.frequency === uniform[0].frequency));
assert(uniform.every((n) => n.peakGain === uniform[0].peakGain));
assert(
  bell[10].peakGain > bell[5].peakGain && bell[5].peakGain > bell[0].peakGain,
);
assert.equal(A.notes(R.initial("rare")).length, 2); // A 0.1% tail is a note, not rounded away.
assert.equal(A.notes(R.initial("rare"))[1].bin, 20);
assert(A.notes(R.initial("missing")).every((n) => n.bin <= 14));
assert.equal(A.notes(Array(21).fill(0)).length, 0);
const bimodal = A.notes(R.initial("bimodal"));
assert.equal(
  bimodal.filter(
    (n, i) =>
      i > 0 &&
      i < 20 &&
      n.frequency > bimodal[i - 1].frequency &&
      n.frequency > bimodal[i + 1].frequency,
  ).length,
  2,
);
assert(A.duration < A.slot); // Releases finish before the next bin, including a silent gap.
for (const tailAt of [0.1, 0.7, 0.9])
  for (const jump of [0, 0.5, 1]) {
    const cfg = V.validate({
      transform: "hinge",
      tailAt,
      jump,
      bulkScale: 0.4,
      tailScale: 2,
    });
    const xs = Array.from({ length: 1001 }, (_, i) => i / 1000),
      ys = R.transform(xs, "hinge", 0.5, (x) => x, cfg);
    close(ys[0], 0);
    close(ys.at(-1), 1);
    assert(ys.every((v, i) => !i || v > ys[i - 1]));
    const around = R.transform(
        [tailAt, tailAt + 1e-10],
        "hinge",
        0.5,
        (x) => x,
        cfg,
      ),
      den = cfg.bulkScale * tailAt + cfg.tailScale * (1 - tailAt) + jump;
    close(around[1] - around[0], jump / den, 1e-8);
    const sim = R.create(cfg);
    for (let i = 0; i < 50; i++) R.step(sim);
    for (const m of R.methods) {
      const p = R.forward(sim.models[m]);
      close(
        p.reduce((a, b) => a + b, 0),
        1,
      );
      assert(p.every(Number.isFinite));
    }
  }
for (const invalid of [
  { lr: 0 },
  { seed: 1.5 },
  { preset: "nope" },
  { tailAt: 1 },
  { bulkScale: 0 },
  { jump: -1 },
  { custom: "-1,0,1", preset: "custom" },
  { n: 65 },
  { unit: "yes" },
  { floor: Infinity },
  ...[
    [],
    Array(20).fill(1),
    Array(21).fill(0),
    Array(21),
    Array(21).fill(-1),
    Array(21).fill(Infinity),
    Array(21).fill("1"),
    Array(21).fill(1.1),
    {},
  ].map((customWeights) => ({ customWeights })),
])
  assert.throws(() => V.validate(invalid));
// Editor weights retain exact support and rare tails, including through shared JSON.
for (const preset of Object.keys(R.presets).filter((p) => p !== "custom")) {
  const original = R.initial(preset),
    peak = Math.max(...original);
  const cfg = V.validate(
    JSON.parse(
      JSON.stringify({
        preset: "custom",
        customWeights: original.map((w) => w / peak),
      }),
    ),
  );
  const sim = R.create(cfg);
  original.forEach((p, i) => {
    close(sim.base[i], p, 1e-15);
    if (p === 0) assert.equal(sim.base[i], 0);
  });
  R.step(sim);
  for (const method of R.methods)
    assert(R.forward(sim.models[method]).every(Number.isFinite));
}
close(
  R.create(V.validate({ preset: "custom", custom: "0.2,0.2,1" })).base[4],
  2 / 3,
);
assert.equal(
  V.validate({ model: "neural", extra: "ignored" }).extra,
  undefined,
);
const events = [],
  worker = vm.createContext({ console, postMessage: (d) => events.push(d) });
worker.self = worker;
worker.importScripts = (...files) =>
  files.forEach((f) =>
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), worker),
  );
vm.runInContext(fs.readFileSync(path.join(root, "worker.js"), "utf8"), worker);
worker.onmessage({
  data: {
    kind: "pair",
    config: V.validate({ n: 8 }),
    steps: 20,
    seeds: [42, 43, 44],
    transform: "hinge",
  },
});
const pair = events.find((e) => e.type === "complete");
assert(pair);
assert.equal(pair.trials.length, 2);
assert.equal(
  JSON.stringify(pair.trials[0].final.maxrl),
  JSON.stringify(pair.trials[1].final.maxrl),
);
assert.equal(pair.trials[0].curves.tailrl.length, 21);
events.length = 0;
worker.onmessage({
  data: {
    kind: "sweep",
    config: V.validate({ n: 8, model: "neural", transform: "hinge" }),
    steps: 10,
    seeds: [42, 43, 44],
  },
});
const sweep = events.find((e) => e.type === "complete");
assert(sweep);
assert.equal(sweep.rows.length, 11);
for (const row of sweep.rows)
  for (const m of R.methods)
    for (const q of Object.values(row.methods[m]))
      assert(Number.isFinite(q.mean) && Number.isFinite(q.sd));
events.length = 0;
worker.onmessage({
  data: {
    kind: "pair",
    config: { n: 0 },
    steps: 10,
    seeds: [42],
    transform: "identity",
  },
});
assert.equal(events.at(-1).type, "error");
console.log(
  "PASS: piecewise continuity/jump/monotonicity; validated settings; matched worker comparisons; 11-distribution worker sweep; invalid inputs.",
);
