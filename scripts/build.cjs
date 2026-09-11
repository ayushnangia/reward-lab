// docs/ is generated. Only these runtime assets are published.
const fs = require("node:fs"),
  path = require("node:path"),
  { createHash } = require("node:crypto");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "docs");
const files = [
  "index.html",
  "rho.css",
  "visualizer.js",
  "theme.js",
  "audio.js",
  "algorithms.js",
  "core.js",
  "config.js",
  "content.js",
  "LICENSE",
  "assets/favicon.svg",
  "assets/rho-visualizer.png",
];
// KaTeX ships its fonts beside its stylesheet; keep those relative paths intact.
const mathAssets = "assets/katex";
files.push(
  ...fs
    .readdirSync(path.join(root, mathAssets), { recursive: true })
    .filter((file) => fs.statSync(path.join(root, mathAssets, file)).isFile())
    .map((file) => `${mathAssets}/${file}`),
);
for (const file of files)
  if (!fs.existsSync(path.join(root, file)))
    throw Error(`Missing public asset: ${file}`);
if (fs.existsSync(out) && fs.lstatSync(out).isSymbolicLink())
  throw Error("Refusing to replace a symlink at docs/.");
fs.rmSync(out, { recursive: true, force: true });
for (const file of files) {
  fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}
// Avoid mixing cached scripts/styles from different releases.
const html = fs
  .readFileSync(path.join(out, "index.html"), "utf8")
  .replace(/(src|href)="([^"?]+\.(?:js|css))"/g, (tag, attr, file) => {
    const version = createHash("sha256")
      .update(fs.readFileSync(path.join(out, file)))
      .digest("hex")
      .slice(0, 10);
    return `${attr}="${file}?v=${version}"`;
  });
fs.writeFileSync(path.join(out, "index.html"), html);
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log("Built the two-page static visualizer in docs/.");
