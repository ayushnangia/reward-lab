// Render the actual reported-evidence figure in a compact layout for link previews.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.goto(process.env.REWARD_LAB_URL || "http://127.0.0.1:8766/");
  await page.waitForSelector("#transfer-matrix button");
  await page.addStyleTag({
    content: `
    .app-header,.note-contents,.note-title .note-byline,.note-deck,#note-evidence>.note-prose,.figure-details,#note-update,#note-evaluate,.note-tools,.research-note .note-footer{display:none!important}
    .research-note{max-width:1060px;padding:28px 30px 0}.note-title{margin:0 auto 24px}.note-dateline{font-size:12px}.research-note h1{font-size:35px;margin:13px 0 0;line-height:1.1}.research-note h1 br{display:none}.research-note h1 br::after{content:' '}
    .note-section{margin:0}.research-note .note-figure{margin:0;padding-top:13px}.figure-heading{margin-bottom:16px}.transfer-matrix-layout{grid-template-columns:minmax(0,1fr) 225px;gap:48px;padding-bottom:16px}.reading-delta{font-size:41px}.transfer-reading{padding-top:29px}.transfer-table button{height:47px!important}.research-note figcaption{padding:14px 4px;font-size:12px}.matrix-scale{margin-top:10px}.transfer-reading>.figure-small{font-size:11px}
  `,
  });
  await page.evaluate(() => {
    document.querySelector(".note-title h1").textContent =
      "Reward distributions and what transfers";
  });
  await page.screenshot({
    path: path.resolve(__dirname, "../assets/social-card-v5.png"),
    animations: "disabled",
  });
  await browser.close();
  console.log("Rendered research-note social preview.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
