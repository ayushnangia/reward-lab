"use strict";
const RewardApp = (() => {
  const $ = (id) => document.getElementById(id),
    C = LabContent,
    M = RewardLab.methods,
    E = LabCharts.esc;
  const pct = (x) => (x * 100).toFixed(1) + "%",
    fmt = (x) => x.toFixed(3),
    color = (m) => `var(--${m})`;
  let sim = RewardLab.create(),
    checkpoint = 0,
    running = false,
    raf = 0,
    runTarget = 0,
    view = "notes",
    dirty = false,
    metric = "mean",
    family = "tail",
    shown = new Set(M),
    toastTimer,
    sweepWorker = null,
    pairWorker = null,
    bench = null;
  const familyMethods = () =>
    family === "all" ? M : family === "classic" ? M.slice(6) : M.slice(0, 6);
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem("reward-lab-setups") || "[]");
    if (!Array.isArray(saved)) saved = [];
  } catch {
    saved = [];
  }
  const notify = (message, error = false) => {
    const t = $("toast");
    t.textContent = message;
    t.hidden = false;
    t.setAttribute("role", error ? "alert" : "status");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), error ? 7000 : 3800);
  };
  const options = (el, entries) => {
    el.innerHTML = Object.entries(entries)
      .map(([v, n]) => `<option value="${E(v)}">${E(n)}</option>`)
      .join("");
  };
  const numOptions = (id, values) =>
    options($(id), Object.fromEntries(values.map((x) => [x, String(x)])));
  options($("preset"), RewardLab.presets);
  options($("layout"), C.layouts);
  options($("model"), C.models);
  options($("transform"), C.transforms);
  options($("judge"), C.judges);
  options($("metric"), C.metrics);
  options($("inspect-method"), C.names);
  numOptions("n", [2, 8, 16, 32, 64]);
  numOptions("lr", [0.03, 0.15, 0.5, 1]);
  numOptions("k", [1, 4, 8, 16]);
  numOptions("evalK", [1, 4, 16, 64]);
  options($("floor"), {
    0: "None · preserve exact support",
    0.0001: "0.0001 per output",
    0.001: "0.001 per output",
  });
  function writeForm(cfg) {
    for (const [key, value] of Object.entries(cfg)) {
      const el = $(key);
      if (!el) continue;
      if (el.type === "checkbox") el.checked = value;
      else {
        if (
          el.tagName === "SELECT" &&
          ![...el.options].some((o) => o.value === String(value))
        )
          el.add(new Option(String(value), String(value)));
        el.value = value;
      }
    }
    dirty = false;
    formHints();
  }
  function readForm() {
    const cfg = {};
    for (const key of Object.keys(LabConfig.defaults())) {
      const el = $(key);
      if (!el) continue;
      if (el.type === "number" && !el.value.trim())
        throw Error("Enter a value for " + key + ".");
      cfg[key] =
        el.type === "checkbox"
          ? el.checked
          : LabConfig.numbers[key]
            ? Number(el.value)
            : el.value;
    }
    return LabConfig.validate(cfg);
  }
  function formHints() {
    $("custom-field").hidden = $("preset").value !== "custom";
    $("shape-fields").hidden = $("transform").value !== "hinge";
    $("lambda-field").hidden = !["boxcox", "yeojohnson"].includes(
      $("transform").value,
    );
    $("preset-note").textContent = C.presetNotes[$("preset").value];
    $("model-note").textContent = C.modelNotes[$("model").value];
    $("transform-note").textContent = C.transformNotes[$("transform").value];
    $("tailAt-value").textContent = Number($("tailAt").value).toFixed(2);
    $("jump-value").textContent = Number($("jump").value).toFixed(2);
    $("settings-status").textContent = dirty
      ? "Unapplied changes. Apply to start a new run."
      : "Settings are applied.";
    try {
      const cfg = readForm();
      const p = RewardLab.normalize(
        RewardLab.initial(cfg.preset, cfg.custom).map((v) => v + cfg.floor),
      );
      LabCharts.hist(
        $("start-preview"),
        p.map((v, i) => ({ x: i / 20, p: v })),
        { mini: true, title: "Initial output quality probabilities" },
      );
    } catch {
      $("start-preview").innerHTML = "";
    }
    if (view === "shaping") renderShaping();
  }
  function pause() {
    running = false;
    cancelAnimationFrame(raf);
    $("run").textContent = "▶ Run " + $("horizon").value + " updates";
    $("run").setAttribute("aria-label", $("run").textContent);
  }
  function reset(cfg = sim.cfg, message) {
    cfg = LabConfig.validate(cfg);
    pause();
    $("scenario-message")?.remove();
    sim = RewardLab.create(cfg);
    checkpoint = 0;
    runTarget = 0;
    writeForm(cfg);
    render();
    try {
      localStorage.setItem("reward-lab-last-setup", JSON.stringify(cfg));
    } catch {}
    if (message) notify(message);
  }
  function advance(n) {
    for (let i = 0; i < n; i++) RewardLab.step(sim);
    checkpoint = sim.step;
    render();
  }
  function run(count = Number($("horizon").value)) {
    if (running) {
      pause();
      return;
    }
    if (dirty) {
      notify("Apply your changed settings before running.", true);
      return;
    }
    if (sim.step >= 3000) {
      notify(
        "Export this run or restart before exceeding 3,000 updates.",
        true,
      );
      return;
    }
    const target = Math.min(3000, sim.step + count);
    runTarget = target;
    running = true;
    $("run").textContent = "Ⅱ Pause";
    let last = performance.now();
    function frame(now) {
      if (!running) return;
      const rate = Number($("playback-speed").value);
      if (rate > 0 && now - last < 1000 / rate) {
        raf = requestAnimationFrame(frame);
        return;
      }
      last = now;
      advance(Math.min(rate === 0 ? 5 : 1, target - sim.step));
      if (sim.step < target) raf = requestAnimationFrame(frame);
      else {
        pause();
        notify(
          "Completed " +
            sim.step +
            " updates. Replay the checkpoints or export this run.",
        );
      }
    }
    raf = requestAnimationFrame(frame);
  }
  function single(n) {
    if (dirty) {
      notify("Apply your changed settings first.", true);
      return;
    }
    pause();
    advance(Math.min(n, Math.max(0, 3000 - sim.step)));
  }
  function setupCards() {
    $("distribution-grid").innerHTML = M.map(
      (m) =>
        `<article class="distribution-card" data-card-method="${m}"><div class="dist-title"><h3><i class="dot" style="--series:${color(m)}"></i>${C.names[m]}</h3><span class="dist-tag">${C.tags[m]}</span></div><div id="dist-${m}" class="dist-plot"></div><div class="dist-metrics" id="metrics-${m}"></div></article>`,
    ).join("");
    $("legend").innerHTML = M.map(
      (m) =>
        `<button type="button" data-method="${m}" aria-pressed="true"><i class="dot" style="--series:${color(m)}"></i>${C.names[m]}</button>`,
    ).join("");
    $("legend").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const m = b.dataset.method;
      if (shown.has(m)) shown.delete(m);
      else shown.add(m);
      b.setAttribute("aria-pressed", shown.has(m));
      renderLearning();
    });
    displayFamily(family);
  }
  function displayFamily(next) {
    family = ["tail", "classic", "all"].includes(next) ? next : "tail";
    const active = familyMethods();
    $("distribution-grid").classList.toggle(
      "expanded-family",
      family !== "tail",
    );
    document
      .querySelectorAll("[data-card-method]")
      .forEach((el) => (el.hidden = !active.includes(el.dataset.cardMethod)));
    document
      .querySelectorAll("#legend [data-method]")
      .forEach((el) => (el.hidden = !active.includes(el.dataset.method)));
    document
      .querySelectorAll("[data-family]")
      .forEach((el) =>
        el.setAttribute("aria-pressed", el.dataset.family === family),
      );
    $("method-scope").textContent =
      `All methods run regardless of the selected tab. Compute per update varies by method.`;
    if (view === "lab") render();
  }
  document
    .querySelectorAll("[data-family]")
    .forEach((b) => (b.onclick = () => displayFamily(b.dataset.family)));
  document
    .querySelectorAll("[data-quick]")
    .forEach((b) => (b.onclick = () => loadScenario(Number(b.dataset.quick))));
  function render() {
    const cfg = sim.cfg;
    $("step-count").textContent = sim.step.toLocaleString();
    $("checkpoint").max = sim.step;
    $("checkpoint").value = checkpoint;
    $("checkpoint-label").textContent = checkpoint + " / " + sim.step;
    $("rollout-count").textContent =
      (sim.step * cfg.n).toLocaleString() + " rollouts per method";
    $("run-summary").textContent =
      `${RewardLab.presets[cfg.preset]} · ${C.models[cfg.model]} · n=${cfg.n} · rate ${cfg.lr} · seed ${cfg.seed}`;
    let notes = [
      "MaxRL uses binary success ≥ 0.9 and bypasses the selected continuous transform.",
    ];
    if (cfg.transform === "reciprocal")
      notes.unshift(
        "The reciprocal rewards lower true quality. This deliberately tests reversed ranking.",
      );
    if (cfg.transform === "hinge" && cfg.jump > 0)
      notes.unshift(
        "A deliberate jump creates a gap on the transformed score axis. That is separate from a gap in true outcomes.",
      );
    if (["zscore", "ranknormal"].includes(cfg.transform))
      notes.push(
        "This map is refitted to each group; fixed-transform objective arguments do not apply unchanged.",
      );
    if (cfg.k > cfg.n) notes.push(`PKPO training k is capped at n=${cfg.n}.`);
    $("notices").textContent = notes.join(" ");
    $("notices").classList.toggle("warning", cfg.transform === "reciprocal");
    if (view === "lab") {
      renderDistributions();
      renderLearning();
      renderBatch();
    }
  }
  function renderDistributions() {
    const record = sim.history[checkpoint],
      initial = LabCharts.rewardRows(sim.base, sim.rewards);
    const active = familyMethods(),
      rows = Object.fromEntries(
        active.map((m) => [
          m,
          LabCharts.rewardRows(record.methods[m].p, sim.rewards).map(
            (d, i) => ({ ...d, initial: initial[i].p }),
          ),
        ]),
      );
    const ceiling = 1; // Keep the probability axis fixed while learning.
    for (const m of active) {
      LabCharts.hist($("dist-" + m), rows[m], {
        ceiling,
        color: color(m),
        title: `${C.names[m]} true reward distribution at update ${checkpoint}`,
      });
      const q = record.methods[m].metrics;
      $("metrics-" + m).innerHTML =
        `<div><span>Mean reward</span><strong>${fmt(q.mean)}</strong></div><div><span>Excellent</span><strong>${pct(q.high)}</strong></div><div><span>Middle</span><strong>${pct(q.middle)}</strong></div>`;
    }
  }
  function renderLearning() {
    $("curve-readout").textContent =
      "Move across the chart to inspect a checkpoint.";
    const series = familyMethods()
      .filter((m) => shown.has(m))
      .map((m) => ({
        name: C.names[m],
        color: color(m),
        points: sim.history.map((r) => ({
          x: r.step,
          y: r.methods[m].metrics[metric],
        })),
      }));
    const percent = ["high", "bad", "middle"].includes(metric);
    LabCharts.lines($("learning-chart"), series, {
      xmax: Math.max(1, sim.step, runTarget, Number($("horizon").value)),
      observedMax: sim.step,
      ymin: 0,
      ymax: metric === "entropy" ? Math.log(21) : 1,
      integerX: true,
      cursor: checkpoint,
      percent,
      ylabel: C.metrics[metric].split(" · ")[0],
      title: C.metrics[metric] + " over policy updates",
      onSelect: (v) => {
        pause();
        checkpoint = Math.max(0, Math.min(sim.step, v));
        render();
      },
      readout: (v, values) => {
        $("curve-readout").innerHTML =
          `<strong>Update ${v.toFixed(1)}</strong>` +
          values
            .map(
              (d) =>
                `<span><i class="dot" style="--series:${d.color}"></i> ${d.name} ${percent ? pct(d.value) : fmt(d.value)}</span>`,
            )
            .join("");
      },
    });
  }
  function renderBatch() {
    const method = $("inspect-method").value,
      b = sim.last[method];
    $("batch-summary").textContent = C.formulas[method];
    if (!b) {
      $("batch-label").textContent =
        "Run a step to inspect the sampled outputs and training weights.";
      $("batch-table").innerHTML =
        '<div class="empty-state">The first sampled group will appear here.</div>';
      return;
    }
    const mean = RewardLab.mean(b.adv),
      zero = b.adv.every((v) => Math.abs(v) < 1e-12);
    $("batch-label").textContent =
      `Latest update ${sim.step} · ${sim.cfg.n} samples · gradient norm ${b.norm.toPrecision(3)}${zero ? " · zero reward-driven update" : ""}${checkpoint !== sim.step ? " · histogram is replaying update " + checkpoint : ""}`;
    $("batch-summary").textContent =
      C.formulas[method] + ` · mean A = ${mean.toPrecision(3)}`;
    if (b.kl !== undefined)
      $("batch-summary").textContent += ` · KL = ${b.kl.toFixed(5)}`;
    if (method === "trpo")
      $("batch-summary").textContent +=
        ` · ${b.accepted ? "accepted" : "no accepted step"} · ${b.backtracks} backtracks`;
    if (method === "ppo")
      $("batch-summary").textContent +=
        ` · ${b.epochs} epochs · maximum clipped fraction ${pct(b.clipped)}`;
    if (b.baseline !== undefined)
      $("batch-summary").textContent +=
        ` · V: ${fmt(b.baseline)} → ${fmt(b.critic)}`;
    $("batch-table").innerHTML =
      "<table><thead><tr><th>Sample / output</th><th>True</th><th>Judged</th><th>Training reward</th><th>Advantage A</th></tr></thead><tbody>" +
      b.ids
        .map(
          (id, i) =>
            `<tr><td>${i + 1} / #${id}</td><td>${fmt(b.raw[i])}</td><td>${fmt(b.judged[i])}</td><td>${fmt(b.transformed[i])}</td><td class="${b.adv[i] > 0 ? "positive" : b.adv[i] < 0 ? "negative" : ""}">${b.adv[i] > 0 ? "+" : ""}${fmt(b.adv[i])}</td></tr>`,
        )
        .join("") +
      "</tbody></table>";
  }
  function download(name, value, type = "application/json") {
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob(
          [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
          { type },
        ),
      );
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportRun() {
    download("rho-run.json", {
      version: 1,
      created: new Date().toISOString(),
      scope:
        "21-outcome toy simulation; MaxRL uses binary judged success >= 0.9.",
      config: sim.cfg,
      updates: sim.step,
      history: sim.history,
      lastGroup: sim.last,
    });
    notify(
      "Run exported with settings, probabilities, metrics, and the latest sampled group.",
    );
  }
  function refreshSaved() {
    $("saved-setups").innerHTML =
      '<option value="">Choose a saved setup…</option>' +
      saved
        .map((s, i) => `<option value="${i}">${E(s.name)}</option>`)
        .join("");
  }
  function saveSetup() {
    try {
      const cfg = readForm(),
        name = `${RewardLab.presets[cfg.preset]} · ${C.transforms[cfg.transform]} · seed ${cfg.seed}`;
      saved.unshift({ name, cfg });
      saved = saved.slice(0, 30);
      localStorage.setItem("reward-lab-setups", JSON.stringify(saved));
      refreshSaved();
      download("rho-setup.json", { version: 1, config: cfg });
      notify("Setup saved in this browser and downloaded as JSON.");
    } catch (e) {
      notify(e.message, true);
    }
  }
  function navigate() {
    const next = location.hash.slice(1),
      previous = view;
    view = [
      "notes",
      "outputs",
      "discover",
      "lab",
      "shaping",
      "experiments",
      "guide",
    ].includes(next)
      ? next
      : "notes";
    document.body.dataset.view = view;
    setMenu(false);
    if (previous !== view && settingsDialog.open) closeSettings();
    document.body.classList.toggle("discovery-mode", view === "discover");
    document.body.classList.toggle("outputs-mode", view === "outputs");
    document.body.classList.toggle("notes-mode", view === "notes");
    if (previous === "lab" && view !== "lab") pause();
    document
      .querySelectorAll("[data-panel]")
      .forEach((p) => (p.hidden = p.dataset.panel !== view));
    document.querySelectorAll("a[data-view]").forEach((a) => {
      if (a.dataset.view === view) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (["lab", "shaping", "experiments"].includes(view)) {
      $("view-" + view)
        .querySelector(".page-heading")
        ?.after(mobile);
    }
    LabCharts.hideTip();
    if (view === "lab") render();
    if (view === "shaping") renderShaping();
    if (previous !== view) window.scrollTo({ top: 0, behavior: "instant" });
    document.dispatchEvent(new Event("reward-lab-view-change"));
  }
  function loadScenario(i) {
    const scenario = C.scenarios[i];
    reset(
      { ...LabConfig.defaults(), ...scenario.cfg },
      "Experiment loaded: " + scenario.title,
    );
    $("scenario-message")?.remove();
    const n = document.createElement("div");
    n.id = "scenario-message";
    n.className = "scenario-strip";
    n.textContent = scenario.watch;
    $("view-lab").prepend(n);
    location.hash = scenario.cfg.jump ? "shaping" : "lab";
  }
  function renderShaping() {
    if (typeof window.renderRewardShaping === "function")
      window.renderRewardShaping();
  }
  $("settings-form").addEventListener("input", () => {
    dirty = true;
    formHints();
  });
  $("settings-form").addEventListener("change", () => {
    dirty = true;
    formHints();
  });
  $("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      reset(readForm(), "Settings applied. Ready to run.");
      if (settingsDialog.open) closeSettings();
    } catch (error) {
      if (settingsDialog.open) {
        $("settings-dialog-error").textContent = error.message;
        $("settings-dialog-error").hidden = false;
        settingsDialog.scrollTo({ top: 0, behavior: "instant" });
      }
      notify(error.message, true);
    }
  });
  $("run").onclick = () => run();
  $("horizon").onchange = () => {
    if (!running) pause();
  };
  $("step").onclick = () => single(1);
  $("step25").onclick = () => single(25);
  $("reset").onclick = () => reset(sim.cfg, "Run reset to the same seed.");
  $("defaults").onclick = () =>
    reset(LabConfig.defaults(), "Default setup restored.");
  $("checkpoint").oninput = () => {
    pause();
    checkpoint = Number($("checkpoint").value);
    render();
  };
  $("latest").onclick = () => {
    checkpoint = sim.step;
    render();
  };
  $("metric").onchange = () => {
    metric = $("metric").value;
    renderLearning();
  };
  $("inspect-method").value = "tailrl";
  $("inspect-method").onchange = renderBatch;
  $("export-run").onclick = exportRun;
  $("save-setup").onclick = saveSetup;
  $("import-setup").onclick = () => $("import-file").click();
  $("share-setup").onclick = async () => {
    try {
      const cfg = readForm();
      const url = new URL(location.href);
      url.search = "";
      url.searchParams.set("config", JSON.stringify(cfg));
      url.searchParams.set("family", family);
      url.hash = "lab";
      if (url.href.length > 6000)
        throw Error(
          "This custom setup is too long for a link. Use Save setup to share its JSON.",
        );
      try {
        await navigator.clipboard.writeText(url.href);
        notify(
          "Experiment link copied. It opens these settings at update zero.",
        );
      } catch {
        const dialog = document.createElement("dialog");
        dialog.className = "share-dialog";
        dialog.innerHTML =
          '<h2>Share this experiment</h2><p>Copy the link below. It opens your setup at update zero.</p><input type="text" readonly aria-label="Experiment link"><button>Done</button>';
        dialog.querySelector("input").value = url.href;
        dialog.querySelector("button").onclick = () => dialog.close();
        dialog.onclose = () => dialog.remove();
        document.body.append(dialog);
        dialog.showModal();
        dialog.querySelector("input").select();
      }
    } catch (e) {
      notify(e.message, true);
    }
  };
  $("import-file").onchange = async () => {
    const f = $("import-file").files[0];
    if (!f) return;
    try {
      if (f.size > 5e6) throw Error("Use a setup or run JSON under 5 MB.");
      const data = JSON.parse(await f.text());
      reset(
        LabConfig.validate(data.config || data),
        "Setup loaded. The run starts at update zero.",
      );
    } catch (e) {
      notify("Could not load setup: " + e.message, true);
    } finally {
      $("import-file").value = "";
    }
  };
  $("saved-setups").onchange = () => {
    const key = $("saved-setups").value;
    if (key === "") return;
    try {
      reset(saved[Number(key)].cfg, "Saved setup loaded.");
    } catch (e) {
      notify(e.message, true);
    }
  };
  function theme(next) {
    document.documentElement.dataset.theme = next;
    $("theme").textContent = next === "dark" ? "Light mode" : "Dark mode";
    try {
      localStorage.setItem("reward-lab-theme", next);
    } catch {}
  }
  let chosen = "light";
  try {
    chosen = localStorage.getItem("reward-lab-theme") || "light";
  } catch {}
  theme(chosen);
  $("theme").onclick = () =>
    theme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  const navToggle = $("nav-toggle");
  function setMenu(open, returnFocus = false) {
    document.querySelector(".app-header").classList.toggle("menu-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.textContent = open ? "Close menu" : "Menu";
    if (returnFocus) navToggle.focus();
  }
  navToggle.onclick = () =>
    setMenu(navToggle.getAttribute("aria-expanded") !== "true");
  $("site-nav").addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      navToggle.getAttribute("aria-expanded") === "true"
    )
      setMenu(false, true);
  });
  const mobile = document.createElement("button");
  mobile.className = "mobile-settings";
  mobile.textContent = "Experiment settings";
  mobile.setAttribute("aria-expanded", "false");
  mobile.setAttribute("aria-haspopup", "dialog");
  mobile.setAttribute("aria-controls", "settings-dialog");
  $("main").prepend(mobile);
  const settings = $("experiment-settings"),
    anchor = document.createComment("Settings position");
  settings.before(anchor);
  const settingsDialog = document.createElement("dialog");
  settingsDialog.id = "settings-dialog";
  settingsDialog.setAttribute("aria-labelledby", "settings-dialog-title");
  settingsDialog.innerHTML =
    '<div class="settings-dialog-header"><h2 id="settings-dialog-title">Experiment settings</h2><button id="settings-close" autofocus>Close</button></div><p id="settings-dialog-error" role="alert" hidden></p>';
  document.body.append(settingsDialog);
  function openSettings() {
    settingsDialog.append(settings);
    settings.classList.add("mobile-open");
    mobile.setAttribute("aria-expanded", "true");
    $("settings-dialog-error").hidden = true;
    document.body.classList.add("settings-open");
    settingsDialog.showModal();
    formHints();
  }
  mobile.onclick = () =>
    settingsDialog.open ? closeSettings() : openSettings();
  $("settings-close").onclick = closeSettings;
  function restoreSettings() {
    // A queued close event must not dismantle a dialog that was just reopened.
    if (settingsDialog.open || settings.parentNode !== settingsDialog) return;
    anchor.after(settings);
    settings.classList.remove("mobile-open");
    mobile.setAttribute("aria-expanded", "false");
    document.body.classList.remove("settings-open");
    if (mobile.getClientRects().length) mobile.focus({ preventScroll: true });
    formHints();
  }
  function closeSettings() {
    settingsDialog.close();
    restoreSettings();
  }
  settingsDialog.addEventListener("close", restoreSettings);
  settingsDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSettings();
  });
  matchMedia("(min-width: 901px)").addEventListener("change", (e) => {
    if (e.matches) {
      setMenu(false);
      if (settingsDialog.open) closeSettings();
    }
  });
  document.querySelector(".skip").addEventListener("click", (event) => {
    event.preventDefault();
    $("main").focus();
    $("main").scrollIntoView({ behavior: "instant", block: "start" });
  });
  window.addEventListener("hashchange", navigate);
  let resizeTimer,
    lastMainWidth = -1;
  new ResizeObserver(([entry]) => {
    // Expanding a chart readout changes height, not its plotting coordinates.
    // Redrawing on that height change used to erase the user's hover inspection.
    const width = entry.contentRect.width;
    if (Math.abs(width - lastMainWidth) < 0.5) return;
    lastMainWidth = width;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      formHints();
      if (view === "lab") render();
    }, 80);
  }).observe($("main"));
  setupCards();
  refreshSaved();
  try {
    const previous = localStorage.getItem("reward-lab-last-setup");
    if (previous)
      sim = RewardLab.create(LabConfig.validate(JSON.parse(previous)));
  } catch {}
  try {
    const query = new URLSearchParams(location.search),
      config = query.get("config");
    if (config) {
      if (config.length > 6000) throw Error("The experiment link is too long.");
      sim = RewardLab.create(LabConfig.validate(JSON.parse(config)));
      family = query.get("family") || "tail";
      displayFamily(family);
      notify("Shared experiment loaded. Run it to see what happens.");
    }
  } catch {
    notify(
      "The shared setup was invalid. Loaded a valid local setup instead.",
      true,
    );
  }
  writeForm(sim.cfg);
  navigate();
  return {
    get sim() {
      return sim;
    },
    get view() {
      return view;
    },
    get dirty() {
      return dirty;
    },
    get checkpoint() {
      return checkpoint;
    },
    get family() {
      return family;
    },
    displayFamily,
    $,
    C,
    M,
    E,
    pct,
    fmt,
    color,
    notify,
    readForm,
    writeForm,
    reset,
    run,
    pause,
    advance,
    render,
    navigate,
    loadScenario,
    download,
    options,
    LabCharts,
    get bench() {
      return bench;
    },
    set bench(v) {
      bench = v;
    },
    get pairWorker() {
      return pairWorker;
    },
    set pairWorker(v) {
      pairWorker = v;
    },
    get sweepWorker() {
      return sweepWorker;
    },
    set sweepWorker(v) {
      sweepWorker = v;
    },
  };
})();
