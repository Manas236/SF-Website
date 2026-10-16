/* ============================================================
   GET /media/gallery/<name>: a studio upload's rendition
   ------------------------------------------------------------
   Serves the files src/lib/gallery-media.ts writes under MEDIA_DIR. The
   name must be exactly one of the three shapes an upload produces;
   anything else is a plain 404, so no path can reach outside the
   folder. Names never change once written, so they are cached for a
   year as immutable. A reverse proxy alias to the same folder can take
   this over later with no code change.
   ============================================================ */
import type { APIRoute } from "astro";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { galleryDir } from "../../../lib/gallery-media";

export const prerender = false;

const RE_NAME = /^up-\d{8}-[0-9a-f]{8}\.(?:tile\.webp|full\.webp|jpg)$/;

export const GET: APIRoute = async ({ params }) => {
  const name = params.name ?? "";
  if (!RE_NAME.test(name)) return new Response(null, { status: 404 });
  let data: Buffer;
  try {
    data = await readFile(path.join(galleryDir(), name));
  } catch {
    return new Response(null, { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": name.endsWith(".jpg") ? "image/jpeg" : "image/webp",
      "Content-Length": String(data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
