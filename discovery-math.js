/* Exact order statistics for the introductory, constructed distributions. */
const DiscoveryMath = (() => {
  const rewards = Array.from({ length: 21 }, (_, i) => i / 20);
  const normalize = (p) => {
    const total = p.reduce((a, b) => a + b, 0);
    return p.map((v) => v / total);
  };
  const gaussian = (mu, sigma) =>
    rewards.map((r) => Math.exp(-0.5 * ((r - mu) / sigma) ** 2));
  const atoms = (points) => rewards.map((_, i) => points[i] || 0);
  const presets = {
    split: {
      label: "Two peaks",
      a: normalize(gaussian(0.5, 0.09)),
      b: normalize(
        rewards.map(
          (r) =>
            Math.exp(-0.5 * ((r - 0.22) / 0.065) ** 2) +
            Math.exp(-0.5 * ((r - 0.78) / 0.065) ** 2),
        ),
      ),
      names: ["Single peak", "Two peaks"],
      note: "Policy B has more probability at both low and high scores. Its expected best-of-k score can rise while individual attempts still fail.",
    },
    jackpot: {
      label: "Rare jackpot",
      a: atoms({ 10: 1 }),
      b: atoms({ 9: 0.9, 19: 0.1 }),
      names: ["Fixed score", "Rare high score"],
      note: "Policy B scores 0.95 with probability 10%. Independent retries increase the chance of finding this outcome; each attempt retains the same score distribution.",
    },
    spread: {
      label: "More spread",
      a: atoms({ 8: 0.5, 12: 0.5 }),
      b: atoms({ 2: 0.5, 18: 0.5 }),
      names: ["Narrow spread", "Wide spread"],
      note: "Spreading probability toward both extremes preserves the mean here. Half of the wide policy’s individual outputs still score just 0.10.",
    },
  };
  function evaluate(p, k) {
    if (!Number.isInteger(k) || k < 1 || k > 128)
      throw Error("Sample budget must be an integer from 1 to 128.");
    let cumulative = 0;
    const bestP = p.map((mass) => {
      const before = cumulative;
      cumulative = Math.min(1, cumulative + mass);
      return Math.max(0, cumulative ** k - before ** k);
    });
    const mean = p.reduce((s, v, i) => s + v * rewards[i], 0);
    const best = bestP.reduce((s, v, i) => s + v * rewards[i], 0);
    const high = p.reduce((s, v, i) => s + (rewards[i] >= 0.9 ? v : 0), 0);
    const bad = p.reduce((s, v, i) => s + (rewards[i] < 0.3 ? v : 0), 0);
    const success = high >= 1 ? 1 : -Math.expm1(k * Math.log1p(-high));
    return { mean, best, bestP, high, bad, success };
  }
  return { presets, rewards, evaluate };
})();
if (typeof module !== "undefined") module.exports = DiscoveryMath;
