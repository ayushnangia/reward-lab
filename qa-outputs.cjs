const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage(),
    errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("http://127.0.0.1:8766/#outputs");
  await page.waitForSelector("#output-histogram svg");
  assert.equal(await page.evaluate(() => RewardApp.view), "outputs");
  assert(
    (await page.locator("#output-response-detail").textContent()).includes(
      "return 90",
    ),
  );
  assert.equal(
    await page.locator(".output-prompt-text").getAttribute("open"),
    "",
  );
  assert(
    (await page.locator("#output-finding").textContent()).includes(
      "Judge score rose",
    ),
  );
  // No motion on the default evaluation page.
  const initial = await page.locator("#output-histogram").innerHTML();
  await page.waitForTimeout(700);
  assert.equal(await page.locator("#output-histogram").innerHTML(), initial);
  await page.selectOption("#output-prompt", "duration");
  await page.locator('[data-output-bin="10"][data-output-side="1"]').click();
  assert(
    (await page.locator("#output-filter-label").textContent()).includes(
      "3 recorded outputs",
    ),
  );
  assert(
    !(await page.locator("#output-response-detail").textContent()).includes(
      "return 90",
    ),
  );
  await page.click("#output-clear-filter");
  await page.locator('[data-output-bin="1"][data-output-side="1"]').focus();
  await page.keyboard.press("Enter");
  assert(
    (await page.locator("#output-response-detail").textContent()).includes(
      "return 90",
    ),
  );
  await page.click('[data-output-case="collapse"]');
  assert(
    (await page.locator("#output-finding").textContent()).includes(
      "pass@16 fell",
    ),
  );
  await page.locator("#output-k").fill("8");
  await page.locator("#output-k").press("Tab");
  assert.equal(await page.evaluate(() => OutputWorkbench.k), 8);
  await page.click("#output-share");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  assert(link.includes("case=collapse") && link.includes("budget=8"));
  await page.goto(link);
  await page.waitForSelector("#output-histogram svg");
  assert.equal(await page.evaluate(() => OutputWorkbench.k), 8);
  const download = page.waitForEvent("download");
  await page.click("#output-export");
  const file = await download;
  const report = JSON.parse(fs.readFileSync(await file.path(), "utf8"));
  assert.equal(report.budget, 8);
  assert.equal(
    report.checkpoints[0].passK,
    report.checkpoints[0].curves[7].pass,
  );
  // File import stays local, preserves real output text, and handles missing optional metadata.
  const rows = [
    {
      checkpoint: "base",
      prompt_id: "p",
      prompt: "Answer a question.",
      output: '<img src="https://example.com/leak" onerror="alert(1)">',
      score: 0,
      correct: false,
    },
    {
      checkpoint: "base",
      prompt_id: "p",
      prompt: "Answer a question.",
      output: "42",
      score: 1,
      correct: true,
    },
    {
      checkpoint: "tuned",
      prompt_id: "p",
      prompt: "Answer a question.",
      output: "Still 42",
      score: 1,
      correct: true,
    },
    {
      checkpoint: "tuned",
      prompt_id: "p",
      prompt: "Answer a question.",
      output: "42 again",
      score: 1,
      correct: true,
    },
  ];
  await page.locator("#output-file").setInputFiles({
    name: "my-model.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(rows)),
  });
  await page.waitForFunction(() => !OutputWorkbench.data.synthetic);
  assert.equal(
    await page.evaluate(() => OutputWorkbench.data.synthetic),
    false,
  );
  assert(
    (await page.locator("#output-budget-table").textContent()).includes(
      "Unavailable",
    ),
  );
  assert(await page.locator("#output-share").isDisabled());
  await page.selectOption("#output-response-side", "0");
  await page.locator('[data-output-bin="0"][data-output-side="0"]').click();
  assert.equal(await page.locator("#output-response-detail img").count(), 0);
  assert(
    (await page.locator("#output-response-detail pre").textContent()).includes(
      "<img",
    ),
  );
  const beforeInvalid = await page.evaluate(
    () => OutputWorkbench.data.rows.length,
  );
  await page.locator("#output-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('[{"score":2}]'),
  });
  await page.locator("#output-error").waitFor({ state: "visible" });
  assert(await page.locator("#output-error").isVisible());
  assert.equal(
    await page.evaluate(() => OutputWorkbench.data.rows.length),
    beforeInvalid,
  );
  const many = ["base", "tuned"].flatMap((checkpoint) =>
    Array.from({ length: 36 }, (_, i) => ({
      checkpoint,
      prompt_id: "many",
      prompt: "Inspect candidate responses.",
      output: "candidate " + i,
      score: i / 40,
      correct: false,
    })),
  );
  await page
    .locator("#output-file")
    .setInputFiles({
      name: "many.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(many)),
    });
  await page.locator('[data-output-page="20"]').click();
  assert(
    (await page.locator("#output-response-pages").textContent()).includes(
      "21–36",
    ),
  );
  await page.locator("[data-output-row]").last().click();
  assert(
    (await page.locator("#output-response-detail pre").textContent()).includes(
      "candidate 0",
    ),
  );
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Import layout overflow at " + width,
    );
  }
  await page.click('[data-output-case="judge"]');
  await page.screenshot({
    path: ".qa/outputs-final-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.click("#theme");
  await page.waitForTimeout(200);
  await page.screenshot({
    path: ".qa/outputs-final-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.click("#theme");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: ".qa/outputs-final-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Sampling waits between budgets, and manual input stops its playback.
  await page.click('a[data-view="discover"]');
  await page.click("#story-reset");
  await page.click("#story-play");
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => Discovery.k), 1);
  await page.waitForFunction(() => Discovery.k === 2);
  await page.locator("#story-budget").fill("4");
  assert.equal(
    await page.locator("#story-play").getAttribute("aria-pressed"),
    "false",
  );
  // Default training pace is visible and interruptible; fast computation remains explicit.
  await page.click('a[data-view="lab"]');
  assert.equal(await page.locator("#playback-speed").inputValue(), "1");
  assert.equal(await page.locator("#horizon").inputValue(), "25");
  await page.click("#run");
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => RewardApp.sim.step), 0);
  await page.waitForFunction(() => RewardApp.sim.step >= 1);
  await page.click("#run");
  const paused = await page.evaluate(() => RewardApp.sim.step);
  await page.waitForTimeout(1100);
  assert.equal(await page.evaluate(() => RewardApp.sim.step), paused);
  await page.selectOption("#playback-speed", "0");
  await page.click("#run");
  await page.waitForFunction(
    (start) => RewardApp.sim.step === start + 25,
    paused,
  );
  await page.click('a[data-view="outputs"]');
  assert.deepEqual(errors, []);
  assert(
    requests.every((r) => r.startsWith("http://127.0.0.1:8766/")),
    "Unexpected external request from output import",
  );
  await browser.close();
  console.log(
    "PASS: output inspection, per-prompt filters, keyboard access, example sharing, correct exported budgets, safe local imports, missing metadata, invalid-file recovery, responsive light/dark views, deliberate sampling pace, and interruptible slow training.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
