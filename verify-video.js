"use strict";
const assert = require("node:assert/strict");
const R = require("./core.js"), V = require("./video.js"), A = require("./audio.js");
const run = R.create({preset: "missing", seed: 42});
for (let i = 0; i < 25; i++) R.step(run);
const before = JSON.stringify(run.history);
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-10, `${a} != ${b}`);
// Independently pinned live timings: 100 ms/bin and 85 ms/note at 1x.
close(A.playbackTiming(1200).slot, .1);
close(A.duration / A.playbackTiming(1200).rate, .085);
close(V.timing(100, "full", 1200).interval, 3.34);
close(V.timing(100, "full", 300).interval, .865);
assert.equal(V.timing(100, 30, 1200).steps, 8);
assert.equal(V.timing(100, 15, 1200).rate, 1);
assert.equal(V.timing(100, 60, 1200).rate, 1);
close(V.timing(100, "full", 1200, false).interval, 1.2);
for (const pace of [4800,2400,1200,600,400,300]) for (const limit of [15,30,60,"full"]) {
  const plan = V.timing(25, limit, pace), live = A.playbackTiming(pace);
  close(plan.rate, live.rate);
  close(plan.slot, live.slot);
  if (limit !== "full") assert.ok(plan.duration <= limit);
  for (let frame = 0; frame <= plan.duration * 60; frame++) {
    const point = V.frameAt(plan, frame/60);
    const p = V.probabilities(run.history, "grpo", point);
    assert.ok(p.every(x => Number.isFinite(x) && x >= 0));
    close(p.reduce((a,b) => a+b, 0), 1);
    assert.ok(p.slice(15).every(x => x === 0));
  }
  for (let step = 1; step <= plan.steps; step++) {
    const start = (step-1)*plan.interval;
    const point = V.frameAt(plan, start + 2*plan.phase + plan.lead + plan.slot*10.5);
    assert.equal(point.shown, step);
    assert.equal(point.mix, 1);
    assert.equal(point.bin, 10);
    assert.equal(V.frameAt(plan,start + .1*plan.phase).stage,"Sample");
    assert.equal(V.frameAt(plan,start + 1.1*plan.phase).stage,"Weight");
  }
  const end = V.frameAt(plan,plan.duration);
  assert.deepEqual(V.probabilities(run.history,"grpo",end),run.history[plan.steps].methods.grpo.p);
}
assert.equal(JSON.stringify(run.history), before);
assert.equal(V.format({isTypeSupported: () => false}), undefined);
assert.equal(V.format({isTypeSupported: x => x.startsWith("video/webm")})[1], "webm");
assert.equal(V.format({isTypeSupported: () => true})[1], "mp4");
assert.throws(() => V.timing(100,30,0));
assert.throws(() => V.timing(100,0,1200));
console.log("PASS: live note lengths and playback speed preserved for every clip limit; stage/scan alignment, complete-update endings, support, format fallback, and immutable histories.");
