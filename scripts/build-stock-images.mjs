/* ============================================================
   Build the stock photos into public/images/stock/
   ------------------------------------------------------------
   Reads scripts/stock-sources.json (every photo's source page,
   photographer and licence site: docs/IMAGE-CREDITS.md is written from
   the same list), downloads any original that is not yet in
   raw-images/ (git-ignored), and writes for each photo:

     <file>-480.webp  <file>-960.webp  <file>-1600.webp   3:2, WebP
     <file>-960.jpg                                        the fallback

   Every rendition is cropped to 3:2 (`position` picks which part is
   kept), stripped of metadata, and compressed. The site names the photo
   `<file>.jpg` (src/lib/gallery-images.ts).

   These are stock until the client's own photos arrive; each one can be
   replaced from the studio without code (docs/DESIGN-SYSTEM.md, 7).

   Usage:  node scripts/build-stock-images.mjs
   ============================================================ */
import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RAW = path.join(ROOT, "raw-images");
const OUT = path.join(ROOT, "public", "images", "stock");
const sources = JSON.parse(readFileSync(path.join(ROOT, "scripts", "stock-sources.json"), "utf8"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

const WIDTHS = [480, 960, 1600];
let total = 0;

for (const s of sources) {
  const raw = path.join(RAW, `${s.file}.jpg`);
  if (!existsSync(raw)) {
    const res = await fetch(s.download, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${s.file}: download failed, HTTP ${res.status}`);
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  }
  let base = await sharp(raw).rotate().toBuffer();
  const meta = await sharp(base).metadata();
  const w = meta.width, h = meta.height;

  /* `blur`: regions (pixels of the original) whose text must not show, a
     maker's name or foreign-language lettering. Blurred in place. */
  if (s.blur?.length) {
    const patches = [];
    for (const r of s.blur) {
      const region = { left: r.left, top: r.top, width: r.width, height: r.height };
      const blurred = await sharp(base).extract(region).blur(r.sigma ?? 18).removeAlpha().toBuffer();
      /* A soft-edged ellipse as the alpha, so the patch fades into the
         photo instead of reading as a pasted rectangle. */
      const fade = Math.round(Math.min(r.width, r.height) * 0.18);
      const svg = `<svg width="${r.width}" height="${r.height}"><ellipse cx="${r.width / 2}" cy="${r.height / 2}" rx="${r.width / 2 - fade}" ry="${r.height / 2 - fade}" fill="#fff"/></svg>`;
      const mask = await sharp(Buffer.from(svg)).blur(Math.max(1, fade / 2)).extractChannel(0).toBuffer();
      const patch = await sharp(blurred).joinChannel(mask).png().toBuffer();
      patches.push({ input: patch, left: r.left, top: r.top });
    }
    base = await sharp(base).composite(patches).toBuffer();
  }

  /* Crop to 3:2 at the source's own resolution first, then scale.
     `extract` names the region outright; otherwise the largest 3:2 box,
     centred vertically on `focusY` (0 top, 1 bottom) or placed by
     `position`. */
  let cropped;
  if (s.extract) {
    cropped = await sharp(base).extract(s.extract).toBuffer();
  } else {
    const cropW = Math.min(w, Math.round((h * 3) / 2));
    const cropH = Math.round((cropW * 2) / 3);
    if (s.focusY != null) {
      const top = Math.max(0, Math.min(h - cropH, Math.round(s.focusY * h - cropH / 2)));
      const left = Math.round((w - cropW) / 2);
      cropped = await sharp(base).extract({ left, top, width: cropW, height: cropH }).toBuffer();
    } else {
      cropped = await sharp(base).resize(cropW, cropH, { fit: "cover", position: s.position || "centre" }).toBuffer();
    }
  }

  for (const width of WIDTHS) {
    const height = Math.round((width * 2) / 3);
    const out = path.join(OUT, `${s.file}-${width}.webp`);
    await sharp(cropped).resize(width, height).webp({ quality: width >= 1600 ? 74 : 78, effort: 6 }).toFile(out);
  }
  await sharp(cropped).resize(960, 640).jpeg({ quality: 78, mozjpeg: true, progressive: true }).toFile(path.join(OUT, `${s.file}-960.jpg`));
  total++;
  console.log(`  ${s.file}  (${w}x${h} -> 3:2, ${s.position || "centre"})`);
}
console.log(`${total} photos built into public/images/stock/`);
