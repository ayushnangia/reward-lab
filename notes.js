/* Research note: reported evidence, an explicit local approximation, and an evaluation workflow. */
const ResearchNote = (() => {
  const $ = (id) => document.getElementById(id);
  const D = TransferEvidence;
  let source = 1,
    target = 0;
  const host = $("view-notes");
  host.innerHTML = `
    <article class="research-note">
      <header class="note-title">
        <p class="note-dateline">ρ Rho <span> / </span> A working note on reinforcement learning</p>
        <h1>Reward distributions<br>and what transfers</h1>
        <p class="note-deck">How reward weighting affects other outputs from a model.</p>
        <p class="note-byline">Ayush Nangia · September 2026 · <a href="https://github.com/ayushnangia/reward-lab">Code &amp; corrections</a></p>
      </header>
      <nav class="note-contents" aria-label="In this note"><button data-note-jump="note-evidence">1. Measured transfer</button><button data-note-jump="note-update">2. Shared parameters</button><button data-note-jump="note-evaluate">3. Your experiment</button></nav>

      <section id="note-evidence" class="note-section">
        <div class="note-prose"><h2><span>1.</span> Measured transfer</h2><p>In this GRPO study, training on one domain changed performance on others. Read across a row to hold the training data fixed; read down a column to hold the evaluation fixed.</p></div>
        <figure class="note-figure transfer-figure">
          <div class="figure-heading"><span>Reported experiment</span><span>Qwen3-4B-Base · GRPO</span></div>
          <div class="transfer-matrix-layout"><div class="matrix-area"><p class="matrix-axis">Evaluate on →</p><div id="transfer-matrix"></div><div class="matrix-scale"><span>0</span><i></i><span>+80 percentage points</span></div></div><div class="transfer-reading" id="transfer-reading" aria-live="polite"></div></div>
          <figcaption><b>Figure 1.</b> Accuracy change from step 1 to the final step, in percentage points. Click a cell for the underlying scores. Dashed borders mark same-domain evaluation. Transcribed from <a href="https://arxiv.org/html/2602.01365v1#S2">Yang et al., Tables 3–4</a> (CC BY 4.0); no runs were performed here.</figcaption>
          <details class="figure-details"><summary>Experimental context and limits</summary><p>5,000 training examples per domain; 8 responses per prompt; 15 epochs; maximum output length 16K tokens. Baselines differ by run. These tables report no uncertainty intervals. This is one model and setup, not an algorithm ranking. The authors leave the mechanism unresolved.</p><p><a href="https://github.com/uservan/cross_domain">Authors’ code</a> · <button id="transfer-download" class="note-text-button">Download transcribed values</button></p></details>
        </figure>
        <div class="note-prose"><p>Report transfer by prompt, difficulty, or domain; pooled rewards can hide differences between groups. Use the same evaluation protocol for both checkpoints.</p></div>
      </section>

      <section id="note-update" class="note-section">
        <div class="note-prose"><h2><span>2.</span> How the update reaches another answer</h2><p>For a sampled answer <i>y</i> to prompt <i>x</i>, the advantage scales a gradient through the model. Changing that advantage changes the update to shared parameters. It does not directly move a bar in the reward histogram.</p></div>
        <div class="note-equation" aria-label="Parameter update equals learning rate times mean advantage-weighted log probability gradient"><span>Δθ = η <span class="math-mean">mean<sub>i</sub></span> [ A<sub>i</sub> ∇<sub>θ</sub> log π<sub>θ</sub>(y<sub>i</sub> | x) ]</span><small>A single vanilla policy-gradient step, with the sampled batch held fixed.</small></div>
        <figure class="note-figure gradient-figure">
          <div class="figure-heading"><span>Inspect a local update</span><span>Constructed gradients · not a trained language model</span></div>
          <div class="gradient-controls"><label>Group weighting<select id="note-method"><option value="rloo">RLOO</option><option value="grpo">GRPO</option><option value="tailrl" selected>TailRL</option><option value="maxrl">MaxRL (binary)</option></select></label><label>Reward mapping<select id="note-map"><option value="raw">Original scores</option><option value="square">Square scores</option><option value="tail">Compress bulk, stretch tail</option></select></label></div>
          <div class="gradient-layout"><div class="weight-column"><p class="figure-label">One observed group, four answers</p><div id="note-weights"></div><p class="figure-small" id="note-weight-description"></p></div><div class="geometry-column"><div id="note-geometry"></div><div class="geometry-buttons"><button data-alignment="1">Aligned</button><button data-alignment="0">Orthogonal</button><button data-alignment="-1">Opposed</button></div></div></div>
          <div class="gradient-readout"><label for="note-angle">Direction of another answer’s gradient <output id="note-angle-value"></output><input id="note-angle" type="range" min="-180" max="180" step="1" value="40"></label><p id="note-change" aria-live="polite"></p></div>
          <figcaption><b>Figure 2.</b> Black: the mean advantage-weighted gradient. Blue: the log-probability gradient of an answer to another prompt. Their inner product determines the first-order response. Reward weighting and gradient geometry are separate controls.</figcaption>
          <details class="figure-details"><summary>What this calculation assumes</summary><p>The four answer gradients come from a two-parameter categorical softmax at a fixed checkpoint. The observed group contains each answer once. The other answer’s unit gradient is supplied by the angle control. We compute Δ log π ≈ ∇ log π · Δθ with η = 0.1. This local Taylor approximation does not predict held-out accuracy or a full training trajectory.</p><p>The weighting rules use the same code as the algorithm lab. This figure isolates their weights inside a vanilla update; it does not reproduce complete GRPO, TailRL, or MaxRL training. PPO clipping, optimizer preconditioning, KL penalties, token masks, and subsequent sampling can change the step. GRPO and RLOO weights here are proportional for a fixed reward group; changing their scale does not by itself change direction.</p></details>
        </figure>
        <div class="note-prose"><p>If the other answer’s gradient points along the update, its log-probability rises locally. If it points against the update, it falls. If the directions are orthogonal, the first-order change is zero. Whether that answer is <em>correct</em> is a separate evaluation.</p><p>This is why changing tail weights alone cannot guarantee transfer. A recent curriculum method uses projected training-gradient alignment as a local transfer signal, while measuring end-to-end performance separately. <a href="https://arxiv.org/html/2606.25178v1#S3.SS3">[2]</a></p>
        <details class="note-aside"><summary>What about the gap or second mode in the tail?</summary><p>For a smooth increasing map z = f(r), density changes as p<sub>Z</sub>(z) = p<sub>R</sub>(r) / f′(r). A steep tail slope spreads the same probability over a wider score range, making that region look thinner. A continuous piecewise map with positive finite slopes preserves connected support; a jump in the map can create an actual empty score interval.</p><p>A density valley is not the same as an empty interval. Positive-slope maps can change density shape, and pooling different prompt difficulties can produce multiple modes. Training can also change which answers the model samples. Check the mapping, then the per-prompt outputs, before calling it a lost capability.</p><p><a href="#shaping">Inspect piecewise maps</a> · <a href="#outputs">Inspect conditional output distributions</a></p></details></div>
      </section>

      <section id="note-evaluate" class="note-section">
        <div class="note-prose"><h2><span>3.</span> Test transfer on your own run.</h2><p>Choose the training domain before the run. Evaluate the same held-out prompts before and after it. Keep an in-domain test set and at least one target domain separate. Record the reward used for training alongside an independent outcome measure.</p></div>
        <div class="note-eval-flow"><div><span>Train</span><strong>Source prompts</strong><small>Rollouts → rewards → update</small></div><span class="flow-arrow" aria-hidden="true">→</span><div><span>Freeze checkpoint</span><strong>Same evaluation suite</strong><small>Before &amp; after · fixed decoding</small></div><span class="flow-arrow" aria-hidden="true">→</span><div><span>Compare</span><strong>Each target domain</strong><small>Correctness · coverage · cost</small></div></div>
        <div class="note-prose"><p>The output viewer accepts your recorded responses. Add <code>domain</code> and <code>split</code> to separate train, validation, and test results. It reports paired prompt changes and a prompt-bootstrap interval where there are at least five matched prompts. It cannot establish that a supplied test label is leak-free.</p><p class="note-import-actions"><button id="note-import">Open your evaluation file</button><a href="OUTPUT_FORMAT.md">File format</a><a href="#outputs">View constructed examples</a></p><p class="figure-small">Import CSV, JSON, or JSONL. The file stays in this browser tab.</p></div>
        <div class="research-questions"><h3>What to report alongside the gain</h3><dl><div><dt>Generalization</dt><dd>Per-domain and per-difficulty results, held-out prompts, contamination checks, and multiple training seeds.</dd></div><div><dt>Coverage</dt><dd>Pass@1 and pass@k at matched budgets, lost successes, lower-tail failures, and solution families.</dd></div><div><dt>Reward validity</dt><dd>Disagreement between the training judge and independent evaluation; failures selected by best-of-k.</dd></div><div><dt>Optimization &amp; cost</dt><dd>KL, entropy, advantage variance, clipping, gradient norms, rollout tokens, and verifier calls. Output files alone cannot recover optimizer logs.</dd></div></dl></div>
      </section>
      <section class="note-tools"><h2>Related experiments</h2><p><a href="#discover">Sampling and best-of-k</a><span> How inference budget changes what you can find.</span></p><p><a href="#lab">Policy-learning experiments</a><span> Inspect updates in finite policies with explicit assumptions.</span></p><p><a href="#shaping">Reward transformations</a><span> Log, power, rank, and piecewise maps.</span></p><p><a href="#experiments">Paired sweeps</a><span> Compare sensitivity across distributions and seeds.</span></p></section>
      <footer class="note-footer"><p>Sources: <a href="https://arxiv.org/abs/2602.01365">[1] When Domains Interact</a> · <a href="https://arxiv.org/abs/2606.25178">[2] Transferability for General Reasoning</a> · <a href="https://arxiv.org/abs/2609.02987">TailRL</a> · <a href="https://arxiv.org/abs/2107.03374">Pass@k estimation</a></p><p>Reading and visual references: <a href="https://rlhfbook.com/">RLHF Book</a>, <a href="https://cmu-aire.github.io/pages/blog1.html">CMU AIRe</a>, and <a href="https://lilianweng.github.io/posts/2024-11-28-reward-hacking/">Lilian Weng</a>. Independent project; no affiliation.</p><p><a href="https://github.com/ayushnangia/reward-lab">Source code · MIT</a> <span> / </span> <a href="#guide">Equations and implementation scope</a></p></footer>
    </article>`;
  function matrix() {
    $("transfer-matrix").innerHTML =
      `<table class="transfer-table"><thead><tr><th scope="col">Train on ↓</th>${D.domains.map((d) => `<th scope="col">${d}</th>`).join("")}</tr></thead><tbody>${D.results.map((row, i) => `<tr><th scope="row">${D.domains[i]}</th>${row.map(([a, b], j) => `<td><button data-transfer-cell="${i},${j}" aria-pressed="${i === source && j === target}" aria-label="Train ${D.domains[i]}, evaluate ${D.domains[j]}: ${(b - a).toFixed(2)} percentage point gain" style="--cell-tint:${0.08 + Math.sqrt((b - a) / 80) * 0.55}" class="${i === j ? "same-domain" : ""}">+${(Math.round((b - a) * 10 + 1e-8) / 10).toFixed(1)}</button></td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const [a, b] = D.results[source][target];
    $("transfer-reading").innerHTML =
      `<p class="reading-path">${D.domains[source]} <span>→</span> ${D.domains[target]}</p><p class="reading-kind">${source === target ? "Within-domain evaluation" : "Cross-domain evaluation"}</p><strong class="reading-delta">+${(b - a).toFixed(2)}<small>percentage points</small></strong><div class="reported-bars"><div><span>Step 1</span><i style="width:${a}%"></i><b>${a.toFixed(2)}%</b></div><div><span>Final</span><i style="width:${b}%"></i><b>${b.toFixed(2)}%</b></div></div><p class="figure-small">Accuracy on ${D.benchmarks[target]}. Each run uses its own step-1 baseline.</p>`;
  }
  function gradient() {
    const raw = [0, 0.35, 0.65, 1],
      method = $("note-method").value,
      mapping = $("note-map").value;
    $("note-map").disabled = method === "maxrl";
    const scores = raw.map((r) =>
      method === "maxrl"
        ? Number(r >= 0.9)
        : mapping === "square"
          ? r * r
          : mapping === "tail"
            ? (0.4 * Math.min(r, 0.7) + 3 * Math.max(0, r - 0.7)) / 1.18
            : r,
    );
    const weights = RewardLab.advantage(scores, method);
    const g = TransferMath.geometry(weights, Number($("note-angle").value));
    $("note-weights").innerHTML =
      `<table class="weight-table"><thead><tr><th>Answer</th><th>Score</th><th>Used</th><th>Weight A<sub>i</sub></th></tr></thead><tbody>${weights.map((w, i) => `<tr><th>${["A", "B", "C", "D"][i]}</th><td>${raw[i].toFixed(2)}</td><td>${scores[i].toFixed(2)}</td><td><span class="weight-mark" style="--weight:${Math.min(50, Math.abs(w) * 18)}%;--weight-color:${w < 0 ? "var(--n-rust)" : "var(--n-blue)"};--weight-left:${w < 0 ? 50 - Math.min(50, Math.abs(w) * 18) : 50}%"></span><b>${w >= 0 ? "+" : ""}${w.toFixed(2)}</b></td></tr>`).join("")}</tbody></table>`;
    $("note-weight-description").textContent = {
      rloo: "Subtract the mean reward of the other answers.",
      grpo: "Center by the group mean, then divide by its standard deviation.",
      tailrl:
        "Accumulate score increments with inverse empirical-tail weights, then center.",
      maxrl:
        "Threshold at 0.9, center binary rewards, then divide by group success rate. The score map is bypassed.",
    }[method];
    const scale = 107 / Math.max(1, g.magnitude),
      origin = [130, 145],
      pt = (v) => [origin[0] + v[0] * scale, origin[1] - v[1] * scale];
    const p = pt(g.update),
      q = pt(g.target);
    $("note-geometry").innerHTML =
      `<svg viewBox="0 0 310 270" role="img" aria-label="Parameter update and another answer’s gradient. Cosine ${g.cosine.toFixed(2)}"><defs><marker id="note-black-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--n-ink)"/></marker><marker id="note-blue-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--n-blue)"/></marker></defs><circle cx="130" cy="145" r="107" class="geometry-ring"/><path d="M15 145 H267 M130 27 V260" class="geometry-axis"/><text x="277" y="149" class="geometry-axis-label">θ₁</text><text x="138" y="29" class="geometry-axis-label">θ₂</text><line x1="130" y1="145" x2="${p[0]}" y2="${p[1]}" stroke="var(--n-ink)" stroke-width="3" marker-end="url(#note-black-arrow)"/><line x1="130" y1="145" x2="${q[0]}" y2="${q[1]}" stroke="var(--n-blue)" stroke-width="2.5" marker-end="url(#note-blue-arrow)"/><circle cx="130" cy="145" r="3" fill="var(--n-ink)"/><text x="10" y="15" fill="var(--n-ink)" class="geometry-label">Weighted gradient and local response</text></svg><p class="geometry-legend"><span>● Weighted gradient</span><span>● Other answer’s gradient</span></p>`;
    $("note-angle-value").textContent = $("note-angle").value + "°";
    $("note-change").innerHTML =
      `<span>First-order Δ log π</span><strong class="${g.change < -0.0005 ? "negative-change" : ""}">${Math.abs(g.change) < 0.0005 ? "≈ 0" : (g.change > 0 ? "+" : "") + g.change.toFixed(3)}</strong><small>${Math.abs(g.cosine) < 0.02 ? "Almost no local change" : g.change > 0 ? "This answer becomes more likely locally" : "This answer becomes less likely locally"} · cosine ${g.cosine.toFixed(2)}</small>`;
    return g;
  }
  host.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-transfer-cell]");
    if (cell) {
      [source, target] = cell.dataset.transferCell.split(",").map(Number);
      matrix();
      $("transfer-matrix")
        .querySelector(`[data-transfer-cell="${source},${target}"]`)
        .focus({ preventScroll: true });
    }
    const jump = e.target.closest("[data-note-jump]");
    if (jump)
      $(jump.dataset.noteJump).scrollIntoView({
        behavior: "instant",
        block: "start",
      });
    const align = e.target.closest("[data-alignment]");
    if (align) {
      const g = gradient(),
        a =
          (Math.atan2(g.update[1], g.update[0]) * 180) / Math.PI +
          (align.dataset.alignment === "1"
            ? 0
            : align.dataset.alignment === "0"
              ? 90
              : 180);
      $("note-angle").value = Math.round(((a + 540) % 360) - 180);
      gradient();
    }
  });
  $("note-method").onchange = gradient;
  $("note-map").onchange = gradient;
  $("note-angle").oninput = gradient;
  $("note-import").onclick = () => {
    location.hash = "outputs";
    $("output-file").click();
  };
  $("transfer-download").onclick = () =>
    RewardApp.download("reported-grpo-transfer.json", {
      source: D.source,
      attribution: "Yang et al., arXiv:2602.01365v1, Tables 3–4, CC BY 4.0",
      metric: "accuracy_percent",
      baseline: "step 1 of each run",
      training_domains: D.domains,
      evaluation_domains: D.domains,
      benchmarks: D.benchmarks,
      step1_final_pairs: D.results,
    });
  matrix();
  gradient();
  return { gradient };
})();
