// Use the actual visualizer and its recorded update for the social preview.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
      colorScheme: "dark",
    });
    await page.goto(process.env.QA_URL || "http://127.0.0.1:8766/");
    await page.waitForFunction(() => window.Rho);
    await page.evaluate(() => {
      for (let i = 0; i < 25; i++) document.querySelector("#step").click();
    });
    await page.addStyleTag({
      content: `
      .site-header,.controls,.timeline,.status,.inspector,footer,.below-plot>div{display:none!important}
      main{padding:0 36px}
      #visualizer .page-intro{padding:32px 0 10px}
      #visualizer .page-intro>div{display:block}
      #visualizer .page-intro h1{font-size:38px}
      #visualizer .page-intro p:last-child{margin:9px 0 0;font-size:12px}
      #visualizer .reading-key{padding:15px 0}
      #visualizer .comparison{gap:17px}
      #visualizer .comparison .algorithm-card{padding:14px 15px}
      #visualizer .card-heading h2{font-size:26px}
      #visualizer .card-heading a,#visualizer .card-observation{display:none}
      #visualizer .card-tag{display:block;margin:4px 0}
      #visualizer #comparison .reward-plot{height:240px}
      #visualizer .card-metrics{margin-top:0;padding-top:9px}
      #visualizer .card-metrics b{font-size:20px}
      #visualizer .card-metrics small{font-size:10px}
      #visualizer .below-plot{margin-top:22px;padding:0;border:0}
      #visualizer .below-plot>p{font-size:11px;max-width:none}
      .below-plot a{display:none}
    `,
    });
    await page.evaluate(() => {
      document.querySelector(".page-intro h1").textContent =
        "ρ · Policy updates";
      document.querySelector(".page-intro p:last-child").textContent =
        "Bell-shaped start · update 25 · 32 samples per update · seed 42";
      document.querySelector(".below-plot>p").textContent =
        "Finite categorical demonstrations · 21 outcomes · not language-model training.   ayushnangia.github.io/reward-lab";
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.resolve(__dirname, "../assets/rho-visualizer.png"),
      animations: "disabled",
    });
    console.log(
      "Rendered the actual comparison at update 25 to assets/rho-visualizer.png.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
