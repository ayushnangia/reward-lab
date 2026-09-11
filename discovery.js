/* The opening is a sampling experiment; training remains in the full lab. */
const Discovery = (() => {
  const D = DiscoveryMath,
    $ = (id) => document.getElementById(id);
  let preset = "split",
    k = 1,
    timer = null;
  const pct = (v) =>
    v > 0 && v < 0.001 ? "<0.1%" : (100 * v).toFixed(1) + "%";
  const score = (v) => v.toFixed(3);
  const escape = (s) =>
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
  function chart(p, m, cap, name, availableWidth) {
    const svgWidth = Math.max(300, Math.round(availableWidth || 514));
    const left = 34,
      right = svgWidth - 22,
      bottom = 164,
      top = 22,
      width = (right - left) / 21;
    const y = (v) => bottom - ((bottom - top) * v) / cap;
    let svg = `<svg viewBox="0 0 ${svgWidth} 202" role="img" aria-label="${escape(name)}: probability mass for one try and the best of ${k} independent tries"><title>${escape(name)} — best of ${k}</title>`;
    svg += `<rect x="${left + 18 * width}" y="${top}" width="${3 * width}" height="${bottom - top}" class="tail-zone"/><text x="${right}" y="12" text-anchor="end" class="tail-caption">EXCELLENT ≥ 0.9</text>`;
    for (const fraction of [0, 0.5, 1]) {
      const mass = cap * fraction;
      svg += `<line x1="${left}" x2="${right}" y1="${y(mass)}" y2="${y(mass)}" class="story-grid"/><text x="${left - 7}" y="${y(mass) + 3}" text-anchor="end" class="axis-label">${Math.round(mass * 100)}%</text>`;
    }
    for (let i = 0; i < 21; i++) {
      const x = left + i * width + 2;
      svg += `<g><title>Score ${D.rewards[i].toFixed(2)}: one try ${pct(p[i])}; best of ${k} ${pct(m.bestP[i])}</title><rect x="${x}" y="${y(p[i])}" width="${width - 4}" height="${bottom - y(p[i])}" rx="1.5" class="original-bar"/><rect x="${x + 2}" y="${y(m.bestP[i])}" width="${width - 8}" height="${bottom - y(m.bestP[i])}" rx="1.5" class="best-bar"/></g>`;
    }
    for (const i of [0, 5, 10, 15, 20])
      svg += `<text x="${left + (i + 0.5) * width}" y="182" text-anchor="middle" class="axis-label">${D.rewards[i].toFixed(2)}</text>`;
    svg += `<text x="${(left + right) / 2}" y="199" text-anchor="middle" class="axis-label axis-title">OUTPUT SCORE →</text></svg>`;
    return svg;
  }
  function render() {
    const p = D.presets[preset],
      a = D.evaluate(p.a, k),
      b = D.evaluate(p.b, k);
    const cap = 1; // Fixed probability scale across sample budgets.
    for (const [id, m, prob, name] of [
      ["a", a, p.a, p.names[0]],
      ["b", b, p.b, p.names[1]],
    ]) {
      $("story-name-" + id).textContent = name;
      $("story-mean-" + id).textContent = score(m.mean);
      $("story-best-" + id).textContent = score(m.best);
      $("story-hit-" + id).textContent = pct(m.success);
      $("story-plot-" + id).innerHTML = chart(
        prob,
        m,
        cap,
        name,
        $("story-plot-" + id).clientWidth,
      );
    }
    document
      .querySelectorAll("[data-budget]")
      .forEach((el) => (el.textContent = k));
    $("story-budget").value = k;
    $("story-budget-value").innerHTML =
      k + " <small>" + (k === 1 ? "try" : "tries") + "</small>";
    $("story-budget").style.setProperty(
      "--progress",
      ((k - 1) / 63) * 100 + "%",
    );
    $("story-budget").setAttribute(
      "aria-valuetext",
      `${k} independent ${k === 1 ? "try" : "tries"} per policy`,
    );
    $("story-takeaway").textContent =
      k === 1
        ? "Both policies have an expected score of 0.500 with one attempt."
        : `At ${k} attempts, B has a ${score(b.best - a.best)} higher expected best score than A. Its probability of scoring below 0.3 on an individual attempt is ${pct(b.bad)}.`;
    $("story-preset-note").textContent = p.note;
    $("story-risk").textContent =
      `On a single try, A has a ${pct(a.bad)} chance of a poor score (< 0.3); B has a ${pct(b.bad)} chance. Retrying and selecting the best does not remove the cost of producing those failures.`;
    document
      .querySelectorAll("[data-story]")
      .forEach((el) =>
        el.setAttribute("aria-pressed", String(el.dataset.story === preset)),
      );
    $("discovery-experiment").dataset.currentBudget = k;
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    $("story-play").textContent = "▶";
    $("story-play").setAttribute("aria-label", "Play sample budgets slowly");
    $("story-play").setAttribute("aria-pressed", "false");
  }
  function set(next, budget) {
    preset = Object.hasOwn(D.presets, next) ? next : "split";
    k = Number.isFinite(Number(budget))
      ? Math.max(1, Math.min(64, Math.round(Number(budget))))
      : 8;
    render();
  }
  function restore() {
    if (RewardApp.view !== "discover") {
      stop();
      return;
    }
    const query = new URLSearchParams(location.search);
    if (query.has("story")) set(query.get("story"), query.get("tries") || 8);
    else render();
  }
  $("story-budget").oninput = (e) => {
    stop();
    k = Number(e.target.value);
    render();
  };
  document.querySelectorAll("[data-story]").forEach(
    (el) =>
      (el.onclick = () => {
        stop();
        set(el.dataset.story, k);
      }),
  );
  $("story-reset").onclick = () => {
    stop();
    set("split", 1);
  };
  $("story-play").onclick = () => {
    if (timer) {
      stop();
      return;
    }
    if (k >= 64) k = 1;
    $("story-play").textContent = "Ⅱ";
    $("story-play").setAttribute("aria-label", "Pause sample budget animation");
    $("story-play").setAttribute("aria-pressed", "true");
    timer = setInterval(() => {
      k = [1, 2, 4, 8, 16, 32, 64].find((v) => v > k) || 64;
      render();
      if (k === 64) stop();
    }, 1800);
  };
  $("story-share").onclick = async () => {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("story", preset);
    url.searchParams.set("tries", k);
    url.hash = "discover";
    try {
      await navigator.clipboard.writeText(url.href);
      RewardApp.notify(
        "Experiment link copied. It opens these distributions and this sample budget.",
      );
    } catch {
      const dialog = document.createElement("dialog");
      dialog.className = "share-dialog";
      const title = document.createElement("h2");
      title.textContent = "Copy this experiment link";
      const input = document.createElement("input");
      input.value = url.href;
      input.readOnly = true;
      input.setAttribute("aria-label", "Experiment link");
      const close = document.createElement("button");
      close.textContent = "Done";
      close.onclick = () => dialog.close();
      dialog.append(title, input, close);
      dialog.addEventListener("close", () => dialog.remove());
      document.body.append(dialog);
      dialog.showModal();
      input.select();
    }
  };
  document.querySelectorAll("[data-discovery-scenario]").forEach(
    (el) =>
      (el.onclick = () => {
        stop();
        RewardApp.loadScenario(Number(el.dataset.discoveryScenario));
      }),
  );
  document.addEventListener("reward-lab-view-change", restore);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  restore();
  return {
    set,
    stop,
    get preset() {
      return preset;
    },
    get k() {
      return k;
    },
  };
})();
