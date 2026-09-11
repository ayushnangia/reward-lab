"use strict";
(() => {
  const A = RewardApp,
    { $, C, M, E, pct, fmt, color, notify, options } = A;
  const heading = (tag, title, description) =>
    `<div class="page-heading"><div><p class="eyebrow">${tag}</p><h1>${title}</h1><p class="muted reading-intro">${description}</p></div></div>`;
  const summary = (cfg) =>
    `${RewardLab.presets[cfg.preset]} · ${C.models[cfg.model]} · ${C.layouts[cfg.layout]} · n=${cfg.n}, rate=${cfg.lr}, judge=${C.judges[cfg.judge]}`;
  $("view-shaping").innerHTML =
    heading(
      "Rho / Transforms",
      "Reward transformations",
      "Inspect how a map changes the reward axis while holding output probabilities fixed. Then apply it to a learning experiment.",
    ) +
    `
    <div class="notice">Select Training reward in Experiment settings to preview a map. Apply & restart starts the experiment with those settings.</div>
    <section class="surface shaping-plots"><div class="section-heading"><h2 id="map-title">Reward mapping</h2><button id="try-piecewise">Try bulk ↓ / tail ↑</button></div><div id="mapping-chart" class="large-chart"></div><div id="mapping-readout" class="chart-readout"></div><p id="mapping-explanation" class="shaping-description"></p></section>
    <div class="two-columns shaping-plots" style="margin-top:18px"><section class="surface"><h2>Original reward axis</h2><p class="hint">Initial policy, before judge noise.</p><div id="raw-shape-chart" class="large-chart"></div></section><section class="surface"><h2>Transformed reward axis</h2><p class="hint">Exactly the same output probabilities, in 32 score bins.</p><div id="mapped-shape-chart" class="large-chart"></div></section></div>
    <section class="surface explainer"><h2>Where your weighting enters</h2><p>Let p(t) be the probability of clearing reward threshold t. For a fixed, differentiable, increasing map g, each objective combines the reward slope with its own threshold weight:</p><div class="table-scroll"><table class="formula-table"><thead><tr><th>Objective</th><th>Threshold gradient weight</th></tr></thead><tbody><tr><td>Ordinary mean reward</td><td>g′(t)</td></tr><tr><td>Best-of-k reward</td><td>g′(t) · k · (1 − p(t))<sup>k−1</sup></td></tr><tr><td>Population TailRL</td><td>g′(t) / p(t)</td></tr><tr><td>Order-T TailRL</td><td>g′(t) · [1 − (1 − p(t))<sup>T</sup>] / p(t)</td></tr></tbody></table></div><p>With the original reward, g′ = 1. Your piecewise map makes that slope smaller in the bulk and larger in the tail. Setting a positive jump adds an atomic threshold contribution; the ordinary derivative table alone no longer describes the whole map.</p><p class="hint">The lab’s centered TailRL estimator uses finite order T = n − 1. These expressions are not a substitute for GRPO’s batch-dependent normalization. <a href="https://arxiv.org/pdf/2609.02987" target="_blank" rel="noreferrer">TailRL: Proposition 9 and finite-order construction ↗</a></p></section>
    <div class="file-actions"><button id="shape-apply" class="primary">Apply this map & open live lab</button><a href="#experiments" class="inline-link">Compare against original rewards →</a></div>`;
  window.renderRewardShaping = () => {
    if (A.view !== "shaping") return;
    let cfg;
    try {
      cfg = A.readForm();
    } catch (error) {
      $("mapping-explanation").textContent = error.message;
      return;
    }
    const state = RewardLab.create(cfg),
      raw = state.rewards,
      p = state.base,
      mu = p.reduce((s, v, i) => s + v * raw[i], 0),
      sd = Math.sqrt(p.reduce((s, v, i) => s + v * (raw[i] - mu) ** 2, 0));
    const group = ["zscore", "ranknormal"].includes(cfg.transform);
    const map = (r) => {
      if (cfg.transform === "zscore") return sd > 1e-12 ? (r - mu) / sd : 0;
      if (cfg.transform === "ranknormal") {
        let below = 0,
          equal = 0;
        raw.forEach((v, i) => {
          if (v < r) below += p[i];
          if (v === r) equal += p[i];
        });
        return RewardLab.invNorm(
          Math.max(0.001, Math.min(0.999, below + equal / 2)),
        );
      }
      return RewardLab.transform(
        [r],
        cfg.transform,
        cfg.lambda,
        state.frozen,
        cfg,
      )[0];
    };
    const xs = Array.from({ length: 201 }, (_, i) => i / 200);
    if (cfg.transform === "hinge") xs.push(cfg.tailAt, cfg.tailAt + 1e-8);
    xs.sort((a, b) => a - b);
    const pts = xs.map((x) => ({ x, y: map(x) })),
      ys = pts.map((p) => p.y),
      lo = Math.min(0, ...ys),
      hi = Math.max(1, ...ys);
    LabCharts.lines(
      $("mapping-chart"),
      [
        {
          name: "Original",
          color: "var(--initial)",
          dash: true,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
        { name: "Transformed", color: "var(--accent)", points: pts },
      ],
      {
        xmax: 1,
        ymin: lo,
        ymax: hi,
        xlabel: "True reward r",
        ylabel: "Training reward g(r)",
        title: "Original and transformed reward mapping",
        readout: (x, values) => {
          $("mapping-readout").textContent =
            `True reward ${fmt(x)} → transformed reward ${fmt(values[1].value)}`;
        },
      },
    );
    $("map-title").textContent = C.transforms[cfg.transform];
    let note = C.transformNotes[cfg.transform] + " ";
    if (cfg.transform === "hinge") {
      const end =
        cfg.bulkScale * cfg.tailAt +
        cfg.tailScale * (1 - cfg.tailAt) +
        cfg.jump;
      note += `After endpoint scaling: bulk slope ${(cfg.bulkScale / end).toFixed(3)}, tail slope ${(cfg.tailScale / end).toFixed(3)}, jump ${(cfg.jump / end).toFixed(3)} at r = ${cfg.tailAt}. `;
      note +=
        cfg.jump > 0
          ? "The jump leaves an interval of transformed scores unattainable. That is a score-axis gap, before learning."
          : "The pieces meet continuously. Uneven density can still look like a valley; there is no discontinuous score jump.";
    } else if (group)
      note +=
        "This preview uses the exact initial distribution’s population counterpart, with normal quantiles clipped at CDF 0.001 and 0.999. Live training uses each finite sampled group instead. They need not match.";
    else
      note +=
        "Only the score coordinates change here. Training is what can change output probabilities.";
    $("mapping-explanation").textContent = note;
    const values = raw.map(map),
      vmin = Math.min(...values),
      vmax = Math.max(...values),
      span = Math.max(0.1, vmax - vmin),
      left = vmin - span * 0.025,
      right = vmax + span * 0.025,
      width = (right - left) / 32;
    const bins = Array.from({ length: 32 }, (_, i) => ({
      x: left + (i + 0.5) * width,
      p: 0,
    }));
    values.forEach(
      (v, i) =>
        (bins[Math.max(0, Math.min(31, Math.floor((v - left) / width)))].p +=
          p[i]),
    );
    const initial = LabCharts.rewardRows(p, raw),
      ceiling =
        Math.max(...initial.map((d) => d.p), ...bins.map((d) => d.p)) * 1.08;
    LabCharts.hist($("raw-shape-chart"), initial, {
      ceiling,
      title: "Initial distribution on true reward axis",
    });
    LabCharts.hist($("mapped-shape-chart"), bins, {
      ceiling,
      min: left,
      max: right,
      ticks: [vmin, (vmin + vmax) / 2, vmax].filter(
        (x, i, a) => a.indexOf(x) === i,
      ),
      barWidth: width * 0.9,
      xlabel: "Transformed reward",
      title: "The same probabilities on the transformed score axis",
      color: "var(--tailrl)",
    });
  };
  $("try-piecewise").onclick = () => {
    const el = $("transform");
    el.value = "hinge";
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (
      innerWidth <= 900 &&
      !document.querySelector(".settings").classList.contains("mobile-open")
    )
      document.querySelector(".mobile-settings").click();
  };
  $("shape-apply").onclick = () => {
    try {
      A.reset(A.readForm(), "Reward map applied.");
      location.hash = "lab";
    } catch (e) {
      notify(e.message, true);
    }
  };

  $("view-experiments").innerHTML =
    heading(
      "Rho / Sweeps",
      "Paired comparisons and sweeps",
      "Load a guided setup, compare a transformation against the original, or sweep all starting distributions.",
    ) +
    `
    <details class="guided-setups"><summary>Guided examples</summary><div class="experiment-grid">${C.scenarios.map((s, i) => `<article class="experiment-card"><span class="experiment-number">${String(i + 1).padStart(2, "0")}</span><div><h3>${s.title}</h3><p>${s.text}</p></div><button data-scenario="${i}">Open setup</button></article>`).join("")}</div></details>
    <section class="surface" id="pair-section"><h2>Original reward vs. one transformation</h2><p class="hint">Same starting distribution, model, and judge. All ten methods train separately with consecutive seeds from the current experiment settings.</p>
      <div class="comparison-controls"><label>Compare original against<select id="pair-transform"></select></label><label>Updates<select id="pair-steps"><option>150</option><option selected>300</option><option>1000</option></select></label><label>Seeds<select id="pair-seeds"><option value="1">1 seed</option><option value="3" selected>3 seeds</option></select></label><button id="pair-run" class="primary">Run comparison</button><button id="pair-cancel" hidden>Cancel</button></div>
      <div class="busy-text" id="pair-status" role="status">Choose a transformation to compare.</div><progress id="pair-progress" max="100" value="0" class="full" hidden aria-label="Comparison progress"></progress>
      <div id="pair-results" hidden><div class="section-heading" style="margin-top:20px"><label class="inline-label">Compare metric<select id="pair-metric"></select></label><button id="pair-export">Export comparison</button></div><p class="hint">Solid = transformed · dashed = original. Values are mean ± sample SD across seeds, not confidence intervals. MaxRL stays identical because it bypasses this transform.</p><div id="pair-table" class="table-scroll"></div><div id="pair-charts" class="distribution-grid" style="margin-top:20px"></div></div>
    </section>
    <section class="surface"><h2>Distribution sweep</h2><p class="hint">Run each starting distribution with three seeds, using the current settings. Each method receives the same rollout count. The sweep runs separately from the live policy.</p><div class="comparison-controls"><label>Updates per trial<select id="sweep-steps"><option selected>150</option><option>300</option></select></label><button id="sweep-run" class="primary">Run distribution sweep</button><button id="sweep-cancel" hidden>Cancel</button><button id="sweep-export" hidden>Export sweep</button></div><div id="sweep-status" class="busy-text" role="status">33 trials · 330 method runs</div><progress id="sweep-progress" max="100" value="0" class="full" hidden aria-label="Distribution sweep progress"></progress><label id="sweep-metric-label" class="inline-label" style="margin-top:15px" hidden>Show<select id="sweep-metric"></select></label><div id="sweep-results" class="table-scroll"></div></section>
    <section class="surface"><h2>Saved results</h2><p class="hint">11 distributions × 3 models × 3 tasks × 5 transforms × 3 seeds × 6 algorithms. These use 150 updates, n = 16, training k = 4, evaluation k = 16, rate = 0.15, an accurate judge, and zero support floor. The sidebar does not change these saved results.</p>
      <button id="bench-load">Browse saved results</button><div id="bench-content" hidden><div class="bench-filters"><label>Distribution<select id="bench-preset"></select></label><label>Model<select id="bench-model"></select></label><label>Task<select id="bench-layout"></select></label><label>Transform<select id="bench-transform"></select></label></div><div id="bench-table" class="table-scroll"></div><p class="hint">Mean ± sample SD across three seeds. Shared learning rate; no per-method tuning. This is a sensitivity study, not a leaderboard.</p></div>
      <div class="file-actions"><a href="stress-results.csv" download>Download all summary rows · CSV</a><a href="stress-results.json" download>Download full results · JSON</a></div></section>`;
  document
    .querySelectorAll("[data-scenario]")
    .forEach(
      (b) => (b.onclick = () => A.loadScenario(Number(b.dataset.scenario))),
    );
  options($("pair-transform"), C.transforms);
  $("pair-transform").value = "hinge";
  options($("pair-metric"), C.metrics);
  options($("sweep-metric"), C.metrics);
  let pairResult = null,
    sweepResult = null;
  function seedList(cfg, count) {
    return Array.from({ length: count }, (_, i) => (cfg.seed + i) >>> 0);
  }
  function worker(kind) {
    const pair = kind === "pair",
      prefix = pair ? "pair" : "sweep";
    if ((pair && A.pairWorker) || (!pair && A.sweepWorker)) return;
    let cfg;
    try {
      cfg = A.readForm();
    } catch (e) {
      notify(e.message, true);
      return;
    }
    const steps = Number($(prefix + "-steps").value),
      seeds = seedList(cfg, pair ? Number($("pair-seeds").value) : 3),
      w = new Worker("worker.js");
    if (pair) A.pairWorker = w;
    else A.sweepWorker = w;
    $(prefix + "-run").disabled = true;
    $(prefix + "-cancel").hidden = false;
    $(prefix + "-progress").hidden = false;
    $(prefix + "-progress").value = 0;
    $(prefix + "-status").textContent =
      "Running " + summary(cfg) + " · seeds " + seeds.join(", ");
    function done() {
      w.terminate();
      if (pair) A.pairWorker = null;
      else A.sweepWorker = null;
      $(prefix + "-run").disabled = false;
      $(prefix + "-cancel").hidden = true;
      $(prefix + "-progress").hidden = true;
    }
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === "progress") {
        $(prefix + "-progress").value = (d.done / d.total) * 100;
        return;
      }
      if (d.type === "error") {
        done();
        $(prefix + "-status").textContent = "Experiment failed: " + d.message;
        notify(d.message, true);
        return;
      }
      if (d.type === "complete") {
        done();
        $(prefix + "-status").textContent =
          `Completed ${steps} updates · seeds ${seeds.join(", ")} · ${summary(cfg)}${pair ? " · transformed: " + C.transforms[d.trials[1].transform] : " · all 11 distributions"}`;
        if (pair) {
          pairResult = d;
          $("pair-results").hidden = false;
          renderPair();
        } else {
          sweepResult = d;
          $("sweep-export").hidden = false;
          $("sweep-metric-label").hidden = false;
          renderSweep();
        }
        notify(
          pair
            ? "Matched comparison is ready."
            : "Distribution sweep is ready.",
        );
      }
    };
    w.onerror = (e) => {
      done();
      $(prefix + "-status").textContent = "Experiment failed: " + e.message;
      notify("Could not finish the experiment.", true);
    };
    $(prefix + "-cancel").onclick = () => {
      done();
      $(prefix + "-status").textContent =
        "Cancelled. Any previous completed results remain below.";
    };
    w.postMessage({
      kind,
      config: cfg,
      steps,
      seeds,
      transform: $("pair-transform").value,
    });
  }
  function renderPair() {
    if (!pairResult) return;
    const metric = $("pair-metric").value,
      percent = ["high", "bad", "middle"].includes(metric),
      f = (x) => (percent ? pct(x) : fmt(x)),
      [base, variant] = pairResult.trials;
    $("pair-table").innerHTML =
      `<table><thead><tr><th>Algorithm</th><th>Original</th><th>${E(C.transforms[variant.transform])}</th><th>Change${percent ? " · percentage points" : ""}</th></tr></thead><tbody>` +
      M.map((m) => {
        const a = base.final[m][metric],
          b = variant.final[m][metric],
          delta = b.mean - a.mean;
        return `<tr><td><i class="dot" style="--series:${color(m)}"></i> ${C.names[m]}</td><td>${f(a.mean)} ± ${f(a.sd)}</td><td>${f(b.mean)} ± ${f(b.sd)}</td><td>${delta > 0 ? "+" : ""}${percent ? (delta * 100).toFixed(2) : fmt(delta)}</td></tr>`;
      }).join("") +
      "</tbody></table>";
    $("pair-charts").innerHTML = M.map(
      (m) =>
        `<article class="distribution-card"><div class="dist-title"><h3>${C.names[m]}</h3></div><div id="pair-chart-${m}" style="height:180px"></div></article>`,
    ).join("");
    for (const m of M)
      LabCharts.lines(
        $("pair-chart-" + m),
        [base, variant].map((r, i) => ({
          name: i ? "Transformed" : "Original",
          color: color(m),
          dash: i === 0,
          points: r.curves[m].map((d) => ({
            x: d.x,
            y: d.metrics[metric].mean,
          })),
        })),
        {
          integerX: true,
          ymin: 0,
          ymax: metric === "entropy" ? Math.log(21) : 1,
          percent,
          ylabel: C.metrics[metric].split(" · ")[0],
          title: `${C.names[m]} original and transformed ${C.metrics[metric]}`,
        },
      );
  }
  function renderSweep() {
    if (!sweepResult) return;
    const metric = $("sweep-metric").value,
      f = (x) => (["high", "bad", "middle"].includes(metric) ? pct(x) : fmt(x));
    $("sweep-results").innerHTML =
      "<table><thead><tr><th>Initial distribution</th>" +
      M.map((m) => `<th>${C.names[m]}</th>`).join("") +
      "</tr></thead><tbody>" +
      sweepResult.rows
        .map(
          (r) =>
            `<tr><td>${RewardLab.presets[r.preset]}</td>${M.map((m) => {
              const q = r.methods[m][metric];
              return `<td>${f(q.mean)}<span class="result-delta">± ${f(q.sd)}</span></td>`;
            }).join("")}</tr>`,
        )
        .join("") +
      '</tbody></table><p class="sweep-note">Mean ± sample SD across three seeds. This single setting cannot establish an algorithm ranking.</p>';
  }
  $("pair-run").onclick = () => worker("pair");
  $("sweep-run").onclick = () => worker("sweep");
  $("pair-metric").onchange = renderPair;
  $("sweep-metric").onchange = renderSweep;
  $("pair-export").onclick = () =>
    A.download("rho-comparison.json", pairResult);
  $("sweep-export").onclick = () => A.download("rho-sweep.json", sweepResult);
  options(
    $("bench-preset"),
    Object.fromEntries(
      Object.entries(RewardLab.presets).filter(([k]) => k !== "custom"),
    ),
  );
  options($("bench-model"), C.models);
  options($("bench-layout"), C.layouts);
  options(
    $("bench-transform"),
    Object.fromEntries(
      ["identity", "log", "square", "ranknormal", "reciprocal"].map((k) => [
        k,
        C.transforms[k],
      ]),
    ),
  );
  function renderBench() {
    if (!A.bench) return;
    const selected = Object.fromEntries(
        ["preset", "model", "layout", "transform"].map((k) => [
          k,
          $("bench-" + k).value,
        ]),
      ),
      rows = A.bench.results.filter((r) =>
        Object.entries(selected).every(([k, v]) => r[k] === v),
      );
    $("bench-table").innerHTML =
      "<table><thead><tr><th>Algorithm</th><th>Initial mean</th><th>Final mean</th><th>Excellent</th><th>Poor</th><th>Middle</th><th>Best-of-16</th></tr></thead><tbody>" +
      rows
        .map(
          (r) =>
            `<tr><td>${C.names[r.method]}</td><td>${fmt(r.initial.mean)}</td>${[
              "mean",
              "high",
              "bad",
              "middle",
              "best",
            ]
              .map((k) => {
                const f = ["high", "bad", "middle"].includes(k) ? pct : fmt;
                return `<td>${f(r.summary[k].mean)}<span class="result-delta">± ${f(r.summary[k].sd)}</span></td>`;
              })
              .join("")}</tr>`,
        )
        .join("") +
      "</tbody></table>";
  }
  $("bench-load").onclick = async () => {
    const b = $("bench-load");
    b.disabled = true;
    b.textContent = "Loading local results…";
    try {
      const response = await fetch("stress-results.json");
      if (!response.ok) throw Error("Local results could not be read.");
      A.bench = await response.json();
      $("bench-content").hidden = false;
      b.hidden = true;
      renderBench();
    } catch (e) {
      b.disabled = false;
      b.textContent = "Try loading again";
      notify(e.message, true);
    }
  };
  ["preset", "model", "layout", "transform"].forEach(
    (k) => ($("bench-" + k).onchange = renderBench),
  );

  $("view-guide").innerHTML =
    heading(
      "Rho / Reference",
      "Methods and assumptions",
      "Equations and assumptions for the methods used in these experiments.",
    ) +
    `
    <div class="notice">The common convention is gradient = (1/n) Σ Aᵢ ∇ log π(outputᵢ). PPO adds clipped multi-epoch updates; TRPO adds a Fisher-based step and KL line search. Sequence-level credit assignment and full LLM training remain outside this lab.</div>
    <label class="guide-jump-label" for="guide-jump">Jump to a method<select id="guide-jump"><option value="">Choose a method</option>${C.methods.map((m) => `<option value="${m.id}">${C.names[m.id]}</option>`).join("")}</select></label><div class="guide-grid">${C.methods.map((m) => `<article class="guide-card" id="reference-${m.id}" tabindex="-1" style="--series:${color(m.id)}"><div class="method-label"><h2>${C.names[m.id]}</h2><a href="${m.url}" target="_blank" rel="noreferrer">${m.source} ↗</a></div><div class="method-details"><div class="formula">${C.formulas[m.id]}</div><dl><dt>Target</dt><dd>${m.target}</dd><dt>Reward transformations</dt><dd>${m.effect}</dd><dt>Edge cases</dt><dd>${m.edge}</dd></dl></div></article>`).join("")}</div>
    <section class="surface explainer"><h2>The binary sanity check</h2><p>With seven failures and one success, the mean-gradient convention gives:</p><div class="table-scroll"><table><thead><tr><th>Method</th><th>Each failure</th><th>Success</th></tr></thead><tbody><tr><td>RLOO</td><td>−1/7</td><td>1</td></tr><tr><td>GRPO</td><td>−1/√7</td><td>√7</td></tr><tr><td>MaxRL</td><td>−1</td><td>7</td></tr><tr><td>Centered TailRL</td><td>−1</td><td>7</td></tr></tbody></table></div><p>A deterministic increasing map on binary rewards still has only two levels. With a group of two, centered TailRL and RLOO have the same weights for arbitrary reward values under this convention.</p></section>
    <section style="margin-top:30px"><h2>Questions behind the charts</h2>${C.questions.map((q) => `<details class="question"><summary>${q[0]}</summary><p>${q[1]}</p></details>`).join("")}</section>
    <section class="surface explainer"><h2>Reward and advantage normalization</h2><p>A z-score changes location and scale. It does not make an arbitrary distribution Gaussian. A fitted quantile transform changes reward gaps using a reference distribution. With discrete masses, ties remain. Box–Cox requires positive inputs; Yeo–Johnson also supports negative inputs, although this lab only uses its nonnegative branch.</p><p>The lab’s power parameters are chosen manually, with endpoint rescaling. Its normal-score maps use tied midranks. These are deliberate illustrative choices, not reproductions of every scikit-learn default.</p><div class="file-actions"><a href="https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.PowerTransformer.html" target="_blank" rel="noreferrer">PowerTransformer documentation ↗</a><a href="https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.QuantileTransformer.html" target="_blank" rel="noreferrer">QuantileTransformer documentation ↗</a></div></section>
    <section class="surface explainer"><h2>What is implemented and checked</h2><p>Each algorithm samples from its own current policy. Random uniforms are shared across methods; once policies differ, those uniforms can select different outputs. The shared and neural policies use actual gradients. All learning charts use untouched true rewards, even when the training judge makes mistakes.</p><p>The numerical checks cover exact finite-batch gradient expectations for RLOO, TailRL, and PKPO; shared and neural derivatives; affine and binary invariances; all-tied batches; and support preservation. These checks verify the toy equations. They do not validate claims about full-scale language-model training.</p><div class="file-actions"><a href="WALKTHROUGH.md" download>Full walkthrough · Markdown</a><a href="core.js" download>Simulation source · JavaScript</a><a href="verify.js" download>Numerical verification source</a></div></section>`;
  $("guide-jump").onchange = (e) => {
    const section = $("reference-" + e.target.value);
    if (section) {
      section.scrollIntoView({ behavior: "instant", block: "start" });
      section.focus({ preventScroll: true });
    }
  };
  let timer;
  new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (A.view === "experiments" && pairResult) renderPair();
    }, 100);
  }).observe($("main"));
  document.addEventListener("reward-lab-view-change", () => {
    if (A.view === "experiments" && pairResult) renderPair();
  });
  A.navigate();
})();
