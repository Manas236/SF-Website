/* ============================================================
   Where a photograph's files are
   ------------------------------------------------------------
   Two kinds of photograph, one `file` name each:

   STOCK (the baseline in src/data/gallery.ts): pre-built by
   scripts/build-stock-images.mjs into public/images/stock/ as
       <base>-480.webp  <base>-960.webp  <base>-1600.webp   (3:2)
       <base>-960.jpg                                        (fallback)
   and named `<base>.jpg` everywhere else.

   UPLOADS (studio, src/lib/gallery-media.ts): written to MEDIA_DIR and
   served by /media/gallery/<name>, named `up-YYYYMMDD-<8 hex>.jpg`:
       .tile.webp  960x640, centre-cropped like a stock tile
       .full.webp  long edge at most 1600
       .jpg        the kept master, long edge at most 2400

   Safe to import in the browser bundle: no node:* imports.
   ============================================================ */

/** up-YYYYMMDD-<8 hex>.jpg, the `file` an uploaded photo goes by. */
export const RE_UPLOAD = /^up-\d{8}-[0-9a-f]{8}\.jpg$/;

/** A stock photo's `file`: lower-case words and digits, then .jpg. */
export const RE_STOCK = /^[a-z0-9]+(?:-[a-z0-9]+)*\.jpg$/;

export function isUpload(file: string): boolean {
  return RE_UPLOAD.test(file);
}

/** Widths built for every stock photo. Keep in step with the build script. */
export const STOCK_WIDTHS = [480, 960, 1600] as const;
/** Every stock rendition is cropped to 3:2. */
export const STOCK_RATIO = { w: 3, h: 2 } as const;

export interface PhotoSources {
  /** WebP srcset, widest last. */
  readonly srcset: string;
  /** A single URL every browser can show. */
  readonly fallback: string;
  /** MIME type of `fallback`. */
  readonly fallbackType: "image/jpeg" | "image/webp";
  /** A grid tile (about 960 wide). */
  readonly tile: string;
  /** The lightbox / hero rendition (up to 1600 wide). */
  readonly full: string;
  /** Intrinsic size to reserve, so nothing shifts as it loads. */
  readonly width: number;
  readonly height: number;
}

export function uploadUrls(file: string): { tile: string; full: string; master: string } {
  const base = file.replace(/\.jpg$/, "");
  return {
    tile: `/media/gallery/${base}.tile.webp`,
    full: `/media/gallery/${base}.full.webp`,
    master: `/media/gallery/${base}.jpg`,
  };
}

export function photoSources(file: string): PhotoSources {
  if (isUpload(file)) {
    const u = uploadUrls(file);
    return {
      srcset: `${u.tile} 960w, ${u.full} 1600w`,
      fallback: u.master,
      fallbackType: "image/jpeg",
      tile: u.tile,
      full: u.full,
      width: 960,
      height: 640,
    };
  }
  const base = file.replace(/\.jpg$/, "");
  const at = (w: number) => `/images/stock/${base}-${w}.webp`;
  return {
    srcset: STOCK_WIDTHS.map((w) => `${at(w)} ${w}w`).join(", "),
    fallback: `/images/stock/${base}-960.jpg`,
    fallbackType: "image/jpeg",
    tile: at(960),
    full: at(1600),
    width: 960,
    height: 640,
  };
}
