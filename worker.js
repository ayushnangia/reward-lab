"use strict";
importScripts("core.js", "config.js");
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function summarize(records) {
  const keys = Object.keys(records[0]);
  return Object.fromEntries(
    keys.map((k) => {
      const a = records.map((r) => r[k]),
        mean = avg(a),
        sd =
          a.length > 1
            ? Math.sqrt(
                a.reduce((s, x) => s + (x - mean) ** 2, 0) / (a.length - 1),
              )
            : 0;
      return [k, { mean, sd }];
    }),
  );
}
self.onmessage = (event) => {
  try {
    const msg = event.data,
      cfg = LabConfig.validate(msg.config),
      steps = msg.steps,
      seeds = msg.seeds;
    if (
      !["pair", "sweep"].includes(msg.kind) ||
      !Number.isInteger(steps) ||
      steps < 1 ||
      steps > 1000 ||
      !Array.isArray(seeds) ||
      seeds.length < 1 ||
      seeds.length > 5 ||
      seeds.some((s) => !Number.isInteger(s) || s < 0 || s > 4294967295)
    )
      throw Error("Invalid experiment request.");
    if (msg.kind === "pair") {
      if (!LabConfig.enums.transform.includes(msg.transform))
        throw Error("Invalid comparison transform.");
      const trials = [],
        total = seeds.length * 2 * steps;
      let done = 0;
      for (const transform of ["identity", msg.transform]) {
        const runs = [];
        for (const seed of seeds) {
          const s = RewardLab.create({ ...cfg, transform, seed });
          for (let i = 0; i < steps; i++) {
            RewardLab.step(s);
            done++;
            if (done % 25 === 0) postMessage({ type: "progress", done, total });
          }
          runs.push(s.history);
        }
        trials.push({
          transform,
          final: Object.fromEntries(
            RewardLab.methods.map((m) => [
              m,
              summarize(runs.map((r) => r[steps].methods[m].metrics)),
            ]),
          ),
          curves: Object.fromEntries(
            RewardLab.methods.map((m) => [
              m,
              Array.from({ length: steps + 1 }, (_, i) => ({
                x: i,
                metrics: summarize(runs.map((r) => r[i].methods[m].metrics)),
              })),
            ]),
          ),
        });
      }
      postMessage({
        type: "complete",
        kind: "pair",
        config: cfg,
        steps,
        seeds,
        trials,
      });
    } else {
      const presets = Object.keys(RewardLab.presets).filter(
          (x) => x !== "custom",
        ),
        total = presets.length * seeds.length * steps,
        rows = [];
      let done = 0;
      for (const preset of presets) {
        const final = Object.fromEntries(RewardLab.methods.map((m) => [m, []]));
        for (const seed of seeds) {
          const s = RewardLab.create({ ...cfg, preset, seed });
          for (let i = 0; i < steps; i++) {
            RewardLab.step(s);
            done++;
            if (done % 50 === 0)
              postMessage({ type: "progress", done, total, preset });
          }
          for (const m of RewardLab.methods)
            final[m].push(s.history.at(-1).methods[m].metrics);
        }
        rows.push({
          preset,
          methods: Object.fromEntries(
            RewardLab.methods.map((m) => [m, summarize(final[m])]),
          ),
        });
      }
      postMessage({
        type: "complete",
        kind: "sweep",
        config: cfg,
        steps,
        seeds,
        rows,
      });
    }
  } catch (error) {
    postMessage({ type: "error", message: error.message });
  }
};
