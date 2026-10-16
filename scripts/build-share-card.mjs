/* ============================================================
   Share card: public/share-card.png (1200x630)
   ------------------------------------------------------------
   The picture WhatsApp, LinkedIn and search show beside a link to any
   page. BaseLayout points og:image and twitter:image at it.

   ON IT: the roundel, the wordmark painted the signboard's way
   (SAMRUDDHI in red, FIRE in white on navy), and the service area.
   Nothing that would need keeping true by hand: no figures, no claims.

   Nothing is typed twice: the colours are read from
   src/styles/tokens.css, the logo is the site's own, and the name is
   set in the DM Sans file the site ships. The composition sits inside
   the middle 630px, because some previews crop to a centred square.

   Drawn by a real browser so the type is shaped exactly as on the site.
   Usage:  node scripts/build-share-card.mjs
   ============================================================ */
import { chromium } from "playwright";
import sharp from "sharp";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = path.join(ROOT, "public", "share-card.png");
const W = 1200;
const H = 630;

const tokens = readFileSync(path.join(ROOT, "src/styles/tokens.css"), "utf8");
const token = (name) => {
  const m = tokens.match(new RegExp(`--sf-${name}:\\s*(#[0-9a-fA-F]{6});`));
  if (!m) throw new Error(`tokens.css has no --sf-${name}`);
  return m[1];
};
const NAVY_DARK = token("navy-dark");
const NAVY = token("navy");
const RED = token("red");
const RED_ON_DARK = token("red-on-dark");
const NAVY_LIGHT = token("navy-light");

const dataUrl = (file, type) => `data:${type};base64,${readFileSync(path.join(ROOT, file)).toString("base64")}`;
const logo = dataUrl("public/images/logo/sf-logo-512.png", "image/png");
const font700 = dataUrl("node_modules/@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff2", "font/woff2");
const font500 = dataUrl("node_modules/@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff2", "font/woff2");

const html = `<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family: "DM Sans"; src: url("${font700}") format("woff2"); font-weight: 700; }
  @font-face { font-family: "DM Sans"; src: url("${font500}") format("woff2"); font-weight: 500; }
  html, body { margin: 0; }
  .card { position: relative; width: ${W}px; height: ${H}px; background: ${NAVY_DARK}; overflow: hidden; font-family: "DM Sans", sans-serif; }
  .ring1 { position: absolute; width: 760px; height: 760px; right: -260px; top: -220px; border-radius: 50%; border: 48px solid ${RED}; opacity: .22; }
  .ring2 { position: absolute; width: 520px; height: 520px; left: -220px; bottom: -260px; border-radius: 50%; border: 36px solid ${NAVY}; }
  .stack { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .disc { width: 220px; height: 220px; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; }
  .disc img { width: 180px; height: 180px; }
  .name { margin: 36px 0 0; font-weight: 700; font-size: 64px; line-height: 1; letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; }
  .name .a { color: ${RED_ON_DARK}; } .name .b { color: #fff; }
  .rule { width: 56px; height: 4px; border-radius: 4px; background: ${RED}; margin-top: 26px; }
  .area { margin: 22px 0 0; font-weight: 500; font-size: 28px; color: ${NAVY_LIGHT}; }
</style>
<div class="card"><div class="ring1"></div><div class="ring2"></div>
  <div class="stack">
    <div class="disc"><img src="${logo}" alt=""></div>
    <p class="name"><span class="a">Samruddhi</span> <span class="b">Fire</span></p>
    <span class="rule"></span>
    <p class="area">Fire protection in Mumbai, Navi Mumbai and Thane</p>
  </div>
</div>`;

let browser;
try {
  browser = await chromium.launch({ channel: "chrome" });
} catch {
  browser = await chromium.launch();
}
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
if (!(await page.evaluate(() => document.fonts.check('700 64px "DM Sans"')))) throw new Error("DM Sans did not load");
const widest = await page.evaluate(() => Math.max(...[...document.querySelectorAll(".name, .area")].map((n) => n.getBoundingClientRect().width)));
if (widest > W - 80) throw new Error(`text is ${Math.round(widest)}px wide, too wide for the card`);
const shot = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();

await sharp(shot).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(OUT);
console.log(`public/share-card.png  ${W}x${H}  ${(statSync(OUT).size / 1024).toFixed(1)} kB`);
