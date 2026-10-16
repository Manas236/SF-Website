/* ============================================================
   Build the logo renditions from the brand masters
   ------------------------------------------------------------
   Masters (copied from the QMS's assets/ folder, docs/DESIGN-SYSTEM.md):
     public/images/logo/sf-logo-mark.png   1024x1024, transparent
     public/favicon.ico, public/favicon-32.png   the QMS's own icons

   Writes, from the mark:
     public/images/logo/sf-logo-96.png    nav and footer (drawn at 44-48px)
     public/images/logo/sf-logo-192.png
     public/images/logo/sf-logo-512.png   structured-data logo
     public/apple-touch-icon.png          180x180 on white

   Usage:  node scripts/build-brand-assets.mjs
   ============================================================ */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const pub = (...p) => path.join(ROOT, "public", ...p);
const MARK = pub("images", "logo", "sf-logo-mark.png");

for (const size of [96, 192, 512]) {
  await sharp(MARK).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(pub("images", "logo", `sf-logo-${size}.png`));
}

/* iOS draws the touch icon on black if it is transparent: give it white,
   with a margin so the roundel is not clipped by the rounded mask. */
const inner = await sharp(MARK).resize(150, 150, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 4, background: "#ffffff" } })
  .composite([{ input: inner, gravity: "centre" }])
  .flatten({ background: "#ffffff" })
  .png({ compressionLevel: 9 })
  .toFile(pub("apple-touch-icon.png"));

console.log("Logo renditions written: sf-logo-96/192/512.png, apple-touch-icon.png");
