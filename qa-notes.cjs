const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("http://127.0.0.1:8766/");
  assert.equal(await page.evaluate(() => RewardApp.view), "notes");
  assert.equal(await page.locator("[data-transfer-cell]").count(), 16);
  assert(
    (await page.locator("#transfer-reading").textContent()).includes("+20.80"),
  );
  await page.locator('[data-transfer-cell="2,2"]').focus();
  await page.keyboard.press("Enter");
  assert(
    (await page.locator("#transfer-reading").textContent()).includes("+76.56"),
  );
  await page.click('[data-transfer-cell="1,0"]');
  const matrixBefore = await page.locator("#transfer-reading").textContent();
  await page.waitForTimeout(850);
  assert.equal(
    await page.locator("#transfer-reading").textContent(),
    matrixBefore,
  );
  assert.equal(await page.evaluate(() => RewardApp.sim.step), 0);
  await page.screenshot({
    path: ".qa/note-final-desktop.png",
    animations: "disabled",
  });
  await page.click('[data-alignment="-1"]');
  assert(
    (await page.locator("#note-change").textContent()).includes("less likely"),
  );
  await page.click('[data-alignment="1"]');
  assert(
    (await page.locator("#note-change").textContent()).includes("more likely"),
  );
  await page.click('[data-alignment="0"]');
  assert(
    (await page.locator("#note-change").textContent()).includes(
      "Almost no local change",
    ),
  );
  await page.selectOption("#note-method", "maxrl");
  assert(await page.locator("#note-map").isDisabled());
  await page.selectOption("#note-method", "tailrl");
  assert(await page.locator("#note-map").isEnabled());
  await page.selectOption("#note-map", "tail");
  await page.click('[data-alignment="-1"]');
  await page.locator(".gradient-figure").screenshot({
    path: ".qa/note-final-gradient.png",
    animations: "disabled",
  });
  await page.click("#theme");
  await page.waitForTimeout(200);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: ".qa/note-final-dark.png",
    animations: "disabled",
  });
  await page.click("#theme");
  await page.waitForTimeout(200);
  for (const width of [320, 360, 390, 600, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: ".qa/note-final-mobile.png",
    animations: "disabled",
  });
  await page.locator(".transfer-figure").screenshot({
    path: ".qa/note-final-mobile-matrix.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  // Exercise the note's actual file-picker path, not an internal load helper.
  const rows = [];
  for (let i = 0; i < 12; i++)
    for (const checkpoint of ["base", "trained"])
      for (let j = 0; j < 4; j++)
        rows.push({
          checkpoint,
          prompt_id: `p${i}`,
          prompt: `Question ${i}`,
          output: `Answer ${j}`,
          score: j / 3,
          correct: checkpoint === "base" ? j === 0 : j < 2,
          domain: i < 6 ? "math" : "code <img src=x onerror=alert(1)>",
          split: "test",
        });
  const chooserPromise = page.waitForEvent("filechooser");
  await page.click("#note-import");
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "domain-evaluation.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ training_domains: ["math"], rows })),
  });
  await page.waitForSelector(".domain-table");
  assert.equal(await page.evaluate(() => RewardApp.view), "outputs");
  const text = await page.locator("#output-domain-results").textContent();
  assert(text.includes("Same domain") && text.includes("Other domain"));
  assert(text.includes("25.0 to 25.0"));
  assert.equal(await page.locator(".domain-table img").count(), 0);
  assert.equal(await page.locator(".domain-table tbody tr").count(), 2);
  await page
    .locator(".output-domain-section")
    .screenshot({ path: ".qa/note-domain-import.png", animations: "disabled" });
  const downloadPromise = page.waitForEvent("download");
  await page.click("#output-export");
  const dl = await downloadPromise;
  const result = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  assert.deepEqual(result.training_domains, ["math"]);
  assert.equal(result.domain_metrics[0].delta, 0.25);
  // Rejected metadata must leave the prior good dataset intact.
  rows[0].split = "train";
  await page.setInputFiles("#output-file", {
    name: "bad-domain.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(rows)),
  });
  await page.waitForSelector("#output-error:not([hidden])");
  assert(
    (await page.locator("#output-error").textContent()).includes(
      "split differs",
    ),
  );
  assert.equal(await page.evaluate(() => OutputWorkbench.data.groups.size), 12);
  await page.goto("http://127.0.0.1:8766/?case=collapse&budget=8#outputs");
  assert.equal(
    await page.evaluate(() => OutputWorkbench.data.case),
    "collapse",
  );
  const correct = await page.evaluate(
    () => OutputWorkbench.stats.methods[1].pass1,
  );
  const recomputed = await page.evaluate(
    () => OutputMath.summarize(OutputWorkbench.data).methods[1].pass1,
  );
  assert.equal(correct, recomputed);
  await page.click('a[data-view="lab"]');
  await page.click("#defaults");
  await page.click("#step");
  await page.locator("#learning-chart").hover({ position: { x: 250, y: 100 } });
  assert(
    (await page.locator("#curve-readout").textContent()).includes("Update 1.0"),
    "Hover cannot extrapolate into the unobserved run horizon",
  );
  await page.locator(".skip").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => RewardApp.view), "lab");
  assert.equal(await page.evaluate(() => document.activeElement.id), "main");
  assert.deepEqual(errors, []);
  assert(
    requests.every(
      (u) => u.startsWith("http://127.0.0.1:8766/") || u.startsWith("blob:"),
    ),
  );
  await browser.close();
  console.log(
    "PASS: reported evidence selection, manual geometry, responsive light/dark note, file-picker imports, paired domain intervals, safe metadata, export, and checkpoint-link restoration.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
