const fs = require("node:fs");
const C = require("./core.js");
// Reproduce the historical six-method study; live workers include all ten.
const methods = ["rloo", "grpo", "maxrl", "tailrl", "pkpo", "elite"];
const presets = Object.keys(C.presets).filter((x) => x !== "custom");
const transforms = ["identity", "log", "square", "ranknormal", "reciprocal"];
const models = ["independent", "shared", "neural"];
const layouts = ["quality", "binary", "code"];
const results = [];
let count = 0;
const started = Date.now();
for (const preset of presets)
  for (const model of models)
    for (const layout of layouts)
      for (const transform of transforms) {
        const runs = methods.map(() => []);
        for (const seed of [41, 42, 43]) {
          const s = C.create({
            preset,
            model,
            layout,
            transform,
            n: 16,
            k: 4,
            evalK: 16,
            lr: 0.15,
            seed,
          });
          for (let i = 0; i < 150; i++) C.step(s);
          methods.forEach((m, j) =>
            runs[j].push(s.history[150].methods[m].metrics),
          );
          count++;
        }
        methods.forEach((method, j) => {
          const a = runs[j],
            summary = {};
          for (const metric of Object.keys(a[0])) {
            const mean = C.mean(a.map((x) => x[metric])),
              sd = Math.sqrt(
                a.reduce((s, x) => s + (x[metric] - mean) ** 2, 0) /
                  (a.length - 1),
              );
            summary[metric] = { mean, sd };
          }
          const initial = C.metrics(
            C.initial(preset),
            C.trueRewards(layout),
            16,
          );
          results.push({
            preset,
            model,
            layout,
            transform,
            method,
            initial,
            summary,
          });
        });
      }
const data = {
  scope: "Toy model stress sweep, not an LLM benchmark or tuned ranking",
  settings: {
    n: 16,
    training_k: 4,
    evaluation_k: 16,
    learning_rate: 0.15,
    steps: 150,
    seeds: [41, 42, 43],
    judge: "clean",
  },
  trials: count,
  seconds: (Date.now() - started) / 1000,
  results,
};
fs.writeFileSync("stress-results.json", JSON.stringify(data, null, 2));
let csv =
  "preset,model,layout,transform,method,initial_mean,final_mean,sd_mean,initial_high,final_high,final_bad,final_middle,final_best16\n";
for (const r of results)
  csv +=
    [
      r.preset,
      r.model,
      r.layout,
      r.transform,
      r.method,
      r.initial.mean,
      r.summary.mean.mean,
      r.summary.mean.sd,
      r.initial.high,
      r.summary.high.mean,
      r.summary.bad.mean,
      r.summary.middle.mean,
      r.summary.best.mean,
    ].join(",") + "\n";
fs.writeFileSync("stress-results.csv", csv);
console.log(
  JSON.stringify({
    trials: count,
    method_runs: count * methods.length,
    seconds: data.seconds,
    rows: results.length,
  }),
);
