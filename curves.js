"use strict";
const RhoCurves = (() => {
  const metrics = {mean: "Mean original reward", high: "P(reward ≥ 0.9)", bad: "P(reward < 0.3)", middle: "P(0.3 ≤ reward < 0.9)", best: "Expected best-of-k reward", entropy: "Entropy (nats)"};
  function data(history, methods, metric, shown, horizon) {
    if (!Object.hasOwn(metrics, metric)) throw Error("Unknown learning-curve metric.");
    const max = metric === "entropy" ? Math.log(history[0].methods[methods[0]].p.length) : 1;
    return {label: metrics[metric], max, horizon, shown,
      series: methods.map(id => ({id, points: history.slice(0, shown + 1).map((frame, step) => ({step, value: frame.methods[id].metrics[metric]}))}))};
  }
  function svg(plot, names) {
    const x = step => 64 + step / plot.horizon * 900, y = value => 260 - value / plot.max * 220;
    return `<svg viewBox="0 0 1000 310" role="img" aria-label="${plot.label} over training updates"><title>${plot.label} over training updates</title><desc>Selected algorithms through update ${plot.shown}. Values use original rewards, not transformed training scores.</desc>${[0,.5,1].map(t => `<path d="M64 ${y(t*plot.max)}H964" class="gridline"/><text x="8" y="${y(t*plot.max)+5}">${(t*plot.max).toFixed(2)}</text>`).join("")}${[0,.5,1].map(t=>`<text x="${x(t*plot.horizon)}" y="284" text-anchor="middle">${t*plot.horizon}</text>`).join("")}<text x="510" y="307" text-anchor="middle">Training update</text><path d="M${x(plot.shown)} 40V260" stroke="var(--muted)" stroke-dasharray="4 4"/>${plot.series.map(s=>`<polyline data-curve="${s.id}" fill="none" stroke="var(--${s.id})" stroke-width="2.5" points="${s.points.map(p=>`${x(p.step)},${y(p.value)}`).join(" ")}"/><circle cx="${x(plot.shown)}" cy="${y(s.points.at(-1).value)}" r="4" fill="var(--${s.id})"><title>${names[s.id]}: ${s.points.at(-1).value.toFixed(4)} at update ${plot.shown}</title></circle>`).join("")}</svg>`;
  }
  return {metrics, data, svg};
})();
if (typeof module !== "undefined") module.exports = RhoCurves;
