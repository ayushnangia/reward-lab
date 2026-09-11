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
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const routes = [
    "notes",
    "outputs",
    "discover",
    "lab",
    "shaping",
    "experiments",
    "guide",
  ];
  await page.goto("http://127.0.0.1:8766/");

  // Exercise intermediate widths as well as phone and desktop breakpoints.
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.click("#theme");
    for (const width of [320, 390, 600, 768, 900, 901, 1024, 1250, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        await page.evaluate((route) => {
          location.hash = route;
        }, route);
        await page.waitForFunction((route) => RewardApp.view === route, route);
        await page.waitForTimeout(160);
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${route}, ${theme}: horizontal overflow at ${width}`,
        );
        const heading = page.locator(`#view-${route} h1`);
        assert(await heading.isVisible(), `${route}: missing visible title`);
        const bounds = await heading.boundingBox();
        assert(
          bounds.x >= 0 && bounds.x + bounds.width <= width,
          `${route}: clipped title`,
        );
        assert.equal(
          await page.locator('#site-nav a[aria-current="page"]').count(),
          1,
        );
        if (
          (width === 390 || width === 1024 || width === 1440) &&
          (theme === "light" || width === 390)
        ) {
          await page.screenshot({
            path: `.qa/interface-${route}-${width}-${theme}.png`,
            animations: "disabled",
          });
        }
      }
    }
  }
  await page.click("#theme");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of routes) {
    assert.equal(
      await page.locator("#nav-toggle").getAttribute("aria-expanded"),
      "false",
    );
    await page.click("#nav-toggle");
    assert.equal(await page.locator("#site-nav a:visible").count(), 7);
    for (const link of await page.locator("#site-nav a").all()) {
      assert(
        (await link.boundingBox()).height >= 44,
        "Navigation touch target is too small",
      );
    }
    await page.click(`#site-nav a[data-view="${route}"]`);
    await page.waitForFunction((route) => RewardApp.view === route, route);
    assert.equal(
      await page.locator("#nav-toggle").getAttribute("aria-expanded"),
      "false",
    );
  }
  await page.click("#nav-toggle");
  await page.screenshot({ path: ".qa/interface-menu.png" });
  await page.keyboard.press("Escape");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "nav-toggle",
  );
  assert(!(await page.locator("#site-nav").isVisible()));

  // The reference selector replaces irrelevant shared experiment settings.
  assert(!(await page.locator("#experiment-settings").isVisible()));
  await page.selectOption("#guide-jump", "ppo");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "reference-ppo",
  );
  assert((await page.locator("#reference-ppo").boundingBox()).y >= 64);

  await page.evaluate(() => {
    location.hash = "lab";
  });
  await page.waitForFunction(() => RewardApp.view === "lab");
  const heading = await page.locator("#view-lab .page-heading").boundingBox();
  const toggle = await page.locator(".mobile-settings").boundingBox();
  assert(
    toggle.y >= heading.y + heading.height,
    "Settings must follow the page introduction",
  );
  await page.click(".mobile-settings");
  await page.waitForSelector("#settings-dialog[open]");
  assert.equal(
    await page.locator("#settings-dialog #experiment-settings").count(),
    1,
  );
  await page.screenshot({ path: ".qa/interface-settings.png" });
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    assert(
      await page.evaluate(
        // Native dialogs allow focus to visit browser chrome, represented by body.
        () =>
          document.activeElement === document.body ||
          document.activeElement.closest("#settings-dialog") !== null,
      ),
      "Keyboard focus escaped the modal",
    );
  }
  await page.locator("#settings-close").focus();
  await page.locator("#nav-toggle").evaluate((element) => element.focus());
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "settings-close",
    "The background page must stay inert while the dialog is open",
  );
  await page.selectOption("#preset", "bell");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#settings-dialog:not([open])", {
    state: "attached",
  });
  assert.equal(
    await page.locator("#preset").inputValue(),
    "bell",
    "Closing lost draft settings",
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.className),
    "mobile-settings",
  );
  await page.click(".mobile-settings");
  await page.click("#apply");
  await page.waitForSelector("#settings-dialog:not([open])", {
    state: "attached",
  });
  assert.equal(await page.evaluate(() => RewardApp.sim.cfg.preset), "bell");

  await page.click(".mobile-settings");
  await page.selectOption("#preset", "custom");
  await page.fill("#custom", "-1, 1");
  await page.click("#apply");
  assert(await page.locator("#settings-dialog[open]").isVisible());
  assert(await page.locator("#settings-dialog-error").isVisible());
  assert(
    (await page.locator("#settings-dialog-error").boundingBox()).y < 200,
    "Validation should be brought into view",
  );
  assert.equal(
    await page.evaluate(() => RewardApp.sim.cfg.preset),
    "bell",
    "Invalid input changed the simulation",
  );
  await page.click("#settings-close");
  await page.click(".mobile-settings");
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.waitForSelector("#settings-dialog:not([open])", {
    state: "attached",
  });
  assert(await page.locator(".workspace > #experiment-settings").isVisible());
  await page.click("#defaults");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click(".mobile-settings");
  await page.evaluate(() => {
    location.hash = "notes";
  });
  await page.waitForSelector("#settings-dialog:not([open])", {
    state: "attached",
  });
  assert.equal(
    await page.locator(".workspace > #experiment-settings").count(),
    1,
  );

  await page.evaluate(() => {
    location.hash = "shaping";
  });
  await page.waitForFunction(() => RewardApp.view === "shaping");
  await page.click("#try-piecewise");
  await page.waitForSelector("#settings-dialog[open]");
  assert.equal(await page.locator("#transform").inputValue(), "hinge");
  await page.keyboard.press("Escape");

  await page.evaluate(() => {
    location.hash = "outputs";
  });
  await page.waitForFunction(() => RewardApp.view === "outputs");
  await page.selectOption("#output-case-select", "judge");
  assert.equal(await page.evaluate(() => OutputWorkbench.data.case), "judge");
  await page.selectOption("#output-case-select", "collapse");
  assert.equal(
    await page.evaluate(() => OutputWorkbench.data.case),
    "collapse",
  );
  const exportBox = await page.locator("#output-export").boundingBox();
  assert(
    exportBox.height <= 46 && exportBox.width > 100,
    "Export label should fit on one line",
  );
  const titleBox = await page.locator(".output-title").boundingBox();
  const datasetsBox = await page.locator(".output-sidebar").boundingBox();
  assert(
    datasetsBox.y >= titleBox.y + titleBox.height,
    "Mobile datasets overlap the page title",
  );

  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "PASS: all seven routes at nine widths in both themes; navigation, reference jump, modal focus, draft preservation, validation, responsive restoration, route changes, and mobile dataset selection.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
