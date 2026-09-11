/* Local first-order geometry and paired-prompt evaluation, not an LLM simulator. */
const TransferMath = (() => {
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const norm = (a) => Math.sqrt(dot(a, a));
  function geometry(weights, angle = 40, eta = 0.1) {
    // Features of four possible answers in a conditional softmax policy at theta=0.
    const features = [
      [-0.8, 0.15],
      [-0.3, -0.45],
      [0.25, 0.65],
      [0.9, 0.1],
    ];
    const probabilities = [0.4, 0.35, 0.2, 0.05];
    const average = [0, 1].map((j) =>
      features.reduce((s, f, i) => s + probabilities[i] * f[j], 0),
    );
    const gradients = features.map((f) => f.map((x, j) => x - average[j]));
    // This fixed observed batch contains one of each answer. It is not a population expectation.
    const update = [0, 1].map((j) =>
      mean(weights.map((w, i) => w * gradients[i][j])),
    );
    const theta = (angle * Math.PI) / 180;
    const target = [Math.cos(theta), Math.sin(theta)];
    const magnitude = norm(update);
    return {
      gradients,
      update,
      target,
      magnitude,
      cosine: magnitude ? dot(update, target) / magnitude : 0,
      change: eta * dot(update, target),
    };
  }
  function bootstrap(values, repeats = 1200) {
    if (values.length < 5) return null;
    let seed = 7193;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const samples = Array.from({ length: repeats }, () => {
      let sum = 0;
      for (let i = 0; i < values.length; i++)
        sum += values[Math.floor(random() * values.length)];
      return sum / values.length;
    }).sort((a, b) => a - b);
    return [
      samples[Math.floor(repeats * 0.025)],
      samples[Math.ceil(repeats * 0.975) - 1],
    ];
  }
  function domains(data) {
    const groups = new Map();
    for (const [id, pair] of data.groups) {
      const { domain, split } = pair[0][0];
      const key = JSON.stringify([domain || null, split || null]);
      if (!groups.has(key))
        groups.set(key, {
          domain: domain || null,
          split: split || "unknown",
          prompts: [],
        });
      const before = mean(pair[0].map((r) => Number(r.correct)));
      const after = mean(pair[1].map((r) => Number(r.correct)));
      groups
        .get(key)
        .prompts.push({ id, before, after, delta: after - before });
    }
    return [...groups.values()].map((g) => ({
      domain: g.domain,
      split: g.split,
      n: g.prompts.length,
      before: mean(g.prompts.map((p) => p.before)),
      after: mean(g.prompts.map((p) => p.after)),
      delta: mean(g.prompts.map((p) => p.delta)),
      improved: g.prompts.filter((p) => p.delta > 1e-12).length,
      regressed: g.prompts.filter((p) => p.delta < -1e-12).length,
      interval: bootstrap(g.prompts.map((p) => p.delta)),
    }));
  }
  return { geometry, domains, bootstrap };
})();
if (typeof module !== "undefined") module.exports = TransferMath;
