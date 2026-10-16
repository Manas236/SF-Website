/* ============================================================
   Build src/data/gallery-hashes.json
   ------------------------------------------------------------
   The dHash of every stock photo, keyed by its `file` name, so the
   studio upload can warn about a near-copy without reading the images
   at run time. MUST use the same algorithm as src/lib/dhash.ts.
   Run after scripts/build-stock-images.mjs.

   Usage:  node scripts/build-gallery-hashes.mjs
   ============================================================ */
import sharp from "sharp";
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = path.join(ROOT, "public", "images", "stock");
const OUT = path.join(ROOT, "src", "data", "gallery-hashes.json");

/* Same as src/lib/dhash.ts. */
async function dhash(image) {
  const px = await image.clone().rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) bits += px[r * 9 + c] > px[r * 9 + c + 1] ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

const out = {};
for (const name of readdirSync(DIR).sort()) {
  const m = /^(.+)-960\.jpg$/.exec(name);
  if (!m) continue;
  out[`${m[1]}.jpg`] = await dhash(sharp(path.join(DIR, name)));
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`${Object.keys(out).length} hashes written to src/data/gallery-hashes.json`);
