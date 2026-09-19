/* A finite categorical demonstration. The learning rules live in core.js. */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
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
  const mathOptions = {
    throwOnError: true,
    strict: "error",
    trust: false,
    output: "htmlAndMathml",
  };
  const tex = (source, displayMode = false) =>
    katex.renderToString(source, { ...mathOptions, displayMode });
  function typeset(element) {
    renderMathInElement(element, {
      ...mathOptions,
      delimiters: [
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
      ],
      errorCallback: (_message, error) => {
        throw error;
      },
    });
  }
  const names = LabContent.names,
    order = Object.keys(RhoAlgorithms);
  const chapters = [
    "basics",
    "reinforce",
    "rloo",
    "a2c",
    "ppo",
    "grpo",
    "trpo",
    "maxrl",
    "pkpo",
    "tailrl",
    "elite",
  ];
  const chapterName = (id) => (id === "basics" ? "Start here" : names[id]);
  const defaultMethods = ["grpo", "ppo", "tailrl"];
  const defaults = () => ({
    ...LabConfig.defaults(),
    preset: "bell",
    lr: 0.5,
    evalK: 4,
  });
  let cfg = defaults(),
    selected = defaultMethods.slice(),
    focus = "grpo";
  const playbackPaces = [4800, 2400, 1200, 600, 400, 300];
  let pace = 1200,
    horizon = 100,
    sim,
    shown = 0,
    batches = [null];
  let playing = false,
    phase = "",
    timer = 0,
    scheduled = null,
    pending = false;
  let audioContext,
    audioMaster,
    sounding = false,
    voices = [],
    soundFrame = 0,
    liveScan = null,
    guide = "basics";
  const percent = (x) =>
    x > 0 && x < 0.001 ? "<0.1%" : (100 * x).toFixed(1) + "%";
  const signed = (x, digits = 3) => {
    const rounded = Number(x.toFixed(digits));
    return (rounded > 0 ? "+" : "") + rounded.toFixed(digits);
  };
  const setStatus = (text) => {
    $("status").textContent = text;
  };
  const options = (el, entries) => {
    el.innerHTML = Object.entries(entries)
      .map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`)
      .join("");
  };
  options($("preset"), RewardLab.presets);
  options($("transform"), LabContent.transforms);
  options($("judge"), LabContent.judges);
  options(
    $("algorithm-select"),
    Object.fromEntries(chapters.map((id) => [id, chapterName(id)])),
  );
  $("method-options").innerHTML = order
    .map(
      (id) =>
        `<label><input type="checkbox" name="method" value="${id}">${names[id]}</label>`,
    )
    .join("");
  $("algorithm-links").innerHTML = chapters
    .map(
      (id) =>
        `<a href="#algorithms/${id}" data-algorithm="${id}">${chapterName(id)}</a>`,
    )
    .join("");

  function validateSetup(data) {
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw Error("A setup must be an object.");
    const config = LabConfig.validate(data.cfg || defaults());
    if (
      config.model !== "independent" ||
      config.layout !== "quality" ||
      config.unit
    )
      throw Error(
        "This visualizer uses independent categorical policies and original reward positions.",
      );
    if (config.k > config.n)
      throw Error("Best-of-k must be at most the samples per update.");
    const methods = data.methods || defaultMethods;
    if (
      !Array.isArray(methods) ||
      !methods.length ||
      methods.length > order.length ||
      methods.some((id) => !order.includes(id)) ||
      new Set(methods).size !== methods.length
    )
      throw Error("Choose at least one valid algorithm, with no duplicates.");
    if (
      !playbackPaces.includes(data.pace ?? 1200) ||
      ![25, 100, 300].includes(data.horizon ?? 100)
    )
      throw Error("Invalid playback settings.");
    return {
      cfg: config,
      methods,
      pace: data.pace ?? 1200,
      horizon: data.horizon ?? 100,
      focus: methods.includes(data.focus) ? data.focus : methods[0],
    };
  }
  let startupError = "";
  try {
    const param = new URL(location.href).searchParams.get("setup");
    if (param) {
      if (param.length > 60000) throw Error("Setup link is too long.");
      const valid = validateSetup(JSON.parse(param));
      ({ cfg, pace, horizon, focus } = valid);
      selected = valid.methods;
    }
  } catch (error) {
    startupError = `Could not load this setup: ${error.message} Showing defaults.`;
  }

  const numericFields = [
    "n",
    "lr",
    "seed",
    "k",
    "tailAt",
    "bulkScale",
    "tailScale",
    "jump",
    "lambda",
    "ppoClip",
    "ppoEpochs",
    "trustKL",
    "criticRate",
    "floor",
  ];
  function writeForm() {
    $("preset").value = cfg.preset;
    for (const key of [...numericFields, "transform", "judge"]) {
      const el = $(key);
      if (
        el.tagName === "SELECT" &&
        ![...el.options].some((o) => o.value === String(cfg[key]))
      )
        el.add(new Option(String(cfg[key]), String(cfg[key])));
      el.value = cfg[key];
    }
    updateSpeed();
    $("horizon").value = horizon;
    document.querySelectorAll('[name="method"]').forEach((el) => {
      el.checked = selected.includes(el.value);
    });
    $("settings-error").hidden = true;
    previewMap();
  }
  $("speed-stops").innerHTML = playbackPaces
    .map(
      (ms, index) =>
        `<button data-speed="${index}" aria-label="${1200 / ms}× playback speed" aria-pressed="false">${1200 / ms}×</button>`,
    )
    .join("");
  document.querySelector(".speed-ticks").innerHTML = playbackPaces
    .map(() => "<span></span>")
    .join("");
  function updateSpeed() {
    const index = playbackPaces.indexOf(pace);
    $("speed").value = index;
    const label = `${1200 / pace}×`;
    $("speed-value").textContent = label;
    $("speed").setAttribute("aria-valuetext", label + " playback speed");
    $("speed-reset").disabled = pace === 1200;
    document
      .querySelector(".speed-control")
      .style.setProperty("--speed-fill", `${index * 20}%`);
    $("speed-stops")
      .querySelectorAll("button")
      .forEach((button, i) => {
        button.setAttribute("aria-pressed", String(i === index));
      });
    document.documentElement.style.setProperty(
      "--update-duration",
      Math.min(400, pace / 3) + "ms",
    );
  }
  function setSpeed(index) {
    const previousPace = pace;
    pace = playbackPaces[index];
    updateSpeed();
    if (pace === previousPace) return;
    const task = scheduled;
    let remaining = task
      ? (Math.max(0, task.at - performance.now()) * pace) / previousPace
      : 0;
    if (liveScan) {
      const nextBin = Math.min(
        21,
        liveScan.fromBin +
          Math.ceil(
            (Math.max(0, audioContext.currentTime - liveScan.start) *
              liveScan.rate) /
              RhoAudio.slot,
          ),
      );
      remaining = playDistribution(false, true, nextBin);
    }
    if (task) schedule(task.callback, remaining);
    history.replaceState(null, "", location.pathname + location.hash);
  }
  $("speed").oninput = () => setSpeed(Number($("speed").value));
  $("speed-stops").onclick = (event) => {
    const button = event.target.closest("[data-speed]");
    if (button) setSpeed(Number(button.dataset.speed));
  };
  $("speed-reset").onclick = () => setSpeed(2);
  function previewMap() {
    const type = $("transform").value;
    $("piecewise-settings").hidden = type !== "hinge";
    $("power-settings").hidden = !["boxcox", "yeojohnson"].includes(type);
    const xs = Array.from({ length: 21 }, (_, i) => i / 20);
    const shape = Object.fromEntries(
      ["tailAt", "bulkScale", "tailScale", "jump"].map((k) => [
        k,
        Number($(k).value),
      ]),
    );
    const values = RewardLab.transform(
      xs,
      type,
      Number($("lambda").value),
      sim?.frozen,
      shape,
    );
    if (values.some((v) => !Number.isFinite(v))) return;
    const lo = Math.min(0, ...values),
      hi = Math.max(...values, lo + 1e-6);
    const x = (r) => 30 + r * 160,
      y = (r) => 108 - ((r - lo) / (hi - lo)) * 85;
    const dependent = ["zscore", "ranknormal"].includes(type);
    const points = xs.map((r, i) => `${x(r)},${y(values[i])}`).join(" ");
    $("map-preview").innerHTML =
      `<svg viewBox="0 0 210 142" role="img" aria-label="Training score as a function of judge score"><path d="M30 15V108H195" fill="none" stroke="var(--axis)"/><text x="2" y="25">${hi.toFixed(1)}</text><text x="2" y="110">${lo.toFixed(1)}</text><text x="28" y="123">0</text><text x="187" y="123">1</text><text x="85" y="140">Judge score →</text>${dependent || (type === "hinge" && shape.jump > 0) ? "" : `<polyline points="${points}" fill="none" stroke="var(--green)" stroke-width="1.5"/>`}${xs.map((r, i) => `<circle cx="${x(r)}" cy="${y(values[i])}" r="2" fill="var(--green)"/>`).join("")}</svg>`;
    $("map-note").textContent =
      `Training score ↑. ${LabContent.transformNotes[type]} ${dependent ? "Preview uses one of each reward; actual scores are refitted to every sampled group. Normal scores do not make the policy Gaussian." : "This maps scores, not probabilities."} MaxRL bypasses this map and thresholds the judge score at 0.9.`;
  }
  function apply(data) {
    const valid = validateSetup(data);
    pause();
    ({ cfg, pace, horizon, focus } = valid);
    selected = valid.methods;
    closeDistribution();
    reset();
    writeForm();
    $("advanced").open = false;
    // A copied setup describes the committed controls, never a half-edited form.
    history.replaceState(null, "", location.pathname + location.hash);
  }
  $("settings").addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const input = { ...cfg };
      for (const key of numericFields) {
        if (!$(key).value.trim()) throw Error(`${key} needs a value.`);
        input[key] = Number($(key).value);
      }
      for (const key of ["transform", "judge"]) input[key] = $(key).value;
      input.preset = $("preset").value;
      input.evalK = input.k;
      apply({
        cfg: input,
        methods: [...document.querySelectorAll('[name="method"]:checked')].map(
          (el) => el.value,
        ),
        focus,
        pace,
        horizon: Number($("horizon").value),
      });
    } catch (error) {
      $("settings-error").textContent = error.message;
      $("settings-error").hidden = false;
      $("settings-error").scrollIntoView({ block: "nearest" });
    }
  });
  $("settings").addEventListener("input", previewMap);
  $("close-advanced").onclick = () => {
    writeForm();
    $("advanced").open = false;
    $("advanced").querySelector("summary").focus();
  };
  $("advanced").addEventListener("toggle", () => {
    if ($("advanced").open) {
      pause();
      closeDistribution();
    } else writeForm();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("advanced").open) $("close-advanced").click();
    if (e.key === "Escape" && !$("distribution-editor").hidden)
      $("cancel-distribution").click();
  });
  $("defaults").onclick = () =>
    apply({ cfg: defaults(), methods: defaultMethods });
  $("preset").onchange = () => {
    if ($("preset").value === "custom") openDistribution();
    else
      apply({
        cfg: { ...cfg, preset: $("preset").value },
        methods: selected,
        pace,
        horizon,
        focus,
      });
  };

  // Keep continuous weights: expanding them into samples would round away rare tails.
  let draftWeights = [],
    activeBin = 10,
    drawnFrom = null;
  const shapeNames = {
    bell: "Bell shaped",
    uniform: "Uniform",
    right: "Right tail",
    bimodal: "Two modes",
    rare: "Rare success",
    missing: "Missing tail",
  };
  $("shape-presets").innerHTML = Object.entries(shapeNames)
    .map(([id, label]) => {
      const p = RewardLab.initial(id),
        peak = Math.max(...p);
      return `<button data-shape="${id}" aria-pressed="false"><svg viewBox="0 0 126 27" aria-hidden="true">${p.map((v, i) => `<rect x="${i * 6}" y="${27 - (v / peak) * 27}" width="4" height="${(v / peak) * 27}"/>`).join("")}</svg>${label}</button>`;
    })
    .join("");
  $("distribution-draw").innerHTML = Array.from(
    { length: 21 },
    (_, i) =>
      `<div role="slider" tabindex="-1" data-draw-bin="${i}" aria-label="Weight at reward ${(i / 20).toFixed(2)}" aria-valuemin="0" aria-valuemax="100" aria-orientation="vertical" aria-describedby="draw-keyboard"><span class="draw-bar"></span></div>`,
  ).join("");
  const drawBars = [...$("distribution-draw").children];
  function renderDistribution() {
    const total = draftWeights.reduce((a, b) => a + b, 0);
    const probabilities = total
      ? RewardLab.normalize(draftWeights.map((w) => w / total + cfg.floor))
      : null;
    drawBars.forEach((bar, i) => {
      const probability = total ? percent(probabilities[i]) : "undefined";
      bar.firstElementChild.style.height = `${draftWeights[i] * 100}%`;
      bar.tabIndex = i === activeBin ? 0 : -1;
      bar.setAttribute(
        "aria-valuenow",
        Number((draftWeights[i] * 100).toFixed(3)),
      );
      bar.setAttribute(
        "aria-valuetext",
        `Relative weight ${Number((draftWeights[i] * 100).toFixed(3))} of 100; probability ${probability}`,
      );
      bar.title = `Reward ${(i / 20).toFixed(2)} · Probability ${probability}`;
    });
    $("draw-reading").textContent = total
      ? `Reward ${(activeBin / 20).toFixed(2)} · Probability ${percent(probabilities[activeBin])}`
      : "Add a bar to begin.";
  }
  function loadShape(weights, preset = "") {
    const peak = Math.max(...weights);
    draftWeights = weights.map((w) => (peak ? w / peak : 0));
    $("shape-presets")
      .querySelectorAll("button")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.shape === preset)),
      );
    $("distribution-error").hidden = true;
    renderDistribution();
  }
  function closeDistribution() {
    $("distribution-editor").hidden = true;
    $("edit-distribution").setAttribute("aria-expanded", "false");
    $("preset").value = cfg.preset;
  }
  function openDistribution() {
    pause();
    $("advanced").open = false;
    $("preset").value = cfg.preset;
    $("distribution-editor").hidden = false;
    $("edit-distribution").setAttribute("aria-expanded", "true");
    $("paste-samples").open = false;
    $("custom").value =
      cfg.preset === "custom" && cfg.customWeights === null ? cfg.custom : "";
    $("draw-floor").hidden = cfg.floor === 0;
    activeBin = 10;
    loadShape(
      RewardLab.initial(cfg.preset, cfg.custom, cfg.customWeights),
      cfg.preset,
    );
    drawBars[activeBin].focus({ preventScroll: true });
    $("distribution-editor").scrollIntoView({ block: "nearest" });
  }
  $("edit-distribution").onclick = () => {
    if ($("distribution-editor").hidden) openDistribution();
    else $("cancel-distribution").click();
  };
  $("cancel-distribution").onclick = () => {
    closeDistribution();
    $("edit-distribution").focus();
  };
  $("shape-presets").onclick = (event) => {
    const button = event.target.closest("button[data-shape]");
    if (button)
      loadShape(RewardLab.initial(button.dataset.shape), button.dataset.shape);
  };
  $("clear-distribution").onclick = () => loadShape(Array(21).fill(0));
  function distributionError(error) {
    $("distribution-error").textContent = error.message;
    $("distribution-error").hidden = false;
  }
  $("load-samples").onclick = () => {
    try {
      const parsed = LabConfig.validate({
        preset: "custom",
        custom: $("custom").value,
      });
      loadShape(RewardLab.initial("custom", parsed.custom));
      $("paste-samples").open = false;
      drawBars[activeBin].focus();
    } catch (error) {
      distributionError(error);
    }
  };
  $("apply-distribution").onclick = () => {
    try {
      if (!draftWeights.some((w) => w > 0))
        throw Error("Add a bar or choose a shape first.");
      apply({
        cfg: { ...cfg, preset: "custom", customWeights: draftWeights.slice() },
        methods: selected,
        pace,
        horizon,
        focus,
      });
      $("play").focus();
    } catch (error) {
      distributionError(error);
    }
  };
  function editedDistribution() {
    $("shape-presets")
      .querySelectorAll("button")
      .forEach((b) => b.setAttribute("aria-pressed", "false"));
    $("distribution-error").hidden = true;
    renderDistribution();
  }
  function drawAt(event) {
    const box = $("distribution-draw").getBoundingClientRect();
    const bin = Math.max(
      0,
      Math.min(20, Math.floor(((event.clientX - box.left) / box.width) * 21)),
    );
    const weight = Math.max(
      0,
      Math.min(1, (box.bottom - event.clientY) / box.height),
    );
    if (drawnFrom && drawnFrom.bin !== bin) {
      const lo = Math.min(drawnFrom.bin, bin),
        hi = Math.max(drawnFrom.bin, bin);
      for (let i = lo; i <= hi; i++)
        draftWeights[i] =
          drawnFrom.weight +
          ((weight - drawnFrom.weight) * (i - drawnFrom.bin)) /
            (bin - drawnFrom.bin);
    } else draftWeights[bin] = weight;
    activeBin = bin;
    drawnFrom = { bin, weight };
    editedDistribution();
    drawBars[bin].focus({ preventScroll: true });
  }
  $("distribution-draw").onpointerdown = (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    $("distribution-draw").setPointerCapture(event.pointerId);
    drawnFrom = null;
    drawAt(event);
  };
  $("distribution-draw").onpointermove = (event) => {
    if ($("distribution-draw").hasPointerCapture(event.pointerId))
      drawAt(event);
  };
  $("distribution-draw").onpointerup = $("distribution-draw").onpointercancel =
    (event) => {
      if ($("distribution-draw").hasPointerCapture(event.pointerId))
        $("distribution-draw").releasePointerCapture(event.pointerId);
      drawnFrom = null;
    };
  drawBars.forEach((bar, i) => {
    bar.onfocus = () => {
      activeBin = i;
      renderDistribution();
    };
    bar.onkeydown = (event) => {
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        drawBars[
          Math.max(0, Math.min(20, i + (event.key === "ArrowRight" ? 1 : -1)))
        ].focus();
        return;
      }
      draftWeights[i] =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? 1
            : Math.max(
                0,
                Math.min(
                  1,
                  draftWeights[i] +
                    (event.shiftKey ? 0.1 : 0.01) *
                      (event.key === "ArrowUp" ? 1 : -1),
                ),
              );
      editedDistribution();
    };
  });

  const plotX = (i) => 38 + i * 14,
    plotY = (p) => 202 - 170 * p;
  function plotMarkup(id) {
    return `<svg class="reward-plot" viewBox="0 0 338 240" role="img" aria-label="${names[id]} outcome probabilities, zero to one hundred percent"><text x="4" y="17">Probability</text>${[0, 0.5, 1].map((v) => `<path class="gridline" d="M32 ${plotY(v)}H328"/><text x="2" y="${plotY(v) + 3}">${100 * v}%</text>`).join("")}${sim.base.map((p, i) => `<rect class="initial-bar" x="${plotX(i) - 6}" y="${plotY(p)}" width="12" height="${p * 170}"/><rect class="bar" data-bin="${i}" x="${plotX(i) - 4}" y="${plotY(p)}" width="8" height="${p * 170}"><title></title></rect>`).join("")}<line class="sound-cursor" y1="28" y2="203" style="display:none" aria-hidden="true"/><path class="axisline" d="M32 202H328"/>${[0, 10, 20].map((i) => `<text text-anchor="middle" x="${plotX(i)}" y="218">${i / 20}</text>`).join("")}<text text-anchor="middle" x="180" y="237">Original reward →</text></svg>`;
  }
  function buildCards() {
    $("comparison").dataset.count = selected.length;
    $("comparison").innerHTML = selected
      .map(
        (id) =>
          `<article class="algorithm-card" data-method="${id}" style="--series:var(--${id})"><div class="card-heading"><h2><button class="select-method" aria-label="Inspect ${names[id]} update">${names[id]}</button></h2><a href="#algorithms/${id}">Read ↗</a></div><p class="card-tag">${RhoAlgorithms[id].short}</p>${plotMarkup(id)}<div class="card-metrics">${[
            [
              "mean",
              "Mean reward",
              "Exact expected original reward under the displayed policy.",
            ],
            [
              "high",
              "P(reward ≥ 0.9)",
              "Exact probability of original reward at least 0.9; not the judge’s success rate.",
            ],
            [
              "best",
              `Expected best of ${cfg.evalK}`,
              `Exact expected maximum original reward of ${cfg.evalK} independent draws, assuming an oracle selects the best.`,
            ],
          ]
            .map(
              ([key, label, definition]) =>
                `<div title="${esc(definition)}"><span>${label}</span><b data-metric="${key}"></b><small data-change="${key}"></small></div>`,
            )
            .join("")}</div><p class="card-observation"></p></article>`,
      )
      .join("");
    document.querySelectorAll(".algorithm-card").forEach((card) =>
      card.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        if (sounding) pause();
        focus = card.dataset.method;
        render();
        playDistribution();
      }),
    );
  }
  function currentBatch() {
    return batches[pending ? sim.step : shown]?.[focus];
  }
  function renderInspector() {
    $("inspect-name").textContent = names[focus];
    const b = currentBatch();
    if (!b) {
      $("batch-summary").textContent =
        "Complete one update to see the actual sampled rewards and their weights.";
      $("batch-rows").innerHTML = "";
      return;
    }
    let diagnostics = "";
    if (b.clipped !== undefined)
      diagnostics = ` Clipped-gradient fraction (peak over ${b.epochs} epochs): ${percent(b.clipped)}. This counts nonzero-advantage samples on the flat side of the surrogate before an epoch’s step. KL(old ∥ new): ${b.kl.toFixed(5)}.`;
    if (b.accepted !== undefined)
      diagnostics = ` TRPO step ${b.accepted ? "accepted" : "rejected"}; KL(old ∥ new): ${b.kl.toFixed(5)}.`;
    if (b.baseline !== undefined)
      diagnostics += ` Baseline before update: ${b.baseline.toFixed(3)}.`;
    $("batch-summary").textContent =
      `${names[focus]}, update ${pending ? sim.step : shown}. ${b.raw.length} samples, with replacement.${diagnostics}${focus === "maxrl" ? " Training scores are binary success labels; the reward map is bypassed." : ""} Weights affect gradients; they are not probabilities.`;
    $("batch-rows").innerHTML = b.raw
      .map(
        (r, i) =>
          `<tr><td>${i + 1}</td><td>${r.toFixed(2)}</td><td>${b.judged[i].toFixed(3)}</td><td>${b.transformed[i].toFixed(3)}</td><td>${signed(b.adv[i])}</td></tr>`,
      )
      .join("");
  }
  function renderCurves() {
    const plot = RhoCurves.data(sim.history, selected, $("curve-metric").value, shown, horizon);
    $("curve-chart").innerHTML = RhoCurves.svg(plot, names);
    $("curve-values").innerHTML = plot.series.map(s => `<span style="--series:var(--${s.id})"><i></i>${names[s.id]} <b>${s.points.at(-1).value.toFixed(3)}</b></span>`).join("");
  }
  $("curve-metric").onchange = renderCurves;
  function render() {
    const frame = sim.history[shown];
    for (const card of document.querySelectorAll(".algorithm-card")) {
      const id = card.dataset.method,
        state = frame.methods[id],
        start = sim.history[0].methods[id].metrics;
      card.dataset.selected = String(id === focus);
      card
        .querySelector(".select-method")
        .setAttribute("aria-pressed", String(id === focus));
      const batch = batches[pending ? sim.step : shown]?.[id];
      card.querySelectorAll(".bar").forEach((bar, i) => {
        const p = state.p[i];
        bar.setAttribute("y", plotY(p));
        bar.setAttribute("height", p * 170);
        bar.classList.toggle("sampled", pending && batch.ids.includes(i));
        bar.querySelector("title").textContent =
          `Reward ${(i / 20).toFixed(2)}: ${percent(p)}; start ${percent(sim.base[i])}`;
      });
      for (const key of ["mean", "high", "best"]) {
        const m = state.metrics[key],
          delta = m - start[key];
        card.querySelector(`[data-metric="${key}"]`).textContent =
          key === "high" ? percent(m) : m.toFixed(3);
        card.querySelector(`[data-change="${key}"]`).textContent =
          shown === 0
            ? "at start"
            : `${signed(key === "high" ? delta * 100 : delta, key === "high" ? 1 : 3)}${key === "high" ? " pp" : ""} from start`;
      }
      let observation = `Below 0.3: ${percent(state.metrics.bad)} · Middle [0.3, 0.9): ${percent(state.metrics.middle)}`;
      if (pending && phase === "weight")
        observation = `Sample weights: ${signed(Math.min(...batch.adv))} to ${signed(Math.max(...batch.adv))}`;
      else if (batch && batch.adv.every((a) => Math.abs(a) < 1e-12))
        observation = "This group has zero weights. No policy update.";
      card.querySelector(".card-observation").textContent = observation;
    }
    $("step-count").textContent = `Update ${shown}`;
    $("replay").max = horizon;
    $("replay").value = shown;
    $("replay").disabled = sim.step === 0 || pending;
    $("run-end").textContent = horizon;
    $("play").textContent = playing
      ? "Ⅱ Pause"
      : shown < sim.step
        ? "▶ Replay"
        : sim.step >= horizon
          ? "↻ Replay"
          : "▶ Play";
    $("previous").disabled = shown === 0;
    $("step").disabled = pending || (shown >= horizon && shown === sim.step);
    document.querySelectorAll("[data-phase]").forEach((el) => {
      el.classList.toggle("active", el.dataset.phase === phase);
    });
    $("sound-panel").hidden = !sounding;
    $("sound-method").textContent = names[focus];
    $("sound-key").hidden = !sounding;
    $("sound-key").textContent =
      `${names[focus]} sound: taller bars → higher, louder notes. The scan moves from reward 0 to 1; zero bars are silent. Start → Current uses the same scales for both.`;
    renderInspector();
    renderCurves();
  }
  function silence() {
    cancelAnimationFrame(soundFrame);
    soundFrame = 0;
    liveScan = null;
    $("listen-current").textContent = "Listen";
    $("listen-compare").setAttribute("aria-pressed", "false");
    $("sound-reading").textContent = "";
    document.querySelectorAll(".sound-cursor").forEach((line) => {
      line.style.display = "none";
    });
    document
      .querySelectorAll(".reward-plot .sounding")
      .forEach((bar) => bar.classList.remove("sounding"));
    for (const { oscillator, gain } of voices) {
      try {
        const now = audioContext.currentTime;
        if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(now);
        else {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(0, now);
        }
        gain.gain.linearRampToValueAtTime(0, now + 0.015);
        oscillator.stop(now + 0.02);
      } catch {}
    }
    voices = [];
  }
  function playDistribution(compare = false, auto = false, fromBin = 0) {
    if (!sounding || !audioContext || document.hidden || $("visualizer").hidden)
      return 0;
    silence();
    const current = sim.history[shown].methods[focus].p;
    if (fromBin >= current.length) return 0;
    const { rate, slot, scanTime, lead } = RhoAudio.playbackTiming(pace, auto, fromBin);
    const segments = compare
      ? [
          {
            p: sim.base,
            at: 0,
            label: "Start distribution",
            selector: ".initial-bar",
          },
          {
            p: current,
            at: scanTime + 0.45 / rate,
            label: `Current · update ${shown}`,
            selector: ".bar",
          },
        ]
      : [
          {
            p: current,
            at: 0,
            label: `Current · update ${shown}`,
            selector: ".bar",
          },
        ];
    const start = audioContext.currentTime + lead;
    if (auto) liveScan = { start, rate, fromBin };
    const card = document.querySelector(`[data-method="${focus}"]`);
    const cursor = card.querySelector(".sound-cursor");
    const end = segments.at(-1).at + scanTime;
    for (const segment of segments)
      voices.push(
        ...RhoAudio.schedule(
          audioContext,
          segment.p.map((p, i) => (i >= fromBin ? p : 0)),
          start + segment.at - fromBin * slot,
          audioMaster,
          rate,
        ),
      );
    $("listen-current").textContent = "Stop";
    $("listen-compare").setAttribute("aria-pressed", String(compare));
    let previous = "",
      highlighted;
    function followAudio() {
      const elapsed = audioContext.currentTime - start;
      if (elapsed >= end) {
        silence();
        return;
      }
      const segment = segments.find(
        (s) => elapsed >= s.at && elapsed < s.at + scanTime,
      );
      const bin = segment
        ? fromBin + Math.floor((elapsed - segment.at) / slot)
        : -1;
      const key = segment ? `${segment.at}:${bin}` : "gap";
      if (key !== previous) {
        highlighted?.classList.remove("sounding");
        cursor.style.display = bin < 0 ? "none" : "";
        if (segment) {
          cursor.setAttribute("x1", plotX(bin));
          cursor.setAttribute("x2", plotX(bin));
          highlighted = card.querySelectorAll(segment.selector)[bin];
          if (segment.p[bin] > 0) highlighted.classList.add("sounding");
          if (!previous.startsWith(`${segment.at}:`))
            $("sound-reading").textContent = segment.label;
        } else if (elapsed >= 0)
          $("sound-reading").textContent = "Start → Current";
        previous = key;
      }
      soundFrame = requestAnimationFrame(followAudio);
    }
    soundFrame = requestAnimationFrame(followAudio);
    return (lead + end + 0.02) * 1000;
  }
  $("listen-current").onclick = () => {
    const wasListening = soundFrame !== 0;
    pause();
    if (!wasListening) playDistribution();
  };
  $("listen-compare").onclick = () => {
    pause();
    playDistribution(true);
  };
  $("volume").oninput = () => {
    if (audioMaster)
      audioMaster.gain.setTargetAtTime(
        Number($("volume").value),
        audioContext.currentTime,
        0.02,
      );
  };
  async function prepareAudio() {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (!audioMaster) {
      audioMaster = audioContext.createGain();
      audioMaster.gain.value = Number($("volume").value);
      audioMaster.connect(audioContext.destination);
    }
    await audioContext.resume();
    if (audioContext.state !== "running") throw Error("Audio could not start.");
  }
  $("sound").onclick = async () => {
    sounding = !sounding;
    if (!sounding) silence();
    else {
      try {
        await prepareAudio();
      } catch {
        sounding = false;
        setStatus(
          "Audio is unavailable in this browser. The visualizer still works.",
        );
      }
    }
    $("sound").setAttribute("aria-pressed", String(sounding));
    $("sound").textContent = sounding ? "Sound on" : "Sound off";
    render();
    if (sounding) playDistribution();
  };
  function schedule(callback, delay) {
    clearTimeout(timer);
    scheduled = { callback, at: performance.now() + delay };
    timer = setTimeout(() => {
      scheduled = null;
      callback();
    }, delay);
  }
  function finishUpdate(audible = true) {
    pending = false;
    shown = sim.step;
    phase = "update";
    render();
    setStatus(
      `Update ${shown}: policy update complete. Original rewards stayed fixed.${shown === horizon ? " Run complete; drag the timeline to replay." : ""}`,
    );
    return audible ? playDistribution(false, true) : 0;
  }
  function pause() {
    clearTimeout(timer);
    scheduled = null;
    playing = false;
    silence();
    if (pending) finishUpdate(false);
    if (sim) render();
  }
  function advance() {
    if (!playing) return;
    if (shown < sim.step) {
      shown++;
      phase = "update";
      render();
      setStatus(`Replaying recorded update ${shown}.`);
      const listenTime = playDistribution(false, true);
      if (shown === horizon) {
        schedule(pause, listenTime);
        return;
      }
      schedule(advance, Math.max(pace, listenTime));
      return;
    }
    if (sim.step >= horizon) {
      pause();
      return;
    }
    RewardLab.step(sim);
    batches.push({ ...sim.last });
    pending = true;
    phase = "sample";
    render();
    setStatus(
      `Update ${sim.step}: sample ${cfg.n} outcomes from each current policy. Outlined bars were sampled.`,
    );
    schedule(() => {
      phase = "weight";
      render();
      setStatus(
        `Update ${sim.step}: assign each sampled outcome an algorithm-specific weight. Open “Inside one update” to inspect it.`,
      );
      schedule(() => {
        const listenTime = finishUpdate();
        if (shown === horizon) {
          schedule(pause, listenTime);
        } else schedule(advance, Math.max(pace / 3, listenTime));
      }, pace / 3);
    }, pace / 3);
  }
  $("play").onclick = () => {
    if (playing) {
      pause();
      return;
    }
    silence();
    if (shown === horizon) shown = 0;
    playing = true;
    advance();
  };
  $("step").onclick = () => {
    pause();
    if (shown < sim.step) {
      shown++;
      phase = "update";
      render();
      setStatus(`Recorded update ${shown}.`);
      playDistribution(false, true);
    } else if (sim.step < horizon) {
      RewardLab.step(sim);
      batches.push({ ...sim.last });
      finishUpdate();
    }
  };
  $("reset").onclick = () => reset();
  function replayTo(requested, audible = false) {
    pause();
    shown = Math.max(0, Math.min(requested, sim.step));
    phase = "";
    render();
    setStatus(
      `Recorded update ${shown} of ${sim.step}. Play replays these states, then continues the run.`,
    );
    if (audible) playDistribution(false, true);
  }
  $("previous").onclick = () => replayTo(shown - 1, true);
  $("replay").oninput = () => replayTo(Number($("replay").value));
  $("replay").onchange = () => playDistribution();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  function reset() {
    pause();
    sim = RewardLab.create(cfg);
    batches = [null];
    shown = 0;
    phase = "";
    buildCards();
    render();
    setStatus(
      `${cfg.floor > 0 ? "Starting probabilities include initial support smoothing." : LabContent.presetNotes[cfg.preset]} Press Play or Next step to begin.`,
    );
  }

  function clipWidget() {
    return `<h3>What clipping does</h3><p>For one sampled outcome, compare the plain ratio term with the clipped surrogate. The advantage stays fixed during these epochs. Clipping acts on this objective, not on the reward.</p><div class="clip-controls"><label>Advantage<select id="clip-sign"><option value="1">Positive · A = +1</option><option value="-1">Negative · A = −1</option></select></label><label><span>Probability ratio \\(q\\): <output id="ratio-value">1.40</output></span><input id="clip-ratio" type="range" min="0" max="2" step="0.01" value="1.4"></label><label><span>Clip width \\(\\epsilon\\): <output id="epsilon-value">0.20</output></span><input id="clip-epsilon" type="range" min="0.05" max="0.5" step="0.01" value="0.2"></label></div><svg id="clip-figure" viewBox="0 0 640 225" role="img" aria-label="Plain ratio term and clipped surrogate for one sample"></svg><p id="clip-reading"></p>`;
  }
  function renderClip() {
    const a = Number($("clip-sign").value),
      q = Number($("clip-ratio").value),
      e = Number($("clip-epsilon").value);
    const value = (r) =>
      Math.min(r * a, Math.max(1 - e, Math.min(1 + e, r)) * a);
    const x = (r) => 50 + 270 * r,
      y = (v) => (a > 0 ? 182 - 70 * v : 42 - 70 * v);
    const clipped = a > 0 ? q > 1 + e : q < 1 - e;
    const boundary = Math.abs(q - (a > 0 ? 1 + e : 1 - e)) < 1e-9;
    $("ratio-value").textContent = q.toFixed(2);
    $("epsilon-value").textContent = e.toFixed(2);
    $("clip-figure").innerHTML =
      `<rect x="${x(1 - e)}" y="26" width="${540 * e}" height="163" fill="var(--soft)"/><path d="M50 ${y(0)}H600" stroke="var(--axis)"/>${[0, 1, 2].map((r) => `<text x="${x(r)}" y="205" text-anchor="middle" fill="var(--muted)" font-size="12">${r}</text>`).join("")}<text x="330" y="222" text-anchor="middle" fill="var(--muted)" font-size="11">Probability ratio q</text><text x="18" y="${y(0) + 4}" fill="var(--muted)" font-size="11">0</text><text x="14" y="${y(2 * a) + 4}" fill="var(--muted)" font-size="11">${2 * a}</text><path d="M${x(0)} ${y(0)}L${x(2)} ${y(2 * a)}" stroke="var(--axis)" stroke-width="2" stroke-dasharray="5 4"/><polyline points="${Array.from({ length: 201 }, (_, i) => `${x(i / 100)},${y(value(i / 100))}`).join(" ")}" fill="none" stroke="var(--green)" stroke-width="3"/><circle cx="${x(q)}" cy="${y(value(q))}" r="5" fill="var(--green)"/><text x="425" y="18" font-size="11" fill="var(--muted)">Dashed: qA · Solid: clipped</text>`;
    $("clip-reading").innerHTML =
      `At ${tex("q = " + q.toFixed(2))}, the surrogate is ${value(q).toFixed(2)}. ${boundary ? "This is a corner of the surrogate; its slope changes here." : clipped ? "The slope is zero for this sample: pushing farther in this direction adds no objective gain." : `This sample still has slope ${a > 0 ? "+1" : "−1"}.`} The flat side switches for negative advantages. Other samples can still move this probability.`;
  }
  function bindWorked() {
    let stage = 0;
    const n = 3,
      baseline = 0.4,
      k = 2;
    const settings = {
      lr: 0.5,
      unit: false,
      ppoEpochs: 4,
      ppoClip: 0.2,
      trustKL: 0.01,
      criticRate: 0.1,
    };
    const groups = {
      mixed: [0.2, 0.5, 1],
      binary: [0, 0, 1],
      tied: [0.5, 0.5, 0.5],
      success: [1, 1, 1],
    };
    const fmt = (v) =>
      Math.abs(v) < 0.0005 ? "0" : String(Number(v.toFixed(3)));
    const inline = (source) => tex(source);
    function draw() {
      const raw = groups[$("lesson-group").value],
        map = $("lesson-map").value;
      const scores =
        guide === "maxrl"
          ? raw.map((r) => Number(r >= 0.9))
          : RewardLab.transform(raw, map);
      const weights = RewardLab.advantage(scores, guide, k, baseline);
      // Condition on one draw of each supported answer; use the existing optimizers.
      const model = RewardLab.create({
        preset: "custom",
        custom: "0.2,0.5,1",
        model: "independent",
      }).models[guide];
      const ids = [4, 10, 20],
        before = RewardLab.forward(model);
      const grad = before.map((p) => -p * RewardLab.mean(weights));
      ids.forEach((id, i) => (grad[id] += weights[i] / n));
      const diagnostics = ["ppo", "grpo"].includes(guide)
        ? RewardLab.ppoUpdate(model, before, ids, weights, settings)
        : guide === "trpo"
          ? RewardLab.trpoUpdate(model, before, ids, weights, settings)
          : { norm: RewardLab.update(model, grad, settings.lr) };
      const after = RewardLab.forward(model),
        mean = RewardLab.mean(scores);
      const sigma = Math.sqrt(
        RewardLab.mean(scores.map((v) => (v - mean) ** 2)),
      );
      $("lesson-settings").textContent =
        guide === "trpo"
          ? "Independent logits · KL budget 0.01. The shared learning rate is not used."
          : `Independent logits · learning rate 0.5${["ppo", "grpo"].includes(guide) ? " · 4 epochs · clip width 0.2" : " · one gradient step"}${["a2c", "ppo"].includes(guide) ? " · starting critic 0.4" : ""}${guide === "pkpo" ? " · k = 2" : ""}.`;
      $("lesson-stage").textContent =
        `${stage + 1} / 3 · ${["Score the answers", "Compute the weights", "Update the probabilities"][stage]}`;
      $("lesson-score-heading").textContent =
        stage === 0
          ? "Score"
          : guide === "maxrl"
            ? "Success"
            : "Training score";
      $("lesson-rows").innerHTML = ids
        .map((id, i) => {
          const p = stage === 2 ? after[id] : before[id],
            delta = p - before[id];
          return `<tr><th scope="row">${["A", "B", "C"][i]}</th><td class="lesson-score">${fmt(stage === 0 ? raw[i] : scores[i])}</td><td class="lesson-weight">${stage > 0 ? fmt(weights[i]) : "—"}</td><td><span class="lesson-probability">${(100 * p).toFixed(1)}%</span><span class="probability-track" aria-hidden="true"><span style="width:${100 * p}%"></span></span>${stage === 2 ? `<small class="probability-change">${Math.abs(delta) < 0.0005 ? "unchanged" : `${delta > 0 ? "+" : "−"}${(100 * Math.abs(delta)).toFixed(1)} pp`}</small>` : ""}</td></tr>`;
        })
        .join("");
      let explanation;
      if (stage === 0) {
        explanation =
          "These are three distinct answers, with scores assigned by a checker. No learning has happened yet. Each answer still has a one-third chance. Next, the selected method turns the training scores into weights.";
        if (guide === "maxrl")
          explanation +=
            " MaxRL first turns these scores into pass/fail labels at 0.9; the selected continuous reward map is bypassed.";
        else if (map !== "identity")
          explanation += ` The ${map === "square" ? "square" : "2r + 1"} map will change the training scores before weights are computed.`;
      } else if (stage === 1) {
        const last = fmt(scores[2]);
        switch (guide) {
          case "reinforce":
            explanation =
              "Each weight is the training score itself. There is no baseline. The weights scale the sampled answers’ log-probability gradients; the next step will combine all three contributions.";
            break;
          case "rloo":
          case "trpo":
            explanation = `For C, the other two scores average ${inline(String.raw`(${fmt(scores[0])}+${fmt(scores[1])})/2=${fmt((scores[0] + scores[1]) / 2)}`)}. Subtract that baseline: ${inline(String.raw`A_C=${last}-${fmt((scores[0] + scores[1]) / 2)}=${fmt(weights[2])}`)}. Repeat while leaving out A, then B.${guide === "trpo" ? " This app uses RLOO weights to supply TRPO’s advantages; the trust-region operation comes next." : ""}`;
            break;
          case "grpo":
            explanation =
              sigma === 0
                ? "All scores agree. The standard deviation is zero, so this implementation explicitly sets every advantage to zero. No division by zero is performed."
                : `The mean is ${inline(String.raw`\mu=${fmt(mean)}`)} and the standard deviation is ${inline(String.raw`\sigma=${fmt(sigma)}`)}. For C, ${inline(String.raw`A_C=\frac{${last}-${fmt(mean)}}{${fmt(sigma)}}\approx ${fmt(weights[2])}`)}. The small numerical stabilizer is included in the computed table. These advantages stay fixed during the clipped epochs.`;
            break;
          case "ppo":
          case "a2c":
            explanation = `Subtract the starting critic value 0.4 from each training score. C gets ${inline(String.raw`A_C=${last}-0.4=${fmt(weights[2])}`)}. The critic is updated only after the actor uses these weights.${guide === "ppo" ? " The old probabilities and advantages then stay fixed across all four epochs." : ""}`;
            break;
          case "maxrl":
            explanation =
              mean === 0
                ? "Every label is a failure. The success rate is zero, so this implementation skips the group and uses zero weights. A continuous score improvement below 0.9 cannot change that."
                : `The success fraction is ${inline(String.raw`\widehat p=${fmt(mean)}`)}. Subtract it from each binary label, then divide by it. C gets ${inline(String.raw`A_C=\frac{${last}-${fmt(mean)}}{${fmt(mean)}}\approx ${fmt(weights[2])}`)}. The reward map is bypassed.${mean === 1 ? " With all successes, every centered weight is zero." : ""}`;
            break;
          case "pkpo":
            explanation = `With k = 2, each partner set contains just one of the other answers. For C, average its nonnegative improvement over A and B, then multiply by 2: ${inline(String.raw`A_C=(${last}-${fmt(scores[0])})_++(${last}-${fmt(scores[1])})_+=${fmt(weights[2])}`)}. Repeat for the other answers. A zero weight means no marginal gain for these partner sets.`;
            break;
          case "tailrl": {
            const sorted = scores.slice().sort((a, b) => a - b),
              first = (sorted[1] - sorted[0]) / 2,
              second = sorted[2] - sorted[1];
            explanation = `For these sorted scores, the first gap is ${fmt(sorted[1] - sorted[0])}, shared by two surviving answers; the next is ${fmt(second)}, with one survivor. Accumulated values are ${inline(`[0,${fmt(first)},${fmt(first + second)}]`)}. Subtract their mean and multiply by 3 to get the table’s weights. Ties add zero gaps. With this mean-gradient convention, three samples represent finite order T = 2.`;
            break;
          }
          case "elite":
            explanation = scores.every((x) => x === scores[0])
              ? "All answers tie. This implementation skips an all-tied group, so no answer gets an arbitrary advantage."
              : `The top 20% of three samples selects the highest-scoring answer, including any cutoff ties. Each selected sample receives ${inline(String.raw`3/|\mathcal E|`)}; the rest get zero. The group average is therefore a likelihood update on the selected answers.`;
            break;
        }
      } else {
        explanation =
          "The table now shows probabilities after the update. Scores stayed fixed. The new probabilities come from updated logits and softmax; they are not normalized versions of the weight column. “pp” means percentage points of probability.";
        if (["ppo", "grpo"].includes(guide))
          explanation += ` Four clipped epochs reused this group. The peak fraction of samples whose surrogate gradient was clipped to zero was ${(100 * diagnostics.clipped).toFixed(0)}%; the resulting KL(old ∥ new) is ${fmt(diagnostics.kl)}.`;
        else if (guide === "trpo")
          explanation += ` The proposal was ${diagnostics.accepted ? "accepted" : "not accepted"}. Measured KL is ${diagnostics.kl.toFixed(5)} against a budget of 0.01. ${diagnostics.accepted ? `Accepted after ${diagnostics.backtracks} step-size reductions.` : "No improving direction or acceptable candidate was found."}`;
        else
          explanation += ` All three weight contributions were combined in one gradient step. A positive weight alone does not guarantee a probability increase.`;
        if (["a2c", "ppo"].includes(guide))
          explanation += ` The critic then moves from 0.4 to ${fmt(baseline + settings.criticRate * (mean - baseline))}, using a critic learning rate of 0.1.`;
        if (Math.max(...scores) === Math.min(...scores))
          explanation +=
            " This balanced group has one of each equally likely answer, so constant weights cancel exactly. Random groups in the main visualizer need not be balanced.";
      }
      $("lesson-explanation").innerHTML = `<p>${explanation}</p>`;
      $("lesson-previous").disabled = stage === 0;
      $("lesson-next").disabled = stage === 2;
    }
    $("lesson-previous").onclick = () => {
      stage = Math.max(0, stage - 1);
      draw();
    };
    $("lesson-next").onclick = () => {
      stage = Math.min(2, stage + 1);
      draw();
    };
    for (const id of ["lesson-group", "lesson-map"])
      $(id).onchange = () => {
        stage = 0;
        draw();
      };
    draw();
  }

  function renderGuide() {
    $("algorithm-select").value = guide;
    document
      .querySelectorAll("[data-algorithm]")
      .forEach((el) =>
        el.setAttribute("aria-current", String(el.dataset.algorithm === guide)),
      );
    const pos = chapters.indexOf(guide),
      prev = chapters[pos - 1],
      next = chapters[pos + 1];
    const readingNav = `<nav class="reading-nav" aria-label="Continue reading">${prev ? `<a href="#algorithms/${prev}">← ${chapterName(prev)}</a>` : "<span></span>"}${next ? `<a href="#algorithms/${next}">Next: ${chapterName(next)} →</a>` : `<a href="#visualizer">Open visualizer →</a>`}</nav>`;
    if (guide === "basics") {
      $("algorithm-article").innerHTML =
        $("basics-template").innerHTML + readingNav;
      typeset($("algorithm-article"));
      return;
    }
    const data = RhoAlgorithms[guide],
      source = LabContent.methods.find((m) => m.id === guide);
    const paragraphs = (list) => list.map((p) => `<p>${esc(p)}</p>`).join("");
    const clippedUpdate =
      guide === "grpo"
        ? `<small>These advantages enter the clipped update below. \\(q_i\\) is current probability / rollout probability; \\(\\widetilde{q}_i\\) clips it to \\([1-\\epsilon,1+\\epsilon]\\). \\(\\ell_i\\) is one sample’s surrogate and \\(n\\) is group size.</small>${tex(RhoAlgorithms.ppo.equation, true)}`
        : "";
    $("algorithm-article").innerHTML =
      `<h2>${names[guide]}</h2><p class="full-name">${esc(data.name)}</p><p class="guide-lead">${esc(data.lead)}</p>${paragraphs(data.why)}
      <p class="basics-link"><a href="#algorithms/basics">Policy and gradient basics</a></p>
      <h3>Update rule</h3>${paragraphs(data.read)}
      <div class="equation">${tex(data.equation, true)}${clippedUpdate}${data.equationNote ? `<small>${esc(data.equationNote)}</small>` : ""}</div>
      <details class="lesson-detail"><summary>Symbols</summary><dl class="terms">${data.terms.map(([k, v]) => `<dt>${tex(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></details>
      <a class="source-link" href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(data.citation)} ↗</a>
      ${$("worked-template").innerHTML}
      ${data.clipped ? clipWidget() : ""}
      <h3>Changing the reward scale</h3>${paragraphs(data.shaping)}
      <h3>Application to language models</h3><p>${esc(data.transfer)}</p>
      <details class="lesson-detail"><summary>What this implementation includes</summary><p>${esc(data.here)}</p></details>
      <h3>Limitations and experiments</h3><p class="hint">These experiments test the finite setup. They are not reported LLM results from the papers.</p>
      <div class="lesson-cases">${data.cases.map((c, i) => `<section><h4>${esc(c.title)}</h4><p>${esc(c.text)}</p><button ${i === 0 ? 'id="try-example"' : ""} data-case="${i}">Open experiment →</button></section>`).join("")}</div>
      ${readingNav}`;
    typeset($("algorithm-article"));
    bindWorked();
    document.querySelectorAll("[data-case]").forEach(
      (button) =>
        (button.onclick = () => {
          const chosen = data.cases[Number(button.dataset.case)];
          apply({
            cfg: {
              ...defaults(),
              ...chosen.settings,
              evalK: chosen.settings.k || 4,
            },
            methods: data.comparison,
            focus: guide,
          });
          location.hash = "visualizer";
          $("play").focus();
        }),
    );
    if (data.clipped) {
      for (const id of ["clip-sign", "clip-ratio", "clip-epsilon"])
        $(id).oninput = renderClip;
      renderClip();
    }
  }
  function route(event) {
    if (location.hash === "#main") {
      $("main").focus();
      return;
    }
    const parts = location.hash.slice(1).split("/");
    const isGuide = parts[0] === "algorithms";
    if (isGuide) {
      pause();
      guide = chapters.includes(parts[1]) ? parts[1] : guide;
      renderGuide();
    }
    $("visualizer").hidden = isGuide;
    $("algorithms").hidden = !isGuide;
    $("nav-visualizer").toggleAttribute("aria-current", !isGuide);
    $("nav-algorithms").toggleAttribute("aria-current", isGuide);
    (isGuide ? $("nav-algorithms") : $("nav-visualizer")).setAttribute(
      "aria-current",
      "page",
    );
    document.title = isGuide
      ? `${chapterName(guide)} | ρ`
      : "ρ | RL visualizer";
    $("advanced").open = false;
    if (event) {
      window.scrollTo(0, 0);
      $("main").focus({ preventScroll: true });
    }
  }
  $("algorithm-select").onchange = () => {
    location.hash = `algorithms/${$("algorithm-select").value}`;
  };
  window.addEventListener("hashchange", route);
  $("share").onclick = async () => {
    const link = new URL(location.href);
    link.search = "";
    link.hash = "visualizer";
    link.searchParams.set(
      "setup",
      JSON.stringify({ cfg, methods: selected, focus, pace, horizon }),
    );
    try {
      await navigator.clipboard.writeText(link.href);
      setStatus(
        "Setup link copied. It opens these settings at update 0, ready to play.",
      );
    } catch {
      setStatus(
        "Clipboard unavailable. Your setup link is now in the address bar; copy it from there.",
      );
      history.replaceState(null, "", link);
    }
  };
  $("save-image").onclick = async () => {
    pause();
    const button = $("save-image");
    button.disabled = true;
    let sourceURL;
    try {
      const cols = Math.min(3, selected.length),
        rows = Math.ceil(selected.length / cols),
        width = cols * 360 + 60,
        height = rows * 330 + 160;
      const style = getComputedStyle(document.documentElement);
      const palette = (name) => style.getPropertyValue(name).trim();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${palette("--paper")}"/><style>text{font-family:Arial;fill:${palette("--ink")};font-size:12px}.bar{transition:none}</style><text x="30" y="44" style="font:30px Georgia">ρ · Policy updates</text><text x="30" y="70">${esc(RewardLab.presets[cfg.preset])} · ${esc(LabContent.transforms[cfg.transform])} · ${esc(LabContent.judges[cfg.judge])}</text><text x="30" y="92">Update ${shown} · ${cfg.n} samples / update · seed ${cfg.seed} · initial (gray) and current (color)</text>${selected
        .map((id, j) => {
          const p = sim.history[shown].methods[id],
            color = style.getPropertyValue(`--${id}`).trim();
          return `<g transform="translate(${30 + (j % cols) * 360},${120 + Math.floor(j / cols) * 330})"><text x="6" y="20" style="font:23px Georgia;fill:${color}">${names[id]}</text><g transform="translate(0,22)">${plotMarkup(
            id,
          )
            .replace(
              '<svg class="reward-plot"',
              '<svg width="338" height="240" class="reward-plot"',
            )
            .replace(/class="gridline"/g, `stroke="${palette("--grid")}"`)
            .replace(/class="axisline"/g, `stroke="${palette("--axis")}"`)
            .replace(/class="initial-bar"/g, `fill="${palette("--initial")}"`)
            .replace(
              /<rect class="bar"[^>]*><title><\/title><\/rect>/g,
              "",
            )}</g>${p.p.map((v, i) => `<rect x="${plotX(i) - 4}" y="${plotY(v) + 22}" width="8" height="${v * 170}" fill="${color}"/>`).join("")}<text x="6" y="282">Mean ${p.metrics.mean.toFixed(3)} · Reward ≥ 0.9: ${esc(percent(p.metrics.high))}</text><text x="6" y="304">Expected best of ${cfg.evalK}: ${p.metrics.best.toFixed(3)}</text></g>`;
        })
        .join(
          "",
        )}<text x="30" y="${height - 20}" style="font-size:11px">Finite categorical demonstrations · 21 outcomes · not language-model training · ayushnangia.github.io/reward-lab</text></svg>`;
      sourceURL = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml" }),
      );
      const img = new Image();
      img.src = sourceURL;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw Error("Image encoding failed.");
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `rho-update-${shown}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(
        "Image saved with the current distributions and key settings. Use Copy setup link to reproduce the full run.",
      );
    } catch (error) {
      setStatus(`Could not save the image: ${error.message}`);
    } finally {
      if (sourceURL) URL.revokeObjectURL(sourceURL);
      button.disabled = false;
    }
  };
  let videoController, videoURL;
  const videoDialog = $("video-dialog");
  function clearVideo() {
    $("video-preview").pause();
    $("video-preview").removeAttribute("src");
    $("video-preview").load();
    $("video-preview").hidden = true;
    $("video-download").hidden = true;
    $("video-download").removeAttribute("href");
    if (videoURL) URL.revokeObjectURL(videoURL);
    videoURL = null;
  }
  $("export-video").onclick = () => {
    if (videoController) { videoController.abort(); return; }
    const supported = RhoVideo.format() && typeof HTMLCanvasElement.prototype.captureStream === "function";
    $("video-start").disabled = !supported;
    $("video-description").textContent = `Record ${selected.slice().map(id => names[id]).join(", ")} from update ${shown}. All selected algorithms are included. Current sound: ${sounding ? names[focus] : "off"}. Use the website's Play, Listen, policy, speed, and volume controls while recording. Click Stop recording when finished.`;
    $("video-format").textContent = supported ? `${RhoVideo.dimensions(selected.length).width} × ${RhoVideo.dimensions(selected.length).height} · up to 60 fps · ${RhoVideo.format()[1].toUpperCase()}` : "Video recording is unavailable in this browser.";
    if (!videoURL) $("video-status").textContent = "Keep this tab visible. Sound follows the website's Sound on/off setting.";
    videoDialog.showModal();
  };
  $("video-close").onclick = () => { $("video-preview").pause(); videoDialog.close(); };
  $("video-start").onclick = async () => {
    if (videoController) return;
    clearVideo();
    videoController = new AbortController();
    $("video-start").disabled = true;
    try {
      await prepareAudio();
      const style = getComputedStyle(document.documentElement);
      const palette = Object.fromEntries(["paper", "surface", "ink", "muted", "grid", "initial", ...RewardLab.methods]
        .map(key => [key, style.getPropertyValue(`--${key}`).trim()]));
      const {blob, extension} = await RhoVideo.record({
        canvas: $("video-canvas"), palette, audio: audioContext, master: audioMaster,
        signal: videoController.signal,
        getState: () => ({run: sim, methods: selected.slice(),
          focus, shown, horizon, pace, metric: $("curve-metric").value, phase: playing ? phase : "Paused", sounding,
          bin: Array.from(document.querySelectorAll(`[data-method="${focus}"] .bar`)).findIndex(bar => bar.classList.contains("sounding"))}),
        onStart() {
          videoDialog.close();
          $("export-video").textContent = "Stop recording";
          setStatus("Recording the live charts and website audio. Use Play or Listen; click Stop recording to save.");
        },
      });
      pause();
      $("video-description").textContent = "Recorded your live charts, selections, and website audio.";
      videoURL = URL.createObjectURL(blob);
      $("video-preview").src = videoURL;
      $("video-preview").hidden = false;
      $("video-download").href = videoURL;
      $("video-download").download = `rho-live-recording.${extension}`;
      $("video-download").hidden = false;
      $("video-status").textContent = `Video ready (${(blob.size / 1e6).toFixed(1)} MB). Preview it, then download.`;
    } catch (error) {
      $("video-status").textContent = `Could not record: ${error.message}`;
    } finally {
      videoController = null;
      $("video-start").disabled = false;
      $("export-video").textContent = "Export video";
      videoDialog.showModal();
    }
  };
  typeset($("settings"));
  typeset($("inspector"));
  reset();
  writeForm();
  route();
  if (startupError) setStatus(startupError);
  // Expose experiment state for reproducibility checks and small extensions.
  window.Rho = {
    get state() {
      return {
        cfg: { ...cfg },
        methods: selected.slice(),
        focus,
        shown,
        playing,
        phase,
        pending,
        sound: sounding,
        horizon,
        pace,
        sim,
        batches,
      };
    },
  };
})();
