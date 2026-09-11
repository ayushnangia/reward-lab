// Capture the actual workbench with a compact layout for link previews.
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
  await page.goto(
    process.env.REWARD_LAB_URL || "http://127.0.0.1:8766/#outputs",
  );
  await page.waitForSelector("#output-histogram svg");
  await page.addStyleTag({
    content: `
 .app-header,.output-sidebar,.output-controls,.output-finding,.output-budget-section,.output-prompt-section,.output-research,.output-title>button,#output-response-list,.output-response-note,footer{display:none!important}
 .outputs-mode .workspace{padding:0;max-width:none}.output-shell{display:block;min-height:0}.output-main{padding:14px 32px 10px}.output-title{padding:22px 32px 0;margin-bottom:0}.output-title h1{font-size:31px}.output-title p{font-size:12px}.output-breadcrumb{display:block!important}.output-provenance{font-size:10px;padding:8px 11px;margin-bottom:15px}
 .output-metrics{grid-template-columns:repeat(4,minmax(0,1fr));padding:12px 0}.output-metrics>div:nth-child(3){padding-left:16px}.output-metrics>div:nth-child(2){border-right:1px solid var(--o-border)}.output-metrics span{font-size:21px}.output-metrics strong{font-size:23px}.output-metrics small{font-size:9px}
 .output-inspection{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);border-top:0;padding-top:19px;gap:25px}.output-response{border-left:1px solid var(--o-border);border-top:0;padding:0 0 0 25px}.output-section-title h2{font-size:15px}.output-section-title p{font-size:11px}.output-prompt-text{font-size:11px}#output-histogram{margin-top:8px}#output-histogram svg{height:220px}.output-plot-legend{margin:7px 0}.output-caption{font-size:10px}#output-response-detail pre{max-height:128px}#output-response-detail code{font-size:11px}.output-response-meta{font-size:11px}
 `,
  });
  await page.screenshot({
    path: path.resolve(__dirname, "../assets/social-card-v3.png"),
    animations: "disabled",
  });
  await browser.close();
  console.log("Rendered the workbench social preview from the running app.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
