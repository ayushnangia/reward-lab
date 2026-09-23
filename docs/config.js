"use strict";
const LabConfig = (() => {
  const defaults = () => ({ ...RewardLab.create().cfg });
  const enums = {
    preset: Object.keys(RewardLab.presets),
    layout: ["quality", "binary", "code"],
    model: ["independent", "shared", "neural"],
    transform: [
      "identity",
      "hinge",
      "affine",
      "log",
      "square",
      "sqrt",
      "boxcox",
      "yeojohnson",
      "zscore",
      "ranknormal",
      "frozen",
      "reciprocal",
    ],
    judge: ["clean", "noise", "falsepositive"],
  };
  const numbers = {
    n: [2, 256, true],
    k: [1, 256, true],
    evalK: [1, 256, true],
    lr: [0.001, 2],
    seed: [0, 4294967295, true],
    lambda: [-2, 3],
    floor: [0, 0.01],
    tailAt: [0.1, 0.9],
    bulkScale: [0.01, 5],
    tailScale: [0.01, 10],
    jump: [0, 1],
    ppoClip: [0.05, 0.5],
    ppoEpochs: [1, 10, true],
    trustKL: [0.001, 0.1],
    criticRate: [0.01, 1],
  };
  function validate(input) {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw Error("A setup must be a JSON object.");
    const cfg = defaults();
    for (const key of Object.keys(cfg))
      if (Object.hasOwn(input, key)) cfg[key] = input[key];
    for (const [key, values] of Object.entries(enums))
      if (!values.includes(cfg[key])) throw Error("Invalid " + key + ".");
    for (const [key, [lo, hi, integer]] of Object.entries(numbers))
      if (
        typeof cfg[key] !== "number" ||
        !Number.isFinite(cfg[key]) ||
        cfg[key] < lo ||
        cfg[key] > hi ||
        (integer && !Number.isInteger(cfg[key]))
      )
        throw Error(
          ({ n: "Samples per update", k: "k", evalK: "Evaluation k" }[key] ||
            key) +
            " must be " +
            (integer ? "an integer" : "a number") +
            " between " +
            lo +
            " and " +
            hi +
            ".",
        );
    if (typeof cfg.unit !== "boolean")
      throw Error("Equal gradient lengths must be true or false.");
    if (typeof cfg.custom !== "string" || cfg.custom.length > 50000)
      throw Error("Custom samples must be text, up to 50,000 characters.");
    if (cfg.preset === "custom" || cfg.customWeights !== null)
      RewardLab.initial("custom", cfg.custom, cfg.customWeights);
    return cfg;
  }
  return { defaults, validate, enums, numbers };
})();
if (typeof module !== "undefined") module.exports = LabConfig;
