// Reproducible screenshots of exact computed distributions; no generated figures.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs"),
  path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  frames = path.join(root, ".qa", "media-frames");
fs.mkdirSync(frames, { recursive: true });
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
  const url = pathToFileURL(path.join(root, "social-card.html")).href;
  await page.goto(url);
  await page.waitForFunction(() => typeof renderMedia === "function");
  await page.screenshot({
    path: path.join(root, "assets", "social-card-v2.png"),
  });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(url + "?video");
  const lines = [];
  for (const k of [1, 2, 4, 8, 16, 32]) {
    await page.evaluate((k) => renderMedia(k), k);
    const file = `frame-${String(k).padStart(2, "0")}.png`;
    await page.screenshot({ path: path.join(frames, file) });
    lines.push(
      `file '${file}'`,
      `duration ${k === 1 ? 3 : k === 32 ? 4 : 2.5}`,
    );
  }
  lines.push("file 'frame-32.png'");
  fs.writeFileSync(path.join(frames, "frames.txt"), lines.join("\n") + "\n");
  await browser.close();
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      path.join(frames, "frames.txt"),
      "-vf",
      "fps=30",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      path.join(root, "assets", "reward-lab-demo.mp4"),
    ],
    { stdio: "inherit" },
  );
  console.log(
    "Rendered 1200×630 social preview and 1200×800 H.264 demonstration from exact distributions.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
