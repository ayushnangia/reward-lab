const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  fs.mkdirSync(".qa", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  // Observe the native Web Audio calls, so this checks the audible mapping as well as the button.
  await page.addInitScript(() => {
    window.audioTrace = { tones: [], envelopes: [] };
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      createOscillator() {
        const oscillator = super.createOscillator(),
          trace = { frequency: 0, stops: [] };
        window.audioTrace.tones.push(trace);
        const start = oscillator.start.bind(oscillator),
          stop = oscillator.stop.bind(oscillator);
        oscillator.start = (at) => {
          trace.frequency = oscillator.frequency.value;
          trace.start = at;
          start(at);
        };
        oscillator.stop = (at) => {
          trace.stops.push(at);
          stop(at);
        };
        return oscillator;
      }
      createGain() {
        const gain = super.createGain(),
          values = [];
        window.audioTrace.envelopes.push(values);
        const ramp = gain.gain.linearRampToValueAtTime.bind(gain.gain);
        gain.gain.linearRampToValueAtTime = (value, at) => {
          values.push(value);
          return ramp(value, at);
        };
        return gain;
      }
    };
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) =>
    errors.push(r.url() + ": " + r.failure().errorText),
  );
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  try {
    const base = process.env.QA_URL || "http://127.0.0.1:8766/";
    await page.goto(base);
    await page.waitForFunction(() => window.Rho);
    assert.deepEqual(
      await page
        .locator("#settings math annotation, #inspector th math annotation")
        .allTextContents(),
      [String.raw`\lambda`, String.raw`\epsilon`, "A_i"],
    );
    assert.equal(await page.locator(".site-header nav a").count(), 2);
    assert.equal(await page.locator(".algorithm-card").count(), 3);
    assert.equal(await page.evaluate(() => Rho.state.shown), 0);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => Rho.state.shown), 0);
    assert.equal(await page.evaluate(() => Rho.state.sound), false);
    assert.equal(await page.evaluate(() => audioTrace.tones.length), 0);
    assert.equal(
      (await page.locator("#step").textContent()).trim(),
      "Next step",
    );
    assert(await page.locator("#previous").isDisabled());
    await page.locator("#step").click();
    assert.equal(await page.evaluate(() => Rho.state.shown), 1);
    const firstFrame = await page.evaluate(() => Rho.state.sim.history[1]);
    await page.locator("#previous").click();
    assert.equal(await page.evaluate(() => Rho.state.shown), 0);
    assert(await page.locator("#previous").isDisabled());
    await page.locator("#step").click();
    assert.equal(await page.evaluate(() => Rho.state.shown), 1);
    assert.equal(await page.evaluate(() => Rho.state.sim.step), 1);
    assert.deepEqual(
      await page.evaluate(() => Rho.state.sim.history[1]),
      firstFrame,
    );
    const firstBatch = await page.evaluate(() => Rho.state.batches[1].grpo);
    await page.evaluate(() => {
      for (let i = 0; i < 24; i++) document.querySelector("#step").click();
    });
    assert.deepEqual(
      await page.evaluate(() => Rho.state.batches[1].grpo),
      firstBatch,
    );
    // Bar heights and displayed metrics must agree with the actual engine, including replay.
    await page.locator("#previous").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => Rho.state.shown), 24);
    assert.equal(await page.evaluate(() => Rho.state.sim.step), 25);
    await page.locator("#replay").fill("7");
    assert.equal(await page.evaluate(() => Rho.state.shown), 7);
    assert.equal(await page.evaluate(() => Rho.state.sim.step), 25);
    await page.locator("#step").click();
    assert.equal(await page.evaluate(() => Rho.state.shown), 8);
    await page.locator("#replay").fill("100");
    assert.equal(await page.evaluate(() => Rho.state.shown), 25);
    await page.waitForTimeout(500);
    assert(
      await page.evaluate(() =>
        [...document.querySelectorAll(".algorithm-card")].every((card) => {
          const state =
            Rho.state.sim.history[Rho.state.shown].methods[card.dataset.method];
          return (
            [...card.querySelectorAll(".bar")].every(
              (bar, i) =>
                Math.abs(
                  Number(bar.getAttribute("height")) - 170 * state.p[i],
                ) < 1e-9,
            ) &&
            card.querySelector('[data-metric="mean"]').textContent ===
              state.metrics.mean.toFixed(3)
          );
        }),
      ),
    );
    await page.screenshot({
      path: ".qa/visualizer-desktop.png",
      fullPage: true,
    });
    const beforeSpeed = await page.evaluate(() =>
      JSON.stringify([Rho.state.cfg, Rho.state.sim.history]),
    );
    for (const [index, pace] of [4800, 2400, 1200, 600, 400, 300].entries()) {
      await page.locator(`[data-speed="${index}"]`).click();
      assert.equal(
        await page
          .locator(`[data-speed="${index}"]`)
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(await page.locator("#speed").inputValue(), String(index));
      assert.equal(await page.evaluate(() => Rho.state.pace), pace);
      assert.equal(
        await page.locator("#speed-value").textContent(),
        `${1200 / pace}×`,
      );
    }
    await page.locator("#speed-reset").click();
    assert.equal(await page.evaluate(() => Rho.state.pace), 1200);
    assert(await page.locator("#speed-reset").isDisabled());
    await page.locator("#speed").focus();
    await page.keyboard.press("Home");
    assert.equal(await page.evaluate(() => Rho.state.pace), 4800);
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => Rho.state.pace), 2400);
    await page.keyboard.press("End");
    assert.equal(await page.evaluate(() => Rho.state.pace), 300);
    const speedTrack = await page.locator("#speed").boundingBox();
    const speedY = speedTrack.y + speedTrack.height / 2;
    await page.mouse.move(speedTrack.x + speedTrack.width - 6, speedY);
    await page.mouse.down();
    await page.mouse.move(
      speedTrack.x + 6 + (speedTrack.width - 12) * 0.4,
      speedY,
      { steps: 8 },
    );
    await page.mouse.up();
    assert.equal(await page.evaluate(() => Rho.state.pace), 1200);
    await page.locator('[data-speed="5"]').click();
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify([Rho.state.cfg, Rho.state.sim.history]),
      ),
      beforeSpeed,
    );
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#save-image").click();
    const download = await downloadPromise;
    await download.saveAs(".qa/export.png");
    assert(fs.statSync(".qa/export.png").size > 10000);
    await page.locator("#share").click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    assert(link.includes("setup="));
    const fresh = await browser.newPage();
    await fresh.goto(link);
    await fresh.waitForFunction(() => window.Rho);
    assert.equal(await fresh.evaluate(() => Rho.state.shown), 0);
    assert.deepEqual(
      await fresh.evaluate(() => Rho.state.cfg),
      await page.evaluate(() => Rho.state.cfg),
    );
    assert.equal(await fresh.evaluate(() => Rho.state.pace), 300);
    await fresh.close();
    await page.locator("#speed").fill("2");
    await page.locator("#reset").click();
    await page.locator("#sound").click();
    assert.equal(await page.evaluate(() => Rho.state.sound), true);
    async function checkSound() {
      const result = await page.evaluate(() => {
        const p =
          Rho.state.sim.history[Rho.state.shown].methods[Rho.state.focus].p;
        const audible = p
          .map((value, i) => ({ value, i }))
          .filter((x) => x.value > 0);
        return {
          expected: audible.map(({ value, i }) => [
            130.81278265 * 2 ** (3 * Math.sqrt(value)),
            0.02 + 0.14 * Math.sqrt(value),
          ]),
          actual: audioTrace.tones
            .slice(-audible.length)
            .map((tone, i) => [
              tone.frequency,
              Math.max(...audioTrace.envelopes.slice(-audible.length)[i]),
            ]),
        };
      });
      result.actual.forEach((pair, i) =>
        pair.forEach((v, j) =>
          assert(Math.abs(v - result.expected[i][j]) < 1e-4),
        ),
      );
      return result.actual;
    }
    const startingSound = await checkSound();
    await page.waitForFunction(
      () => document.querySelectorAll(".bar.sounding").length === 1,
    );
    assert(
      await page.evaluate(() => {
        const bar = document.querySelector(".bar.sounding"),
          card = bar.closest("[data-method]");
        return (
          card.dataset.method === Rho.state.focus &&
          Number(card.querySelector(".sound-cursor").getAttribute("x1")) ===
            38 + 14 * Number(bar.dataset.bin)
        );
      }),
    );
    await page.screenshot({ path: ".qa/sound-cursor.png", fullPage: true });
    await page.locator('[data-method="grpo"] .select-method').click();
    assert.deepEqual(await checkSound(), startingSound);
    await page.locator("#step").click();
    await checkSound();
    await page.locator("#speed").fill("5");
    await page.locator("#previous").click();
    assert.deepEqual(await checkSound(), startingSound);
    const fastTones = await page.evaluate(() => audioTrace.tones.slice(-21));
    assert(Math.abs(fastTones[20].start - fastTones[0].start - 0.5) < 1e-6);
    assert(
      Math.abs(fastTones[0].stops[0] - fastTones[0].start - 0.085 / 4) < 1e-6,
    );
    await page.locator("#step").click();
    await checkSound();
    await page.locator("#speed").fill("2");
    // Compare exact start/current states, with enough silence to distinguish the two scans.
    await page.locator("#listen-compare").click();
    const comparisonTones = await page.evaluate(() =>
      audioTrace.tones.slice(-42),
    );
    assert.equal(comparisonTones.length, 42);
    assert(
      Math.abs(comparisonTones[21].start - comparisonTones[0].start - 2.55) <
        1e-6,
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#sound-reading").textContent ===
        "Start distribution",
    );
    assert(await page.locator(".initial-bar.sounding").count());
    await page.waitForFunction(
      () =>
        document.querySelector("#sound-reading").textContent ===
        "Current · update 1",
    );
    assert(await page.locator(".bar.sounding").count());
    await page.locator("#listen-current").click();
    assert.equal(await page.locator(".reward-plot .sounding").count(), 0);
    assert.equal(
      (await page.locator("#listen-current").textContent()).trim(),
      "Listen",
    );
    await page.locator("#previous").click();
    assert.deepEqual(await checkSound(), startingSound);
    // Retime an audible scan in place, retaining the same probability-to-pitch mapping.
    await page.locator("#speed").fill("0");
    await page.waitForFunction(
      () => Number(document.querySelector(".bar.sounding")?.dataset.bin) >= 3,
    );
    const beforeRetime = await page.evaluate(() => ({
      tones: audioTrace.tones.length,
      history: Rho.state.sim.history,
    }));
    await page.locator("#speed").fill("5");
    const retimed = await page.evaluate(
      (start) => ({
        tones: audioTrace.tones.slice(start),
        notes: RhoAudio.notes(
          Rho.state.sim.history[0].methods[Rho.state.focus].p,
        ),
        history: Rho.state.sim.history,
      }),
      beforeRetime.tones,
    );
    assert(retimed.tones.length > 0 && retimed.tones.length < 18);
    const nextBin = 21 - retimed.tones.length;
    assert(
      Math.abs(retimed.tones[0].frequency - retimed.notes[nextBin].frequency) <
        1e-4,
    );
    assert(
      Math.abs(retimed.tones[0].stops[0] - retimed.tones[0].start - 0.085 / 4) <
        1e-6,
    );
    assert.deepEqual(retimed.history, beforeRetime.history);
    await page.locator("#listen-current").click();
    await page.locator("#speed-reset").click();
    await page.locator("#replay").fill("1");
    await page.locator('[data-method="ppo"] .select-method').click();
    await checkSound();
    assert(
      (await page.locator("#sound-key").textContent()).startsWith("PPO sound:"),
    );
    // A gap is actually silent: only nonzero bins schedule tones.
    await page.locator("#preset").selectOption("missing");
    const beforeGap = await page.evaluate(() => audioTrace.tones.length);
    await page.locator('[data-method="grpo"] .select-method').click();
    const gapSound = await checkSound();
    assert(gapSound.length < 21);
    assert.equal(
      (await page.evaluate(() => audioTrace.tones.length)) - beforeGap,
      gapSound.length,
    );
    await page.locator("#sound").click();
    await page.waitForTimeout(60);
    assert.equal(await page.locator(".bar.sounding").count(), 0);
    assert(await page.locator("#sound-key").isHidden());
    await page.locator("#preset").selectOption("bell");
    await page.locator("#sound").click();
    await page.locator("#play").click();
    await page.waitForFunction(() => Rho.state.phase === "weight");
    await page.locator("#play").click();
    assert.equal(await page.evaluate(() => Rho.state.playing), false);
    assert.equal(await page.evaluate(() => Rho.state.pending), false);
    assert.equal(await page.evaluate(() => Rho.state.shown), 1);
    assert.equal(await page.locator(".bar.sounding").count(), 0);
    await page.locator("#sound").click();
    // Settings validate before replacing a run. A selected custom preset can be cancelled.
    await page.locator("#advanced > summary").click();
    await page.locator("#lr").fill("");
    await page.locator("#settings button[type=submit]").click();
    assert(await page.locator("#settings-error").isVisible());
    assert.equal(await page.evaluate(() => Rho.state.shown), 1);
    await page.locator("#close-advanced").click();
    await page.locator("#preset").selectOption("custom");
    assert(await page.locator("#distribution-editor").isVisible());
    assert.equal(await page.locator("#advanced").getAttribute("open"), null);
    assert(await page.locator("#custom").isHidden());
    await page.locator("#paste-samples > summary").click();
    await page.locator("#custom").fill("invalid");
    await page.locator("#load-samples").click();
    assert(await page.locator("#distribution-error").isVisible());
    assert.equal(await page.evaluate(() => Rho.state.shown), 1);
    await page.locator("#cancel-distribution").click();
    assert.equal(await page.locator("#preset").inputValue(), "bell");

    // The visual editor normalizes only on apply; pointer and keyboard edits share weights.
    await page.locator("#edit-distribution").click();
    await page.locator("#clear-distribution").click();
    await page.locator("#apply-distribution").click();
    assert(await page.locator("#distribution-error").isVisible());
    assert.equal(await page.evaluate(() => Rho.state.shown), 1);
    const drawing = await page.locator("#distribution-draw").boundingBox();
    const drawX = (i) => drawing.x + (drawing.width * (i + 0.5)) / 21;
    await page.mouse.move(drawX(4), drawing.y + drawing.height / 2);
    await page.mouse.down();
    await page.mouse.move(drawX(8), drawing.y + drawing.height / 4);
    await page.mouse.up();
    for (let i = 4; i <= 8; i++)
      assert(
        Math.abs(
          Number(
            await page
              .locator(`[data-draw-bin="${i}"]`)
              .getAttribute("aria-valuenow"),
          ) -
            (50 + (i - 4) * 6.25),
        ) < 0.1,
      );
    await page.locator('[data-draw-bin="8"]').press("Home");
    await page.locator('[data-draw-bin="8"]').press("ArrowRight");
    assert(
      await page
        .locator('[data-draw-bin="9"]')
        .evaluate((el) => el === document.activeElement),
    );
    await page.locator('[data-draw-bin="9"]').press("End");
    await page.locator("#apply-distribution").click();
    const edited = await page.evaluate(() => Rho.state.sim.base);
    assert.equal(edited[8], 0);
    assert(
      Math.abs(edited[9] - 1 / (0.5 + 0.5625 + 0.625 + 0.6875 + 1)) < 0.001,
    );
    assert.equal(await page.evaluate(() => Rho.state.shown), 0);
    await page.locator("#edit-distribution").click();
    await page.locator('[data-shape="rare"]').click();
    await page.locator("#apply-distribution").click();
    assert(
      Math.abs((await page.evaluate(() => Rho.state.sim.base[20])) - 0.001) <
        1e-15,
    );
    await page.locator("#share").click();
    const customLink = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    const customPage = await browser.newPage();
    await customPage.goto(customLink);
    await customPage.waitForFunction(() => window.Rho);
    assert.deepEqual(
      await customPage.evaluate(() => Rho.state.sim.base),
      await page.evaluate(() => Rho.state.sim.base),
    );
    await customPage.close();
    await page.locator("#edit-distribution").click();
    await page.locator("#paste-samples > summary").click();
    await page.locator("#custom").fill("0.2,0.2,1");
    await page.locator("#load-samples").click();
    await page.locator("#apply-distribution").click();
    assert(
      Math.abs((await page.evaluate(() => Rho.state.sim.base[4])) - 2 / 3) <
        1e-15,
    );
    await page.locator("#preset").selectOption("bell");
    await page.locator("#advanced > summary").click();
    for (const cb of await page.locator("[name=method]").all())
      await cb.check();
    await page.locator("#speed").fill("4");
    await page.locator("#horizon").selectOption("25");
    await page.locator("#settings button[type=submit]").click();
    assert.equal(await page.locator(".algorithm-card").count(), 10);
    while (await page.locator("#previous-charts").isEnabled())
      await page.locator("#previous-charts").click();
    const allCharts = [];
    do {
      allCharts.push(
        ...(await page
          .locator(".algorithm-card:visible")
          .evaluateAll((cards) => cards.map((card) => card.dataset.method))),
      );
      assert((await page.locator(".algorithm-card:visible").count()) <= 3);
      if (await page.locator("#next-charts").isDisabled()) break;
      await page.locator("#next-charts").click();
    } while (true);
    assert.deepEqual(allCharts, await page.evaluate(() => Rho.state.methods));
    assert.equal(await page.evaluate(() => Rho.state.sim.step), 0);
    assert.equal(
      await page.locator("#chart-page").textContent(),
      "10–10 of 10",
    );
    await page.locator("#speed").fill("0");
    await page.locator("#play").click();
    const firstRunningFrame = await page.evaluate(
      () => Rho.state.sim.history[1],
    );
    await page.locator("#speed").fill("5");
    await page.waitForFunction(() => Rho.state.phase !== "sample", null, {
      timeout: 800,
    });
    assert.equal(await page.evaluate(() => Rho.state.playing), true);
    assert.deepEqual(
      await page.evaluate(() => Rho.state.sim.history[1]),
      firstRunningFrame,
    );
    await page.waitForFunction(
      () => Rho.state.shown === 25 && !Rho.state.playing,
      null,
      { timeout: 20000 },
    );
    assert.equal(await page.evaluate(() => Rho.state.sim.history.length), 26);
    assert(
      await page.evaluate(() =>
        Object.values(Rho.state.sim.history.at(-1).methods).every(
          (m) =>
            m.p.every(Number.isFinite) &&
            Math.abs(m.p.reduce((a, b) => a + b) - 1) < 1e-10,
        ),
      ),
    );
    await page.locator("#play").click();
    assert.equal(await page.evaluate(() => Rho.state.sim.step), 25);
    await page.locator("#play").click();
    // Paper routes, clipping in both directions, and the runnable zero-signal edge case.
    await page.locator("#nav-algorithms").click();
    await page.waitForSelector("#algorithms:visible");
    assert.equal(
      await page.locator("#algorithm-select").inputValue(),
      "basics",
    );
    await page.locator(".reading-nav a").click();
    await page.waitForFunction(
      () => document.querySelector("#algorithm-select").value === "reinforce",
    );
    await page.locator('[data-algorithm="grpo"]').click();
    await page.waitForSelector("#clip-ratio");
    assert(
      (await page.locator("#clip-reading").textContent()).includes(
        "slope is zero",
      ),
    );
    await page.locator("#clip-sign").selectOption("-1");
    await page.locator("#clip-ratio").fill("0.5");
    assert(
      (await page.locator("#clip-reading").textContent()).includes(
        "slope is zero",
      ),
    );
    await page.locator("#clip-ratio").fill("1.4");
    assert(
      (await page.locator("#clip-reading").textContent()).includes("slope −1"),
    );
    assert.equal(
      await page.locator("#clip-reading math annotation").textContent(),
      "q = 1.40",
    );
    await page.locator("#clip-ratio").fill("0.8");
    assert(
      (await page.locator("#clip-reading").textContent()).includes(
        "corner of the surrogate",
      ),
    );
    await page.locator("#clip-sign").selectOption("1");
    await page.locator("#clip-ratio").fill("1.2");
    assert(
      (await page.locator("#clip-reading").textContent()).includes(
        "corner of the surrogate",
      ),
    );
    await page.locator("#try-example").click();
    await page.waitForSelector("#visualizer:visible");
    await page.locator("#step").click();
    assert.equal(await page.evaluate(() => Rho.state.cfg.preset), "zero");
    assert(
      await page.evaluate(() =>
        Rho.state.sim.last.grpo.adv.every((v) => v === 0),
      ),
    );
    await page.locator("#advanced > summary").click();
    await page.locator("#defaults").click();
    // Every lesson exposes the arithmetic, runs the real update and leaves the main run alone.
    const mainBeforeLessons = await page.evaluate(() =>
      JSON.stringify(Rho.state.sim.history),
    );
    const expectedWeights = {
      reinforce: [0.2, 0.5, 1],
      rloo: [-0.55, -0.1, 0.65],
      a2c: [-0.2, 0.1, 0.6],
      ppo: [-0.2, 0.1, 0.6],
      grpo: [-1.111, -0.202, 1.313],
      trpo: [-0.55, -0.1, 0.65],
      maxrl: [-1, -1, 2],
      pkpo: [0, 0.3, 1.3],
      tailrl: [-0.8, -0.35, 1.15],
      elite: [0, 0, 3],
    };
    for (const [id, expected] of Object.entries(expectedWeights)) {
      await page.evaluate((id) => (location.hash = "algorithms/" + id), id);
      await page.waitForFunction(
        (id) => document.querySelector("#algorithm-select").value === id,
        id,
      );
      assert(await page.locator("#lesson-previous").isDisabled());
      assert.deepEqual(await page.locator(".lesson-weight").allTextContents(), [
        "—",
        "—",
        "—",
      ]);
      await page.locator("#lesson-next").click();
      const weights = (
        await page.locator(".lesson-weight").allTextContents()
      ).map(Number);
      weights.forEach((v, i) =>
        assert(Math.abs(v - expected[i]) < 0.001, id + ": worked weight"),
      );
      assert.deepEqual(
        await page.locator(".lesson-probability").allTextContents(),
        ["33.3%", "33.3%", "33.3%"],
      );
      await page.locator("#lesson-next").click();
      const after = (
        await page.locator(".lesson-probability").allTextContents()
      ).map(parseFloat);
      assert(Math.abs(after.reduce((a, b) => a + b, 0) - 100) < 0.11);
      assert(after[2] > after[0], id + ": preference for C");
      if (!["ppo", "grpo", "trpo"].includes(id)) {
        const exp = weights.map((w) => Math.exp((0.5 * w) / 3)),
          sum = exp.reduce((a, b) => a + b, 0);
        after.forEach((v, i) =>
          assert(
            Math.abs(v - (100 * exp[i]) / sum) < 0.06,
            id + ": softmax update",
          ),
        );
      }
      assert(await page.locator("#lesson-next").isDisabled());
      await page.locator("#lesson-previous").click();
      await page.locator("#lesson-next").click();
      assert.deepEqual(
        (await page.locator(".lesson-probability").allTextContents()).map(
          parseFloat,
        ),
        after,
      );
      await page.locator("#lesson-map").selectOption("affine");
      await page.locator("#lesson-next").click();
      const affine = (
        await page.locator(".lesson-weight").allTextContents()
      ).map(Number);
      const expectAffine = ["grpo", "maxrl", "elite"].includes(id)
        ? expected
        : id === "reinforce"
          ? [1.4, 2, 3]
          : ["ppo", "a2c"].includes(id)
            ? [1, 1.6, 2.6]
            : expected.map((v) => v * 2);
      affine.forEach((v, i) =>
        assert(Math.abs(v - expectAffine[i]) < 0.001, id + ": affine weights"),
      );
      await page.locator("#lesson-map").selectOption("identity");
      await page.locator("#lesson-group").selectOption("tied");
      await page.locator("#lesson-next").click();
      assert.deepEqual(
        (await page.locator(".lesson-weight").allTextContents()).map(Number),
        Array(3).fill(
          id === "reinforce" ? 0.5 : ["a2c", "ppo"].includes(id) ? 0.1 : 0,
        ),
      );
      await page.locator("#lesson-next").click();
      assert.deepEqual(
        await page.locator(".lesson-probability").allTextContents(),
        ["33.3%", "33.3%", "33.3%"],
      );
      if (["tailrl", "maxrl"].includes(id)) {
        await page.locator("#lesson-group").selectOption("binary");
        await page.locator("#lesson-next").click();
        assert.deepEqual(
          (await page.locator(".lesson-weight").allTextContents()).map(Number),
          [-1, -1, 2],
        );
        await page.locator("#lesson-group").selectOption("success");
        await page.locator("#lesson-next").click();
        assert.deepEqual(
          (await page.locator(".lesson-weight").allTextContents()).map(Number),
          [0, 0, 0],
        );
      }
    }
    assert.equal(
      await page.evaluate(() => JSON.stringify(Rho.state.sim.history)),
      mainBeforeLessons,
    );
    // Both pages and all algorithm entries must fit small phones, tablets, and desktop.
    for (const width of [320, 390, 600, 768, 900, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of [
        "visualizer",
        "algorithms/basics",
        ...[
          "grpo",
          "ppo",
          "tailrl",
          "rloo",
          "maxrl",
          "pkpo",
          "reinforce",
          "a2c",
          "trpo",
          "elite",
        ].map((id) => "algorithms/" + id),
      ]) {
        await page.evaluate((route) => {
          location.hash = route;
        }, route);
        await page.waitForFunction(
          (route) =>
            route.startsWith("algorithms")
              ? !document.querySelector("#algorithms").hidden &&
                document.querySelector("#algorithm-select").value ===
                  route.split("/")[1]
              : !document.querySelector("#visualizer").hidden,
          route,
        );
        if (route.startsWith("algorithms/"))
          await page
            .locator("#algorithm-article details")
            .evaluateAll((details) =>
              details.forEach((el) => (el.open = true)),
            );
        await page.evaluate(() => document.fonts.ready);
        if (route.startsWith("algorithms/") && route !== "algorithms/basics") {
          const math = await page.evaluate((id) => {
            const article = document.querySelector("#algorithm-article"),
              equation = article.querySelector(".equation"),
              copy = article.cloneNode(true);
            copy.querySelectorAll(".katex").forEach((el) => el.remove());
            return {
              source: equation.querySelector("math annotation").textContent,
              expected: RhoAlgorithms[id].equation,
              terms: [
                ...article.querySelectorAll(".terms dt math annotation"),
              ].map((el) => el.textContent),
              expectedTerms: RhoAlgorithms[id].terms.map(([term]) => term),
              errors: article.querySelectorAll(".katex-error").length,
              rawMath: /\\[()]/.test(copy.textContent),
              fits: equation.scrollWidth <= equation.clientWidth + 1,
              epsilon: article.querySelector(
                ".clip-controls label:last-child math annotation",
              )?.textContent,
              clipped: !!RhoAlgorithms[id].clipped,
              fontsLoaded: [...document.fonts].some(
                (font) =>
                  font.family.startsWith("KaTeX") && font.status === "loaded",
              ),
            };
          }, route.split("/")[1]);
          assert.equal(math.source, math.expected);
          assert.deepEqual(math.terms, math.expectedTerms);
          assert.equal(math.errors, 0);
          assert.equal(math.rawMath, false, `${route}: unrendered inline math`);
          assert(math.fits, `${route}: equation overflow at ${width}`);
          assert(math.fontsLoaded, `${route}: math fonts missing`);
          if (math.clipped) assert.equal(math.epsilon, String.raw`\epsilon`);
        }
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${route}: overflow at ${width}`,
        );
        assert.equal(
          await page.locator(".site-header nav [aria-current=page]").count(),
          1,
        );
        if (route === "visualizer") {
          await page.locator("#edit-distribution").click();
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `Editor overflow at ${width}`,
          );
          if ([320, 390, 1440].includes(width))
            await page
              .locator("#distribution-editor")
              .screenshot({ path: `.qa/editor-${width}.png` });
          await page.locator("#cancel-distribution").click();
        }
        if (
          [320, 390, 1440].includes(width) &&
          [
            "visualizer",
            "algorithms/basics",
            "algorithms/grpo",
            "algorithms/ppo",
            "algorithms/tailrl",
            "algorithms/maxrl",
            "algorithms/pkpo",
          ].includes(route)
        ) {
          if (
            route.startsWith("algorithms/") &&
            route !== "algorithms/basics"
          ) {
            await page.locator("#lesson-next").click();
            await page.evaluate(() => document.fonts.ready);
            assert(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              route + ": worked math overflow at " + width,
            );
            await page.locator(".worked-group").screenshot({
              path: `.qa/worked-${route.split("/")[1]}-${width}.png`,
            });
          }
          await page.waitForTimeout(450);
          await page.screenshot({
            path: `.qa/${route.replace("/", "-")}-${width}.png`,
            fullPage: true,
          });
        }
      }
    }
    await page.evaluate(() => (location.hash = "visualizer"));
    await page.waitForSelector("#visualizer:visible");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#advanced > summary").click();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({ path: ".qa/advanced-mobile.png" });
    await page.locator("#close-advanced").click();
    // Native touch input draws across bins without scrolling the page.
    const phone = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await phone.goto(base);
    await phone.locator("#edit-distribution").tap();
    await phone.locator("#clear-distribution").tap();
    await phone.locator("#distribution-draw").scrollIntoViewIfNeeded();
    const touchBox = await phone.locator("#distribution-draw").boundingBox();
    const touchSession = await phone.context().newCDPSession(phone);
    const touchPoint = (i, weight) => ({
      x: touchBox.x + (touchBox.width * (i + 0.5)) / 21,
      y: touchBox.y + touchBox.height * (1 - weight),
    });
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touchPoint(3, 0.3)],
    });
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [touchPoint(17, 0.8)],
    });
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await phone.locator("#apply-distribution").tap();
    const touchWeights = await phone.evaluate(
      () => Rho.state.cfg.customWeights,
    );
    assert(Math.abs(touchWeights[3] - 0.3) < 0.01);
    assert(Math.abs(touchWeights[17] - 0.8) < 0.01);
    assert(touchWeights.slice(3, 18).every((w) => w > 0));
    assert.equal(touchWeights[2], 0);
    // The readout includes an optional support floor, just as the engine does.
    await phone.locator("#advanced > summary").tap();
    await phone.locator(".optimizer-settings > summary").tap();
    await phone.locator("#floor").fill("0.01");
    await phone.locator("#settings button[type=submit]").tap();
    assert(
      (await phone.locator("#status").textContent()).includes(
        "initial support smoothing",
      ),
    );
    await phone.locator("#edit-distribution").tap();
    assert(await phone.locator("#draw-floor").isVisible());
    const expectedPercent = await phone.evaluate(
      () => (100 * Rho.state.sim.base[10]).toFixed(1) + "%",
    );
    assert(
      (await phone.locator("#draw-reading").textContent()).includes(
        expectedPercent,
      ),
    );
    await phone.close();
    // Each proposed experiment opens its stated configuration and can take a finite update.
    for (const id of Object.keys(expectedWeights)) {
      for (let index = 0; index < 3; index++) {
        await page.evaluate((id) => (location.hash = "algorithms/" + id), id);
        await page.waitForFunction(
          (id) =>
            document.querySelector("#algorithm-select").value === id &&
            !document.querySelector("#algorithms").hidden,
          id,
        );
        const chosen = await page.evaluate(
          ({ id, index }) => RhoAlgorithms[id].cases[index].settings,
          { id, index },
        );
        await page.locator(`[data-case="${index}"]`).click();
        await page.waitForSelector("#visualizer:visible");
        const state = await page.evaluate(() => ({
          cfg: Rho.state.cfg,
          focus: Rho.state.focus,
          shown: Rho.state.shown,
        }));
        assert.equal(state.focus, id);
        assert.equal(state.shown, 0);
        for (const [key, value] of Object.entries(chosen))
          assert.deepEqual(
            state.cfg[key],
            value,
            id + ": experiment " + index + " " + key,
          );
        await page.locator("#step").click();
        assert(
          await page.evaluate(() =>
            Object.values(Rho.state.sim.history[1].methods).every((m) =>
              m.p.every(Number.isFinite),
            ),
          ),
        );
      }
    }
    // System theme, persistent override, all chapters, and theme-aware exports.
    const darkContext = await browser.newContext({
      colorScheme: "dark",
      viewport: { width: 1440, height: 1000 },
    });
    const dark = await darkContext.newPage();
    dark.on("pageerror", (e) => errors.push(e.message));
    await dark.goto(base);
    await dark.waitForFunction(() => window.Rho);
    assert.equal(await dark.locator("html").getAttribute("data-theme"), "dark");
    await dark.locator("#theme").selectOption("light");
    await dark.reload();
    assert.equal(
      await dark.locator("html").getAttribute("data-theme"),
      "light",
    );
    await dark.locator("#theme").selectOption("system");
    await dark.emulateMedia({ colorScheme: "light" });
    await dark.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    await dark.emulateMedia({ colorScheme: "dark" });
    await dark.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
    );
    const colors = await dark.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(
        ["--paper", "--surface", "--ink", "--muted", "--green", "--error"].map(
          (k) => [k, style.getPropertyValue(k).trim()],
        ),
      );
    });
    const luminance = (hex) => {
      const rgb = hex
        .match(/[a-f\d]{2}/gi)
        .map((x) => parseInt(x, 16) / 255)
        .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    for (const bg of ["--paper", "--surface"])
      for (const fg of ["--ink", "--muted", "--green", "--error"])
        assert(
          (luminance(colors[fg]) + 0.05) / (luminance(colors[bg]) + 0.05) >=
            4.5,
          `Dark contrast: ${fg} on ${bg}`,
        );
    for (const width of [320, 390, 768, 1440]) {
      await dark.setViewportSize({ width, height: 1000 });
      for (const route of [
        "visualizer",
        "algorithms/basics",
        ...Object.keys(expectedWeights).map((id) => "algorithms/" + id),
      ]) {
        await dark.evaluate((route) => {
          location.hash = route;
        }, route);
        await dark.waitForFunction(
          (route) =>
            document.querySelector(
              route === "visualizer" ? "#visualizer" : "#algorithms",
            ).hidden === false &&
            (route === "visualizer" ||
              document.querySelector("#algorithm-select").value ===
                route.split("/")[1]),
          route,
        );
        assert(
          await dark.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `Dark overflow ${route} at ${width}`,
        );
        assert.equal(await dark.locator(".katex-error").count(), 0);
        if (
          [390, 1440].includes(width) &&
          ["visualizer", "algorithms/grpo"].includes(route)
        )
          await dark.screenshot({
            path: `.qa/dark-${route.replace("/", "-")}-${width}.png`,
          });
      }
    }
    await dark.locator("#nav-visualizer").click();
    await dark.locator("#edit-distribution").click();
    await dark
      .locator("#distribution-editor")
      .screenshot({ path: ".qa/dark-editor.png" });
    await dark.locator("#cancel-distribution").click();
    await dark.locator("#advanced > summary").click();
    await dark
      .locator("#settings")
      .screenshot({ path: ".qa/dark-settings.png" });
    await dark.locator("#close-advanced").click();
    const darkDownload = dark.waitForEvent("download");
    await dark.locator("#save-image").click();
    await (await darkDownload).saveAs(".qa/dark-export.png");
    const png = fs.readFileSync(".qa/dark-export.png").toString("base64");
    const pixel = await dark.evaluate(async (base64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + base64;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    }, png);
    assert.deepEqual(pixel, [17, 18, 20, 255]);
    // Render the real native synth: a rare tail still sounds, zero bins contain no signal.
    const rendered = await dark.evaluate(async () => {
      const sampleRate = 24000;
      const context = new OfflineAudioContext(2, sampleRate * 2.2, sampleRate);
      const gain = context.createGain();
      gain.gain.value = 0.45;
      gain.connect(context.destination);
      RhoAudio.schedule(context, RewardLab.initial("rare"), 0, gain);
      const buffer = await context.startRendering();
      return {
        sampleRate,
        channels: [
          Array.from(buffer.getChannelData(0)),
          Array.from(buffer.getChannelData(1)),
        ],
      };
    });
    const peak = (samples) =>
      samples.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
    // The 99.9% bar must carry more audio energy than the 0.1% bar.
    // Measure both channels so stereo position cannot masquerade as a level change.
    const rmsAt = (bin) => {
      const start = Math.round(bin * 0.1 * rendered.sampleRate);
      const length = Math.round(0.085 * rendered.sampleRate);
      return Math.sqrt(
        rendered.channels.reduce(
          (sum, channel) =>
            sum +
            channel.slice(start, start + length).reduce((s, v) => s + v * v, 0),
          0,
        ) / length,
      );
    };
    assert(
      rmsAt(4) > 4 * rmsAt(20),
      "Tall bars must be clearly stronger than rare bars in rendered audio",
    );
    assert(
      peak(rendered.channels[1]) > 0.01 && peak(rendered.channels[1]) < 0.2,
    );
    assert(
      peak(
        rendered.channels[1].slice(
          0.6 * rendered.sampleRate,
          1.9 * rendered.sampleRate,
        ),
      ) < 1e-8,
    );
    assert(
      peak(
        rendered.channels[1].slice(
          2 * rendered.sampleRate,
          2.1 * rendered.sampleRate,
        ),
      ) > 0.005,
    );
    const frames = rendered.channels[0].length,
      wav = Buffer.alloc(44 + frames * 4);
    wav.write("RIFF");
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(2, 22);
    wav.writeUInt32LE(rendered.sampleRate, 24);
    wav.writeUInt32LE(rendered.sampleRate * 4, 28);
    wav.writeUInt16LE(4, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(frames * 4, 40);
    for (let i = 0; i < frames; i++)
      for (let c = 0; c < 2; c++)
        wav.writeInt16LE(
          Math.round(rendered.channels[c][i] * 32767),
          44 + i * 4 + c * 2,
        );
    fs.writeFileSync(".qa/rare-tail-sound.wav", wav);
    const noStorage = await darkContext.newPage();
    await noStorage.addInitScript(() =>
      Object.defineProperty(window, "localStorage", {
        get() {
          throw Error("Storage blocked");
        },
      }),
    );
    await noStorage.goto(base);
    assert.equal(
      await noStorage.locator("html").getAttribute("data-theme"),
      "dark",
    );
    await noStorage.locator("#theme").selectOption("light");
    assert.equal(
      await noStorage.locator("html").getAttribute("data-theme"),
      "light",
    );
    await darkContext.close();
    const compact = await browser.newPage();
    compact.on("pageerror", (e) => errors.push(e.message));
    await compact.goto(base);
    const compactConfig = await compact.evaluate(() => Rho.state.cfg);
    const methodIds = await compact.evaluate(() => Object.keys(RhoAlgorithms));
    for (const [width, height] of [
      [1024, 600],
      [1280, 640],
      [1366, 650],
      [1440, 760],
    ]) {
      await compact.setViewportSize({ width, height });
      for (const count of [1, 2, 3, 10]) {
        await compact.goto(
          base +
            "?setup=" +
            encodeURIComponent(
              JSON.stringify({
                cfg: compactConfig,
                methods: methodIds.slice(0, count),
              }),
            ),
        );
        await compact.waitForFunction(() => window.Rho);
        await compact.evaluate(() => {
          for (let i = 0; i < 25; i++) document.querySelector("#step").click();
        });
        const frame = await compact.evaluate(() => Rho.state.sim.history[25]);
        for (const theme of ["light", "dark"]) {
          await compact.locator("#theme").selectOption(theme);
          for (const sound of [true, false]) {
            if ((await compact.evaluate(() => Rho.state.sound)) !== sound)
              await compact.locator("#sound").click();
            while (await compact.locator("#previous-charts").isEnabled())
              await compact.locator("#previous-charts").click();
            do {
              assert(
                await compact.evaluate(
                  () =>
                    document
                      .querySelector("#comparison")
                      .getBoundingClientRect().height <=
                      innerHeight - 80 &&
                    document.documentElement.scrollWidth <= innerWidth &&
                    getComputedStyle(document.querySelector("h1")).fontSize ===
                      "44px" &&
                    document
                      .querySelector(".site-header")
                      .getBoundingClientRect().height === 84 &&
                    [
                      ...document.querySelectorAll(
                        ".algorithm-card:not([hidden]) .card-observation",
                      ),
                    ].every((el) => getComputedStyle(el).display !== "none"),
                ),
                `Chart grid or restored page layout: ${width}×${height}, ${count} methods, ${theme}, sound ${sound}`,
              );
              if (await compact.locator("#next-charts").isDisabled()) break;
              await compact.locator("#next-charts").click();
            } while (true);
          }
        }
        assert.deepEqual(
          await compact.evaluate(() => Rho.state.sim.history[25]),
          frame,
        );
      }
    }
    await compact.close();
    // Invalid shared configuration falls back visibly, without executing injected markup.
    await page.goto(
      base +
        "?setup=" +
        encodeURIComponent(JSON.stringify({ cfg: { preset: "<script>" } })),
    );
    await page.waitForFunction(() => window.Rho);
    assert(
      (await page.locator("#status").textContent()).includes("Could not load"),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: two-page navigation; real probability rendering; replay; deterministic histogram sound, silent gaps, native audio rendering, Start/Current comparison and synchronized cursor; system/light/dark themes, persistence, contrast and themed PNG export; clipping; LaTeX, local math fonts and accessible MathML; setup links; PNG export; validation; visual distribution editing with mouse, keyboard and touch; rare tails, paste import, support floor and custom sharing; all ten methods; bounded playback; speed changes without resetting state or pitch; paged chart grids that fit laptop screens, with full-size page typography and controls in both themes; phone/tablet/desktop layouts; beginner reading path and all ten worked calculations.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
