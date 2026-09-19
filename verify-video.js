"use strict";
const assert = require("node:assert/strict");
const R = require("./core.js"), V = require("./video.js");
const run = R.create({preset: "missing", seed: 42});
for (let i = 0; i < 25; i++) R.step(run);
const before = JSON.stringify(run.history);
for (const duration of [15, 30, 60]) {
  const {interval, transition, scan} = V.timing(run.step, duration);
  assert.equal(interval, transition + scan);
  for (let frame = 0; frame <= duration * 60; frame++) {
    const elapsed = frame / 60, point = V.frameAt(run.step, duration, elapsed);
    for (const method of ["grpo", "ppo", "tailrl"]) {
      const p = V.probabilities(run.history, method, point);
      assert.ok(p.every(x => Number.isFinite(x) && x >= 0));
      assert.ok(Math.abs(p.reduce((a,b) => a+b, 0) - 1) < 1e-12);
      assert.ok(p.slice(15).every(x => x === 0), "Interpolation must not invent absent outcomes");
      if (elapsed === duration) assert.deepEqual(p, run.history[25].methods[method].p);
    }
  }
  for (let step = 1; step <= 25; step++) {
    // Each scan must sound the exact policy shown, after its transition finishes.
    const point = V.frameAt(25, duration, 1 + (step - 1) * interval + transition + scan / 2);
    assert.equal(point.to, step);
    assert.equal(point.mix, 1);
    assert.equal(point.bin, 10);
    assert.deepEqual(V.probabilities(run.history, "grpo", point), run.history[step].methods.grpo.p);
  }
}
assert.equal(JSON.stringify(run.history), before, "Export must not mutate recorded policies");
assert.equal(V.format({isTypeSupported: () => false}), undefined);
assert.equal(V.format({isTypeSupported: x => x.startsWith("video/webm")})[1], "webm");
assert.equal(V.format({isTypeSupported: () => true})[1], "mp4");
assert.throws(() => V.timing(0, 30));
assert.throws(() => V.timing(100, 0));
console.log("PASS: video timing, exact audio/visual alignment, normalized interpolation, preserved zero support and run history, and format fallback.");
