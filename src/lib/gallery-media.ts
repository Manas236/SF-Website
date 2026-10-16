/* ============================================================
   Studio uploads: turning an uploaded file into gallery renditions
   ------------------------------------------------------------
   Server-only (node:fs, sharp). Called by POST /api/gallery/upload.

   WHERE FILES GO: MEDIA_DIR from .env, falling back to ./media for
   local development. Deliberately outside the repo and outside dist/:
   a deploy rebuilds dist/ and resets the repo, and must never take an
   uploaded photograph with it. The cost is that this folder needs its
   own backup; it is not in git.

   WHAT IS WRITTEN for an upload named up-YYYYMMDD-<8 hex>:
     .jpg        the kept master, long edge at most 2400px, quality 85
     .tile.webp  960x640, centre-cropped: the same 3:2 crop as a stock
                 tile, so an uploaded tile sits flush with the rest
     .full.webp  long edge at most 1600px, for the lightbox and banners

   WHAT IS STRIPPED: everything but the pixels. sharp writes no EXIF,
   GPS, XMP or ICC unless asked, so a phone photo's location never
   reaches the public site. rotate() first applies the phone's
   orientation flag, so nothing comes out sideways.
   ============================================================ */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import "dotenv/config";
import { dhash } from "./dhash";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Smaller than this on the long edge looks soft in a banner. */
export const MIN_LONG_EDGE = 1000;

const ACCEPTED = new Set(["jpeg", "png", "webp"]);

export function mediaDir(): string {
  return path.resolve(process.env.MEDIA_DIR || "media");
}

export function galleryDir(): string {
  return path.join(mediaDir(), "gallery");
}

export type Checked =
  | { ok: true; image: sharp.Sharp; width: number; height: number; hash: string }
  | { ok: false; error: string };

/** Reads and checks an upload without writing anything. */
export async function inspect(buf: Buffer): Promise<Checked> {
  let meta: sharp.Metadata;
  const image = sharp(buf, { failOn: "error", limitInputPixels: 120_000_000 });
  try {
    meta = await image.metadata();
  } catch {
    return { ok: false, error: "That file is not a photo the site can read. Use a JPG, PNG or WebP." };
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) {
    return { ok: false, error: "Only JPG, PNG and WebP photos can be uploaded." };
  }
  // Orientation 5 to 8 means the photo is stored on its side.
  const sideways = (meta.orientation ?? 1) >= 5;
  const width = (sideways ? meta.height : meta.width) ?? 0;
  const height = (sideways ? meta.width : meta.height) ?? 0;
  if (Math.max(width, height) < MIN_LONG_EDGE) {
    return {
      ok: false,
      error: `That photo is too small (${width} x ${height}). It needs to be at least ${MIN_LONG_EDGE}px on its long side.`,
    };
  }
  return { ok: true, image, width, height, hash: await dhash(image) };
}

function newName(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `up-${ymd}-${randomBytes(4).toString("hex")}`;
}

/** Writes the three renditions. Each lands under a temporary name and
    is renamed into place, so a half-written file is never served. */
export async function store(image: sharp.Sharp): Promise<{ file: string; width: number; height: number; bytes: number }> {
  const dir = galleryDir();
  await mkdir(dir, { recursive: true });
  const base = newName();
  const upright = image.clone().rotate();

  const master = await upright
    .clone()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const tile = await upright.clone().resize(960, 640, { fit: "cover", position: "centre" }).webp({ quality: 80 }).toBuffer();
  const full = await upright
    .clone()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const put = async (name: string, data: Buffer) => {
    const target = path.join(dir, name);
    const tmp = `${target}.part`;
    await writeFile(tmp, data, { mode: 0o644 });
    await rename(tmp, target);
  };
  await put(`${base}.tile.webp`, tile);
  await put(`${base}.full.webp`, full);
  await put(`${base}.jpg`, master.data);

  return { file: `${base}.jpg`, width: master.info.width, height: master.info.height, bytes: master.data.length };
}
