/* Research workbench: matched prompts, inspectable responses, local-only imports. */
const OutputWorkbench = (() => {
  const M = OutputMath,
    E = OutputExamples,
    $ = (id) => document.getElementById(id);
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
  const pct = (v) => (v === null ? "Unavailable" : (v * 100).toFixed(1) + "%");
  const fmt = (v) =>
    v === null
      ? "Unavailable"
      : Math.abs(v) >= 1000
        ? v.toPrecision(4)
        : v.toFixed(3);
  const diff = (a, b, percent = false) =>
    a === null || b === null
      ? "—"
      : `${b - a > 0 ? "+" : ""}${((b - a) * (percent ? 100 : 1)).toFixed(percent ? 1 : 3)}${percent ? " pp" : ""}`;
  let data = E.create("judge"),
    prompt = null,
    k = 1,
    bin = null,
    side = 1,
    selected = null,
    responseOffset = 0,
    cached = null,
    domainCache = null,
    restored = false;
  const host = $("view-outputs");
  host.innerHTML = `
    <div class="output-shell">
      <aside class="output-sidebar" aria-label="Output datasets">
        <div class="output-project"><span class="project-icon">↳</span><div><strong>Output comparisons</strong><small>Matched prompts across checkpoints</small></div></div>
        <h2 class="output-examples-heading">Open an example</h2>
        <label class="output-case-select-label" for="output-case-select">Example dataset<select id="output-case-select">${Object.entries(
          E.cases,
        )
          .map(([id, c]) => `<option value="${id}">${esc(c.title)}</option>`)
          .join(
            "",
          )}<option value="imported" disabled>Imported evaluation</option></select></label>
        <div class="output-case-list">${Object.entries(E.cases)
          .map(
            ([id, c]) =>
              `<button data-output-case="${id}" aria-pressed="${id === "judge"}"><span>${esc(c.title)}</span><small>${esc(c.description)}</small></button>`,
          )
          .join("")}</div>
        <div class="output-import"><h2>Use your outputs</h2><p>CSV, JSON, or JSONL from two checkpoints. Processing stays in this browser tab.</p><button id="output-import-button">Import output file</button><input id="output-file" type="file" accept=".json,.jsonl,.csv" hidden><button id="output-template" class="output-link">Download example JSON ↓</button><details><summary>Required columns</summary><p><code>checkpoint, prompt_id, prompt, output, score, correct</code></p><p><code>score</code>: independent evaluation, 0–1. <code>correct</code>: explicit true/false.</p><p>Optional: <code>judge_score</code>, <code>tokens</code>, <code>family</code>, <code>domain</code>, <code>split</code>. Keep the rubric and sampling settings comparable.</p><p>Exactly two checkpoints; first appearance determines order. 5 MB / 10,000 rows maximum. No files are uploaded or saved.</p></details></div>
        <div class="output-sidebar-bottom"><a href="#lab">Train a toy policy →</a><a href="#discover">Understand sampling →</a></div>
      </aside>
      <div class="output-main">
        <div class="output-title"><div><p class="output-breadcrumb">Rho / Evaluation</p><h1>Compare model outputs</h1><p>Compare scores and responses from two checkpoints.</p></div><button id="output-export">Export analysis ↓</button></div>
        <div class="output-provenance" id="output-provenance"></div>
        <div id="output-error" role="alert" hidden></div>
        <div class="output-controls"><label for="output-prompt">Evaluation prompt<select id="output-prompt"></select></label><div class="output-controls-note" id="output-counts"></div><button id="output-share" class="output-link">Copy example link</button></div>
        <div class="output-metrics" id="output-metrics"></div>
        <div class="output-finding" id="output-finding" aria-live="polite"></div>
        <div class="output-inspection">
          <section class="output-distribution"><div class="output-section-title"><div><h2>Score distribution</h2><p>Click a bar to read those outputs.</p></div><button id="output-clear-filter" class="output-link" hidden>Clear filter</button></div><div id="output-histogram"></div><div class="output-plot-legend" id="output-legend"></div><p class="output-caption">Independent evaluation score. Each prompt receives equal weight; both checkpoints use the same axes.</p></section>
          <section class="output-response"><div class="output-section-title"><div><h2>Inspect a response</h2><p id="output-filter-label"></p></div><select id="output-response-side" aria-label="Checkpoint to inspect"></select></div><div id="output-response-list"></div><div id="output-response-pages"></div><div id="output-response-detail"></div></section>
        </div>
        <div class="output-budget-section"><div class="output-section-title"><div><h2>Results by sampling budget</h2><p>The checkpoints stay fixed as you change the number of attempts.</p></div><label class="output-budget-label" for="output-k">Attempts per prompt <input id="output-k" type="number" min="1" max="16" value="1"><span id="output-k-max"></span></label></div><div class="output-budget-grid"><div><div id="output-budget-chart"></div><div class="output-budget-key"><span><i class="before-line"></i> Before</span><span><i class="after-line"></i> After</span><span>Solid = best available · Dashed = judge-selected</span></div></div><div><table class="output-stats-table"><thead><tr><th>At this budget</th><th id="output-budget-before">Before</th><th id="output-budget-after">After</th></tr></thead><tbody id="output-budget-table"></tbody></table><p class="output-caption" id="output-budget-note"></p></div></div></div>
        <section class="output-prompt-section"><div class="output-section-title"><div><h2>Results by prompt</h2><p>Keep the prompt fixed before interpreting a model-wide histogram.</p></div><span id="output-match-note"></span></div><div class="output-table-scroll"><table class="output-prompt-table"><thead><tr><th>Prompt</th><th>Samples B / A</th><th>Correct before</th><th>Correct after</th><th>Change</th></tr></thead><tbody id="output-prompts-table"></tbody></table></div></section>
        <section class="output-domain-section"><div class="output-section-title"><div><h2>Results by domain and split</h2><p>All matched prompts, grouped by supplied evaluation metadata.</p></div><a href="OUTPUT_FORMAT.md">Format and assumptions</a></div><div id="output-domain-results"></div></section>
        <section class="output-research"><div class="output-section-title"><div><h2>Evaluation checks</h2></div></div>
          <div class="output-research-grid">
            <article><h3>Reliability & the tail</h3><p>Compare pass@1, pass@k, low-score mass, and per-prompt failures. A better mean can hide a worse lower tail. A missing observed success is not proof of zero probability.</p><a href="https://arxiv.org/abs/2107.03374" target="_blank" rel="noreferrer">Pass@k estimator ↗</a></article>
            <article><h3>Judge validity</h3><p>Keep training reward separate from held-out tests or independent review. A best-of-k oracle is an upper bound on what your selector can recover. Examine high-judge, low-evaluation responses.</p><a href="https://arxiv.org/abs/2210.10760" target="_blank" rel="noreferrer">Reward overoptimization ↗</a></article>
            <article><h3>Coverage & useful variety</h3><p>Look for lost solution families and hard-prompt regressions. Exact text uniqueness is only a surface measure; different wording can repeat the same error. Family labels here are supplied, not inferred.</p><a href="https://arxiv.org/abs/2504.13837" target="_blank" rel="noreferrer">Pass@k and reasoning coverage ↗</a></article>
            <article><h3>Compute & repeatability</h3><p>Match temperature, decoding, token limits, judge calls, and sampling budgets. Repeat training seeds and evaluate held-out prompts. Bootstrap at the prompt level when estimating across-task uncertainty.</p><a href="#guide">Toy optimizer scope & equations →</a></article>
            <article><h3>Training signal & stability</h3><p>Inspect all-tie reward groups, advantage variance, policy KL, entropy, PPO clipping, and gradient norms. A score histogram alone cannot reveal whether an optimizer is stable. Use rollout and optimizer logs alongside these outputs.</p><a href="#lab">Inspect toy update diagnostics →</a></article>
            <article><h3>Reward transformations</h3><p>Separate centering and scale normalization from changing the reward objective. Log, power, and piecewise maps can alter expected-reward preferences even when they preserve sample order. Evaluate every version on the original task measure.</p><a href="#shaping">Inspect the reward mapping →</a></article>
          </div>
          <details class="output-methods"><summary>Metric definitions and limitations</summary><p>All aggregate metrics give equal weight to matched prompts. Unmatched prompts are excluded and counted. Pass@k is averaged per prompt using 1 − C(n − c, k) / C(n, k), and is unavailable beyond the smallest group size. Under independent samples from a fixed per-prompt policy, this is the standard unbiased estimator.</p><p>The best-available and judge-selected curves average the independently evaluated score of the winner over all size-k subsets of the recorded outputs, sampled without replacement. Tied judge scores select uniformly among tied candidates. They are exact statistics of this finite sample pool, not a claim of exact population performance.</p><p>Tokens count all k generated attempts (k × average output tokens); prompt tokens and judge cost are excluded. Missing optional fields display Unavailable. Score histograms do not measure policy KL, token entropy, gradient variance, optimizer stability, semantic diversity, reasoning validity, or out-of-distribution robustness. Those need other logs, labels, or experiments.</p><p>The domain table can show paired prompt-bootstrap intervals for imported data. The hand-authored fixtures have no inferential intervals; imported files do not justify independent training-run uncertainty. Any bimodality could reflect a mixture of prompt difficulties; inspect the conditional distributions before attributing it to learning.</p></details>
        </section>
      </div>
    </div>`;
  const title = host.querySelector(".output-title");
  host.querySelector(".output-shell").prepend(title);
  $("output-case-select").onchange = (e) => {
    if (Object.hasOwn(E.cases, e.target.value)) load(E.create(e.target.value));
  };
  function stats() {
    if (!cached) cached = M.summarize(data, prompt, 1);
    k = Math.min(k, cached.maxK);
    return cached;
  }
  function histogram(s) {
    const width = 570,
      left = 38,
      right = 554,
      top = 21,
      bottom = 208,
      cell = (right - left) / 11;
    const ceiling = Math.max(
      0.1,
      Math.ceil(Math.max(...s.methods.flatMap((m) => m.histogram)) * 10) / 10,
    );
    const y = (v) => bottom - (v / ceiling) * (bottom - top);
    let svg = `<svg viewBox="0 0 ${width} 253" aria-label="Independent evaluation score distribution" role="group"><text x="${left}" y="12" class="o-axis">Share of outputs</text>`;
    for (const f of [0, 0.5, 1])
      svg += `<line x1="${left}" x2="${right}" y1="${y(ceiling * f)}" y2="${y(ceiling * f)}" class="o-grid"/><text x="${left - 8}" y="${y(ceiling * f) + 3}" text-anchor="end" class="o-axis">${Math.round(ceiling * f * 100)}%</text>`;
    for (let i = 0; i < 11; i++)
      for (let j = 0; j < 2; j++) {
        const mass = s.methods[j].histogram[i],
          x = left + i * cell + 5 + j * 17,
          h = Math.max(3, bottom - y(mass));
        const label = `${s.methods[j].name}, score ${i === 10 ? "1.0" : (i / 10).toFixed(1) + " to <" + ((i + 1) / 10).toFixed(1)}, ${pct(mass)}. Inspect responses.`;
        svg += `<rect x="${x}" y="${bottom - h}" width="15" height="${h}" rx="1" class="o-bar o-${j}${bin === i && side === j ? " is-selected" : ""}" tabindex="0" role="button" aria-label="${esc(label)}" aria-pressed="${bin === i && side === j}" data-output-bin="${i}" data-output-side="${j}"><title>${esc(label)}</title></rect>`;
      }
    for (let i = 0; i < 11; i++)
      svg += `<text x="${left + i * cell + 21}" y="226" text-anchor="middle" class="o-axis">${(i / 10).toFixed(1)}</text>`;
    svg += `<text x="${(left + right) / 2}" y="250" text-anchor="middle" class="o-axis">Independent evaluation score →</text></svg>`;
    return svg;
  }
  function curve(s) {
    const left = 34,
      right = 460,
      top = 22,
      bottom = 183,
      x = (v) => left + ((v - 1) / Math.max(1, s.maxK - 1)) * (right - left),
      y = (v) => bottom - v * (bottom - top);
    let svg =
      '<svg viewBox="0 0 482 223" role="img" aria-label="Expected evaluation score of best available and judge-selected outputs by sample budget">';
    for (const v of [0, 0.5, 1])
      svg += `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" class="o-grid"/><text x="25" y="${y(v) + 3}" class="o-axis" text-anchor="end">${v.toFixed(1)}</text>`;
    for (let side = 0; side < 2; side++)
      for (const metric of ["oracle", "selected"]) {
        const points = s.methods[side].curves;
        if (points.some((p) => p[metric] === null)) continue;
        svg += `<path d="${points.map((p, i) => (i ? "L" : "M") + x(p.k) + "," + y(p[metric])).join(" ")}" class="o-line o-line-${side}" ${metric === "selected" ? 'stroke-dasharray="5 4"' : ""}/>`;
        const p = points[k - 1];
        svg += `<circle cx="${x(k)}" cy="${y(p[metric])}" r="3.5" class="o-dot-${side}"/>`;
      }
    svg += `<line x1="${x(k)}" x2="${x(k)}" y1="${top}" y2="${bottom}" class="o-cursor"/>`;
    for (const v of [...new Set([1, Math.ceil(s.maxK / 2), s.maxK])])
      svg += `<text x="${x(v)}" y="202" class="o-axis" text-anchor="middle">${v}</text>`;
    return (
      svg +
      `<text x="${(left + right) / 2}" y="222" class="o-axis" text-anchor="middle">Attempts per prompt</text></svg>`
    );
  }
  function response(s) {
    const rows = s.methods[side].rows.filter(
      (r) =>
        bin === null || Math.min(10, Math.floor(r.score * 10 + 1e-9)) === bin,
    );
    const grouped = new Map();
    for (const row of rows) {
      const key = JSON.stringify([
        row.prompt_id,
        row.output,
        row.score,
        row.correct,
        row.judge_score,
        row.tokens,
        row.family,
      ]);
      if (grouped.has(key)) grouped.get(key).occurrences++;
      else grouped.set(key, { ...row, occurrences: 1 });
    }
    const unique = [...grouped.values()].sort(
      (a, b) => (b.judge_score ?? b.score) - (a.judge_score ?? a.score),
    );
    if (selected === null) responseOffset = 0;
    responseOffset = Math.max(
      0,
      Math.min(
        responseOffset,
        Math.max(0, Math.ceil(unique.length / 20) - 1) * 20,
      ),
    );
    const visible = unique.slice(responseOffset, responseOffset + 20);
    const resetScroll = !visible.some((r) => r.id === selected);
    if (resetScroll) selected = visible[0]?.id;
    $("output-response-pages").innerHTML =
      unique.length > 20
        ? `<button data-output-page="${responseOffset - 20}" ${responseOffset === 0 ? "disabled" : ""}>Previous</button><span>${responseOffset + 1}–${Math.min(responseOffset + 20, unique.length)} of ${unique.length} variants</span><button data-output-page="${responseOffset + 20}" ${responseOffset + 20 >= unique.length ? "disabled" : ""}>Next</button>`
        : "";
    $("output-filter-label").textContent =
      `${rows.length} recorded outputs · ${unique.length} response/label variants${bin !== null ? " · selected score bin" : ""}`;
    $("output-response-side").value = side;
    $("output-response-list").innerHTML = unique.length
      ? visible
          .map(
            (r) =>
              `<button data-output-row="${r.id}" aria-pressed="${selected === r.id}"><span>${esc(r.prompt_id)}</span><b>${r.correct ? "Correct" : "Incorrect"}</b><span>eval ${r.score.toFixed(2)} · ×${r.occurrences}</span></button>`,
          )
          .join("")
      : '<p class="output-caption">No recorded outputs in this bin. Choose another bar.</p>';
    if (resetScroll) $("output-response-list").scrollLeft = 0;
    const r = unique.find((r) => r.id === selected);
    $("output-response-detail").innerHTML = r
      ? `<div class="output-response-meta"><span>Evaluation <b>${r.score.toFixed(2)}</b></span><span>Judge <b>${r.judge_score === null ? "Unavailable" : r.judge_score.toFixed(2)}</b></span><span>${r.tokens === null ? "Tokens unavailable" : r.tokens + " tokens"}</span></div><details class="output-prompt-text" open><summary>Prompt: ${esc(r.prompt_id)}</summary><p>${esc(r.prompt)}</p></details><pre><code>${esc(r.output)}</code></pre><p class="output-response-note">${data.synthetic ? "Hand-authored response and illustrative scores. No model ran; code is not executed." : "Imported response and supplied evaluation labels. Displayed as text; code is not executed."} This response and these labels occur ${r.occurrences} time${r.occurrences === 1 ? "" : "s"} in this filter.</p>`
      : "";
  }
  function renderBudget(s) {
    $("output-k").value = k;
    $("output-k").max = s.maxK;
    $("output-k-max").textContent = `of ≤ ${s.maxK}`;
    $("output-budget-chart").innerHTML = curve(s);
    const a = s.methods[0],
      b = s.methods[1],
      ca = a.curves[k - 1],
      cb = b.curves[k - 1];
    $("output-budget-before").textContent = a.name;
    $("output-budget-after").textContent = b.name;
    const rows = [
      ["Pass@" + k, ca.pass, cb.pass, pct],
      ["Best available score", ca.oracle, cb.oracle, fmt],
      ["Judge-selected score", ca.selected, cb.selected, fmt],
      [
        "Selection gap",
        ca.selected === null ? null : ca.oracle - ca.selected,
        cb.selected === null ? null : cb.oracle - cb.selected,
        fmt,
      ],
      [
        "Output tokens for " + k + " attempts",
        a.tokens === null ? null : a.tokens * k,
        b.tokens === null ? null : b.tokens * k,
        (v) => (v === null ? "Unavailable" : Math.round(v).toLocaleString()),
      ],
    ];
    $("output-budget-table").innerHTML = rows
      .map(
        ([name, a, b, f]) =>
          `<tr><th>${name}</th><td>${f(a)}</td><td>${f(b)}</td></tr>`,
      )
      .join("");
    $("output-budget-note").textContent =
      "Equal-weight average over " +
      s.prompts +
      " matched prompt" +
      (s.prompts === 1 ? "" : "s") +
      ". Selection uses recorded candidates without replacement; judge ties break uniformly.";
    document.querySelectorAll(".output-budget-key > span")[0].innerHTML =
      '<i class="before-line"></i> ' + esc(a.name);
    document.querySelectorAll(".output-budget-key > span")[1].innerHTML =
      '<i class="after-line"></i> ' + esc(b.name);
  }
  function finding(s) {
    const [a, b] = s.methods,
      parts = [];
    if (
      a.judge !== null &&
      b.judge !== null &&
      b.judge > a.judge &&
      b.pass1 < a.pass1
    )
      parts.push(
        "Judge score rose while independently labeled correctness fell. Inspect the outputs the judge rates highest.",
      );
    else if (b.pass1 > a.pass1 && b.curves.at(-1).pass < a.curves.at(-1).pass)
      parts.push(
        "Correctness improved at one attempt, but pass@" +
          s.maxK +
          " fell. Check which prompts lost their rare correct responses.",
      );
    else if (b.poor > a.poor && b.pass1 > a.pass1)
      parts.push(
        "More correct outputs and more poor outputs coexist. The middle shrinking is a tradeoff to evaluate, not a verdict by itself.",
      );
    else if (b.pass1 > a.pass1)
      parts.push(
        "Correctness improved in this comparison. Check the per-prompt rows and judge-selection curve before generalizing.",
      );
    else
      parts.push(
        "Compare the responses, prompt-level changes, and retry curves. One aggregate score does not determine whether this checkpoint is preferable.",
      );
    $("output-finding").textContent = parts[0];
  }
  function renderDomains() {
    if (!domainCache) {
      domainCache = TransferMath.domains(data);
      if (data.synthetic) domainCache.forEach((g) => (g.interval = null));
    }
    const known = data.rows.some((r) => r.domain || r.split);
    if (!known) {
      $("output-domain-results").innerHTML =
        '<p class="output-caption">This file has no domain or split labels. Add <code>domain</code> and <code>split</code> (train, validation, or test) to compare held-out results. The constructed examples do not establish transfer.</p>';
      return;
    }
    const sources = data.trainingDomains || [];
    const relation = (g) =>
      g.split === "train"
        ? "Training evaluation"
        : !["test", "validation"].includes(g.split)
          ? "Unknown split"
          : !sources.length || !g.domain
            ? "Source unspecified"
            : sources.some((d) => d.toLowerCase() === g.domain.toLowerCase())
              ? "Same domain"
              : "Other domain";
    $("output-domain-results").innerHTML =
      `<p class="output-caption">Training domains: ${sources.length ? sources.map(esc).join(", ") : "not supplied (set training_domains in the JSON wrapper)"}. Labels are supplied by you; the viewer cannot verify data separation or attribution.</p><div class="output-table-scroll"><table class="output-prompt-table domain-table"><caption>Correctness per prompt, then averaged equally. ${esc(data.checkpoints[0])} → ${esc(data.checkpoints[1])}.</caption><thead><tr><th>Domain / split</th><th>Relation to training</th><th>Prompts</th><th>Before</th><th>After</th><th>Change</th><th>95% interval, pp</th><th>Improved / regressed</th></tr></thead><tbody>${domainCache.map((g) => `<tr><th>${esc(g.domain || "Unlabeled")}<br><span class="output-caption">${esc(g.split)}</span></th><td>${relation(g)}</td><td>${g.n}</td><td>${pct(g.before)}</td><td>${pct(g.after)}</td><td class="${g.delta < 0 ? "o-regression" : ""}">${diff(g.before, g.after, true)}</td><td>${!data.synthetic && g.interval ? g.interval.map((v) => (v * 100).toFixed(1)).join(" to ") : "Unavailable"}</td><td>${g.improved} / ${g.regressed}</td></tr>`).join("")}</tbody></table></div><p class="output-caption">Paired percentile bootstrap over prompts (1,200 resamples; shown at n ≥ 5). Conditional on these checkpoints and sampled responses; excludes training-seed uncertainty and within-prompt sampling uncertainty. Few prompts give unstable intervals. Each prompt must represent an independent evaluation unit; related variants need a clustered analysis. Validation results are not a substitute for an untouched test set.</p>`;
  }
  function render() {
    const s = stats(),
      [a, b] = s.methods;
    $("output-case-select").value = data.synthetic ? data.case : "imported";
    $("output-provenance").innerHTML = data.synthetic
      ? `<span class="example-mark">Illustrative dataset</span><span>${esc(E.cases[data.case].question)} All responses and measurements are constructed.</span>`
      : `<span class="example-mark">Local import</span><span>${esc(data.name)} · Supplied scores and labels. Reloading this tab clears the import.</span>`;
    $("output-counts").textContent =
      `${s.prompts} matched prompt${s.prompts === 1 ? "" : "s"} · ${a.n} / ${b.n} outputs${data.excluded ? " · " + data.excluded + " unmatched excluded" : ""}`;
    const metrics = [
      ["Eval correctness", a.pass1, b.pass1, pct, true],
      ["Mean eval score", a.score, b.score, fmt, false],
      ["Mean judge score", a.judge, b.judge, fmt, false],
      ["Poor outputs (< 0.3)", a.poor, b.poor, pct, true],
    ];
    $("output-metrics").innerHTML = metrics
      .map(
        ([label, av, bv, f, percent]) =>
          `<div><h2>${label}</h2><div><span>${av === null ? "—" : f(av)}</span><i>→</i><strong>${bv === null ? "—" : f(bv)}</strong></div><small>${esc(a.name)} → ${esc(b.name)} <b>${diff(av, bv, percent)}</b></small></div>`,
      )
      .join("");
    $("output-histogram").innerHTML = histogram(s);
    $("output-legend").innerHTML = s.methods
      .map(
        (m, i) =>
          `<span><i class="o-swatch o-swatch-${i}"></i>${esc(m.name)}</span>`,
      )
      .join("");
    $("output-clear-filter").hidden = bin === null;
    response(s);
    finding(s);
    renderBudget(s);
    renderDomains();
    $("output-prompts-table").innerHTML = s.promptRows
      .map(
        (p) =>
          `<tr class="${prompt === p.id ? "active-prompt" : ""}"><th><button data-output-prompt="${esc(p.id)}">${esc(p.id)}</button></th><td>${p.n[0]} / ${p.n[1]}</td><td>${pct(p.before)}</td><td>${pct(p.after)}</td><td class="${p.after < p.before ? "o-regression" : ""}">${diff(p.before, p.after, true)}</td></tr>`,
      )
      .join("");
    $("output-match-note").textContent =
      `${data.groups.size} matched · ${data.excluded} excluded`;
    $("output-share").disabled = !data.synthetic;
    $("output-share").title = data.synthetic
      ? "Copy this example configuration"
      : "Imported outputs are not included in public links.";
    const extra = [
      ["Exact text uniqueness", a.unique, b.unique, pct],
      [
        "Supplied solution families / prompt",
        a.families,
        b.families,
        (v) => (v === null ? "Unavailable" : v.toFixed(1)),
      ],
    ];
    $("output-budget-table").insertAdjacentHTML(
      "beforeend",
      extra
        .map(
          ([n, a, b, f]) =>
            `<tr><th>${n}</th><td>${f(a)}</td><td>${f(b)}</td></tr>`,
        )
        .join(""),
    );
    document
      .querySelectorAll("[data-output-case]")
      .forEach((el) =>
        el.setAttribute(
          "aria-pressed",
          String(data.synthetic && data.case === el.dataset.outputCase),
        ),
      );
  }
  function options() {
    $("output-prompt").innerHTML =
      '<option value="">All matched prompts</option>' +
      [...data.groups]
        .map(
          ([id, pair]) =>
            `<option value="${esc(id)}">${esc(id)} · ${esc(pair[0][0].prompt.slice(0, 65))}</option>`,
        )
        .join("");
    $("output-prompt").value = prompt ?? "";
    $("output-response-side").innerHTML = data.checkpoints
      .map((name, i) => `<option value="${i}">${esc(name)}</option>`)
      .join("");
  }
  function load(next) {
    data = next;
    domainCache = null;
    prompt = null;
    k = 1;
    bin = null;
    side = 1;
    selected = null;
    cached = null;
    $("output-error").hidden = true;
    options();
    render();
  }
  host.addEventListener("click", (e) => {
    const page = e.target.closest("[data-output-page]");
    if (page) {
      responseOffset = Number(page.dataset.outputPage);
      selected = -1;
      response(stats());
      return;
    }
    const c = e.target.closest("[data-output-case]");
    if (c) {
      load(E.create(c.dataset.outputCase));
      return;
    }
    const bar = e.target.closest("[data-output-bin]");
    if (bar) {
      bin = Number(bar.dataset.outputBin);
      side = Number(bar.dataset.outputSide);
      selected = null;
      render();
      return;
    }
    const row = e.target.closest("[data-output-row]");
    if (row) {
      selected = Number(row.dataset.outputRow);
      response(stats());
      return;
    }
    const p = e.target.closest("[data-output-prompt]");
    if (p) {
      prompt = p.dataset.outputPrompt;
      cached = null;
      bin = null;
      selected = null;
      options();
      render();
      $("output-prompt").scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  });
  host.addEventListener("keydown", (e) => {
    if (
      e.target.matches("[data-output-bin]") &&
      ["Enter", " "].includes(e.key)
    ) {
      e.preventDefault();
      const b = e.target.dataset.outputBin,
        c = e.target.dataset.outputSide;
      e.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      host
        .querySelector(`[data-output-bin="${b}"][data-output-side="${c}"]`)
        ?.focus({ preventScroll: true });
    }
  });
  $("output-prompt").onchange = (e) => {
    prompt = e.target.value || null;
    cached = null;
    bin = null;
    selected = null;
    render();
  };
  $("output-response-side").onchange = (e) => {
    side = Number(e.target.value);
    selected = null;
    render();
  };
  $("output-clear-filter").onclick = () => {
    bin = null;
    selected = null;
    render();
  };
  $("output-k").onchange = (e) => {
    k = Math.max(
      1,
      Math.min(stats().maxK, Math.round(Number(e.target.value) || 1)),
    );
    render();
  };
  $("output-import-button").onclick = () => $("output-file").click();
  $("output-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 5e6) throw Error("Use a file smaller than 5 MB.");
      const next = M.parse(await file.text(), file.name);
      next.name = file.name;
      load(next);
      RewardApp.notify("Loaded locally. Nothing was uploaded.");
    } catch (err) {
      $("output-error").textContent = err.message;
      $("output-error").hidden = false;
    }
    e.target.value = "";
  };
  $("output-template").onclick = () =>
    RewardApp.download("rho-example-outputs.json", {
      name: "Illustrative code responses",
      rows: E.create("judge").rows.map(({ id, ...row }) => row),
    });
  $("output-export").onclick = () => {
    const s = stats();
    RewardApp.download("rho-output-analysis.json", {
      dataset: data.name,
      synthetic: data.synthetic,
      scope: prompt ?? "all",
      aggregate: prompt === null,
      budget: k,
      matched_prompts: s.prompts,
      unmatched_prompts: data.excluded,
      methodology:
        "Equal prompt weights. Finite-pool subset selection; uniform judge ties. No confidence intervals. Tokens exclude prompt and judge costs.",
      checkpoints: s.methods.map(({ rows, ...m }) => ({
        ...m,
        passK: m.curves[k - 1].pass,
        oracle: m.curves[k - 1].oracle,
        selected: m.curves[k - 1].selected,
        outputTokensForBudget: m.tokens === null ? null : m.tokens * k,
      })),
      prompt_metrics: s.promptRows,
      training_domains: data.trainingDomains || [],
      domain_metrics: domainCache,
      domain_interval_methodology:
        "Paired prompt percentile bootstrap, 1200 resamples, fixed seed, n >= 5. Conditional on checkpoints and recorded outputs; no training-seed or within-prompt sampling uncertainty.",
    });
  };
  $("output-share").onclick = async () => {
    if (!data.synthetic) return;
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("case", data.case);
    url.searchParams.set("prompt", prompt ?? "all");
    url.searchParams.set("budget", k);
    url.hash = "outputs";
    try {
      await navigator.clipboard.writeText(url.href);
      RewardApp.notify("Example link copied.");
    } catch {
      const dialog = document.createElement("dialog");
      const input = document.createElement("input");
      input.readOnly = true;
      input.value = url.href;
      input.setAttribute("aria-label", "Example link");
      const close = document.createElement("button");
      close.textContent = "Done";
      close.onclick = () => dialog.close();
      dialog.append(input, close);
      dialog.addEventListener("close", () => dialog.remove());
      document.body.append(dialog);
      dialog.showModal();
      input.select();
    }
  };
  function restore() {
    if (RewardApp.view !== "outputs" || restored) return;
    restored = true;
    const q = new URLSearchParams(location.search);
    if (q.has("case") && Object.hasOwn(E.cases, q.get("case")))
      data = E.create(q.get("case"));
    if (data.groups.has(q.get("prompt"))) prompt = q.get("prompt");
    cached = null;
    domainCache = null;
    k = Math.max(1, Math.round(Number(q.get("budget")) || 1));
    options();
    render();
  }
  document.addEventListener("reward-lab-view-change", restore);
  options();
  render();
  restore();
  return {
    get data() {
      return data;
    },
    get prompt() {
      return prompt;
    },
    get k() {
      return k;
    },
    get stats() {
      return stats();
    },
    load,
    render,
  };
})();
