const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const path = require("node:path"),
  fs = require("node:fs");
const qaDir = path.join(__dirname, ".qa");
fs.mkdirSync(qaDir, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:8766")) external.push(r.url());
  });
  await page.goto("http://127.0.0.1:8766/#discover");
  await page.waitForSelector("#story-plot-a svg");
  assert.equal(await page.evaluate(() => RewardApp.view), "discover");
  assert.equal(await page.locator("#story-mean-a").textContent(), "0.500");
  assert.equal(await page.locator("#story-mean-b").textContent(), "0.500");
  await page.locator("#story-budget").fill("1");
  assert.equal(await page.locator("#story-best-b").textContent(), "0.500");
  await page.click('[data-story="jackpot"]');
  await page.locator("#story-budget").fill("16");
  assert.equal(await page.locator("#story-hit-b").textContent(), "81.5%");
  await page.click("#story-play");
  await page.waitForFunction(() => Discovery.k > 16);
  await page.click("#story-play");
  assert.equal(
    await page.locator("#story-play").getAttribute("aria-pressed"),
    "false",
  );
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Discovery overflows at " + width,
    );
  }
  await page.screenshot({
    path: path.join(qaDir, "qa-discovery.png"),
    fullPage: true,
  });
  await page.click('a[data-view="lab"]');
  await page.waitForSelector("#dist-tailrl svg");
  assert.equal(
    await page.locator("#distribution-grid .distribution-card:visible").count(),
    6,
  );
  await page.click("[data-family=classic]");
  assert.equal(
    await page.locator("#distribution-grid .distribution-card:visible").count(),
    4,
  );
  await page.click("#step");
  assert((await page.evaluate(() => RewardApp.sim.last.trpo.kl)) <= 0.01);
  await page.click("[data-family=all]");
  assert.equal(
    await page.locator("#distribution-grid .distribution-card:visible").count(),
    10,
  );
  await page.click("#reset");
  await page.click("[data-family=tail]");
  await page.screenshot({
    path: path.join(qaDir, "qa-desktop.png"),
    fullPage: true,
  });
  await page.click("#step");
  assert.equal(await page.locator("#step-count").textContent(), "1");
  await page.selectOption("#horizon", "150");
  await page.selectOption("#playback-speed", "0");
  await page.click("#run");
  await page.waitForFunction(() => RewardApp.sim.step === 151, {
    timeout: 30000,
  });
  await page.click("#reset");
  await page.selectOption("#transform", "hinge");
  await page.locator("#jump").fill("0.5");
  await page.click('a[data-view="shaping"]');
  await page.waitForSelector("#mapping-chart svg");
  assert(
    (await page.locator("#mapping-explanation").textContent()).includes("gap"),
  );
  await page.screenshot({
    path: path.join(qaDir, "qa-shaping.png"),
    fullPage: true,
  });
  await page.click("#shape-apply");
  await page.waitForSelector("#view-lab:not([hidden])");
  assert.equal(await page.evaluate(() => RewardApp.sim.cfg.jump), 0.5);
  await page.selectOption("#model", "neural");
  await page.click("#apply");
  await page.click("#step25");
  assert.equal(await page.evaluate(() => RewardApp.sim.step), 25);
  await page.locator("#checkpoint").fill("10");
  assert.equal(await page.evaluate(() => RewardApp.checkpoint), 10);
  await page.selectOption("#metric", "bad");
  await page.locator("#learning-chart").hover({ position: { x: 250, y: 100 } });
  assert(
    (await page.locator("#curve-readout").textContent()).includes("Update"),
  );
  await page.waitForTimeout(250);
  assert(
    (await page.locator("#curve-readout").textContent()).includes("Update"),
    "Inspection survives readout height changes",
  );
  const download = page.waitForEvent("download");
  await page.click("#save-setup");
  assert((await download).suggestedFilename().includes("setup"));
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("reward-lab-setups")).length,
    ),
    1,
  );
  await page.selectOption("#preset", "custom");
  await page.fill("#custom", "-1, 1");
  await page.click("#apply");
  assert.equal(await page.evaluate(() => RewardApp.sim.cfg.preset), "spike");
  assert(
    (await page.locator("#toast").textContent()).includes("between 0 and 1"),
  );
  await page.click("#defaults");
  await page.selectOption("#preset", "zero");
  await page.click("#apply");
  await page.click("#step25");
  assert(
    await page.evaluate(() =>
      RewardLab.methods.every(
        (m) => RewardApp.sim.history.at(-1).methods[m].metrics.mean === 0,
      ),
    ),
  );
  await page.click('a[data-view="experiments"]');
  await page.click(".guided-setups > summary");
  await page.click('[data-scenario="0"]');
  await page.waitForSelector("#view-lab:not([hidden])");
  assert.equal(await page.evaluate(() => RewardApp.sim.cfg.transform), "hinge");
  await page.click('a[data-view="experiments"]');
  await page.selectOption("#pair-steps", "150");
  await page.click("#pair-run");
  await page.waitForSelector("#pair-results:not([hidden])", { timeout: 30000 });
  assert.equal(await page.locator("#pair-table tbody tr").count(), 10);
  assert.equal(await page.locator("#pair-charts svg").count(), 10);
  await page.click("#sweep-run");
  await page.waitForSelector("#sweep-results tbody tr", { timeout: 60000 });
  assert.equal(await page.locator("#sweep-results tbody tr").count(), 11);
  await page.click("#bench-load");
  await page.waitForSelector("#bench-table tbody tr");
  assert.equal(await page.locator("#bench-table tbody tr").count(), 6);
  await page.selectOption("#bench-transform", "square");
  await page.click("#theme");
  await page.click('a[data-view="guide"]');
  await page.locator(".question summary").first().click();
  assert.equal(await page.locator(".guide-card").count(), 10);
  await page.click('a[data-view="lab"]');
  await page.setViewportSize({ width: 360, height: 850 });
  await page.waitForTimeout(250);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: path.join(qaDir, "qa-mobile.png"),
    fullPage: true,
  });
  await page.click(".mobile-settings");
  await page.selectOption("#preset", "bell");
  await page.click("#apply");
  assert.equal(await page.evaluate(() => RewardApp.sim.cfg.preset), "bell");
  await page.waitForSelector("#settings-dialog:not([open])", {
    state: "attached",
  });
  for (const route of ["shaping", "experiments", "guide"]) {
    await page.click("#nav-toggle");
    await page.click(`a[data-view="${route}"]`);
    await page.waitForTimeout(150);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      route + " has overflow",
    );
  }
  await page.goto("http://127.0.0.1:8766/?story=jackpot&tries=16#discover");
  await page.waitForSelector("#story-plot-b svg");
  assert.equal(await page.evaluate(() => Discovery.preset), "jackpot");
  assert.equal(await page.locator("#story-hit-b").textContent(), "81.5%");
  await page.click('[data-discovery-scenario="0"]');
  await page.waitForSelector("#view-lab:not([hidden])");
  assert.equal(await page.evaluate(() => RewardApp.sim.cfg.transform), "hinge");
  const shared = {
    preset: "rare",
    model: "neural",
    transform: "hinge",
    jump: 0.3,
    seed: 91,
  };
  await page.goto(
    "http://127.0.0.1:8766/?config=" +
      encodeURIComponent(JSON.stringify(shared)) +
      "&family=classic#lab",
  );
  await page.waitForSelector("#dist-ppo svg");
  assert.equal(await page.evaluate(() => RewardApp.sim.cfg.seed), 91);
  assert.equal(await page.evaluate(() => RewardApp.family), "classic");
  await page.click("#theme");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await browser.close();
  console.log(
    "PASS: exact discovery examples, slider/playback, shared discovery links and five viewport widths; local-only assets; live controls/replay; shaping; neural updates; save; invalid input; zero signal; guided presets; paired worker run; full 33-trial sweep; saved-results explorer; guide; mobile views.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
