"use strict";
const LabCharts = (() => {
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const num = (x, d = 2) => Number(x).toFixed(d);
  function box(el, height) {
    return {
      w: Math.max(240, el.clientWidth),
      h: height || el.clientHeight || 250,
    };
  }
  function text(x, y, t, anchor = "middle", cls = "") {
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}">${esc(t)}</text>`;
  }
  function svg(el, w, h, title, body) {
    el.innerHTML = `<svg class="plot" role="img" aria-label="${esc(title)}" viewBox="0 0 ${w} ${h}"><title>${esc(title)}</title>${body}</svg>`;
  }
  function tip(event, value) {
    const t = document.getElementById("tooltip");
    t.textContent = value;
    t.hidden = false;
    const w = t.offsetWidth;
    t.style.left =
      Math.min(window.innerWidth - w - 12, Math.max(12, event.clientX + 12)) +
      "px";
    t.style.top = Math.max(8, event.clientY - 42) + "px";
  }
  function hideTip() {
    document.getElementById("tooltip").hidden = true;
  }
  function hist(el, rows, opts = {}) {
    const { w, h } = box(el),
      mini = opts.mini,
      L = mini ? 4 : 43,
      R = mini ? 4 : 12,
      T = mini ? 4 : 26,
      B = mini ? 18 : 34,
      iw = w - L - R,
      ih = h - T - B;
    const min = opts.min ?? -0.025,
      max = opts.max ?? 1.025,
      ceiling = Math.max(
        0.001,
        opts.ceiling ??
          Math.max(...rows.map((d) => Math.max(d.p, d.initial || 0))) * 1.07,
      );
    const x = (v) => L + ((v - min) / (max - min)) * iw,
      y = (v) => T + ih * (1 - v / ceiling),
      bw = opts.barWidth ?? ((max - min) / rows.length) * 0.72;
    let body = "";
    if (!mini) {
      [0, 0.5, 1].forEach((v) => {
        const val = ceiling * v,
          yy = y(val);
        body +=
          `<line class="grid-line" x1="${L}" x2="${w - R}" y1="${yy}" y2="${yy}"/>` +
          text(
            L - 7,
            yy + 4,
            (val * 100).toFixed(ceiling < 0.05 ? 1 : 0) + "%",
            "end",
          );
      });
      body += text(L, 14, "Probability", "start", "axis-title");
    }
    rows.forEach((d) => {
      const xx = x(d.x),
        width = Math.max(1, (bw / (max - min)) * iw);
      if (d.initial !== undefined)
        body += `<rect x="${xx - width * 0.68}" y="${y(d.initial)}" width="${width * 1.36}" height="${Math.max(0, y(0) - y(d.initial))}" fill="var(--initial)"/>`;
      body += `<rect x="${xx - width / 2}" y="${y(d.p)}" width="${width}" height="${Math.max(0, y(0) - y(d.p))}" fill="${opts.color || "var(--accent)"}" opacity=".85"/>`;
    });
    const ticks = opts.ticks || [0, 0.5, 1];
    ticks.forEach(
      (v) => (body += text(x(v), h - (mini ? 2 : 17), Number(v.toFixed(2)))),
    );
    if (!mini)
      body += text(
        (L + w - R) / 2,
        h - 2,
        opts.xlabel || "True reward",
        "middle",
        "axis-title",
      );
    body += `<rect class="chart-pointer" x="${L}" y="${T}" width="${iw}" height="${ih}"/>`;
    svg(el, w, h, opts.title || "Reward probabilities", body);
    const hit = el.querySelector(".chart-pointer");
    hit.addEventListener("pointermove", (e) => {
      const bb = el.getBoundingClientRect(),
        v = min + ((e.clientX - bb.left - L) / iw) * (max - min);
      const d = rows.reduce((a, b) =>
        Math.abs(a.x - v) < Math.abs(b.x - v) ? a : b,
      );
      tip(
        e,
        `${opts.xlabel || "Reward"} ${num(d.x)} · probability ${num(d.p * 100, 2)}%${d.initial !== undefined ? " · initial " + num(d.initial * 100, 2) + "%" : ""}`,
      );
    });
    hit.addEventListener("pointerleave", hideTip);
  }
  function lines(el, series, opts = {}) {
    const { w, h } = box(el),
      L = 48,
      R = 18,
      T = 27,
      B = 42,
      iw = w - L - R,
      ih = h - T - B;
    const points = series.flatMap((s) => s.points),
      xmin = opts.xmin ?? 0,
      xmax = opts.xmax ?? Math.max(1, ...points.map((d) => d.x)),
      ymin = opts.ymin ?? Math.min(0, ...points.map((d) => d.y)),
      ymax = opts.ymax ?? Math.max(0.01, ...points.map((d) => d.y)) * 1.06;
    const x = (v) => L + ((v - xmin) / (xmax - xmin)) * iw,
      y = (v) => T + ih * (1 - (v - ymin) / (ymax - ymin));
    let body = "";
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      const yy = T + ih * v,
        val = ymax - v * (ymax - ymin);
      body +=
        `<line class="grid-line" x1="${L}" x2="${w - R}" y1="${yy}" y2="${yy}"/>` +
        text(
          L - 9,
          yy + 4,
          opts.percent
            ? (val * 100).toFixed(0) + "%"
            : num(val, val >= 10 ? 0 : 2),
          "end",
        );
    });
    const ticks = opts.xticks || [
      ...new Set(
        [xmin, (xmax + xmin) / 2, xmax].map((v) =>
          opts.integerX ? Math.round(v) : v,
        ),
      ),
    ];
    ticks.forEach((v) => (body += text(x(v), h - 23, Number(v.toFixed(2)))));
    body +=
      text(L, 14, opts.ylabel || "True reward", "start", "axis-title") +
      text(
        (L + w - R) / 2,
        h - 3,
        opts.xlabel || "Policy updates",
        "middle",
        "axis-title",
      );
    series.forEach((s) => {
      const path = s.points
        .map((p, i) => `${i ? "L" : "M"}${num(x(p.x))},${num(y(p.y))}`)
        .join(" ");
      body += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.2}" ${s.dash ? 'stroke-dasharray="5 4"' : ""}/>`;
      if (s.points.length === 1) {
        const p = s.points[0];
        body += `<circle cx="${x(p.x)}" cy="${y(p.y)}" r="3" fill="${s.color}"/>`;
      }
    });
    if (opts.cursor !== undefined)
      body += `<line x1="${x(opts.cursor)}" x2="${x(opts.cursor)}" y1="${T}" y2="${h - B}" stroke="var(--muted)" stroke-dasharray="3 4" opacity=".6"/>`;
    body += `<g data-hover hidden></g><rect class="chart-pointer" x="${L}" y="${T}" width="${iw}" height="${ih}"/>`;
    svg(el, w, h, opts.title || "Learning curves", body);
    const hit = el.querySelector(".chart-pointer"),
      hover = el.querySelector("[data-hover]");
    const inspect = (e) => {
      const bb = el.getBoundingClientRect(),
        mouseX = Math.max(L, Math.min(w - R, e.clientX - bb.left)),
        v = Math.min(
          opts.observedMax ?? xmax,
          xmin + ((mouseX - L) / iw) * (xmax - xmin),
        ),
        px = x(v);
      let marks = `<line x1="${px}" x2="${px}" y1="${T}" y2="${h - B}" stroke="var(--muted)" stroke-width="1"/>`;
      const values = series.map((s) => {
        let lo = 0,
          hi = s.points.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (s.points[mid].x < v) lo = mid + 1;
          else hi = mid;
        }
        const b = s.points[lo],
          a = s.points[Math.max(0, lo - 1)];
        const val =
          b.x === a.x ? b.y : a.y + ((b.y - a.y) * (v - a.x)) / (b.x - a.x);
        marks += `<circle cx="${px}" cy="${y(val)}" r="3.5" fill="${s.color}" stroke="var(--surface)" stroke-width="1.5"/>`;
        return { name: s.name, value: val, color: s.color };
      });
      hover.innerHTML = marks;
      hover.removeAttribute("hidden");
      if (opts.readout) opts.readout(v, values);
    };
    hit.addEventListener("pointermove", inspect);
    hit.addEventListener("pointerdown", inspect);
    hit.addEventListener("pointerleave", () =>
      hover.setAttribute("hidden", ""),
    );
    if (opts.onSelect)
      hit.addEventListener("click", (e) => {
        const bb = el.getBoundingClientRect();
        opts.onSelect(
          Math.round(xmin + ((e.clientX - bb.left - L) / iw) * (xmax - xmin)),
        );
      });
  }
  function rewardRows(p, rewards) {
    const bins = Array.from({ length: 21 }, (_, i) => ({ x: i / 20, p: 0 }));
    p.forEach((v, i) => (bins[Math.round(rewards[i] * 20)].p += v));
    return bins;
  }
  return { hist, lines, rewardRows, esc, hideTip };
})();
