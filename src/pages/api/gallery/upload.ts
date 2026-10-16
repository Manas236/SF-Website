/* ============================================================
   POST /api/gallery/upload: add a photograph from the studio
   ------------------------------------------------------------
   One photograph per request, so the manager shows progress per photo
   and one bad file fails alone. The BODY IS THE FILE ITSELF
   (Content-Type: application/octet-stream), at most 25 MB; the rest
   rides in headers, each URI-encoded:

     X-Gallery-Group    the service group it goes into
     X-Gallery-Caption  REQUIRED; same rules as a caption edit
     X-Gallery-Force    "1" to upload even though it looks like a photo
                        the site already has
     X-File-Name        what the editor's computer called it (audit only)

   WHY NOT A FORM POST: Astro refuses a multipart or urlencoded POST whose
   Origin header does not match the URL it thinks it is serving. Behind a
   reverse proxy those two can disagree and every upload would be a 403.
   A raw body is not a form, so that check does not apply. Cross-site
   requests are still shut out: the edit cookie is SameSite=Lax, so a
   POST from another site arrives without it and fails isAuthed().

   In order: session, size, rate, fields, "is it really a photo",
   near-duplicate check, then the files (src/lib/gallery-media.ts), then
   two INSERTs: gallery_uploads (what was uploaded) and a gallery_events
   `add` row (where it shows). It is live on the next page load and can
   be hidden or undone like every other studio change.

   NEAR-DUPLICATES: the photo's dHash is compared with every photo the
   site has (src/data/gallery-hashes.json for the stock set, plus
   earlier uploads). A close match answers 409 with that photo's details
   and writes nothing; the manager lets the editor upload anyway or skip.

   If a file is written but the INSERTs fail, the file stays on disk
   unreferenced. Harmless: nothing serves an unknown name.
   ============================================================ */
import type { APIRoute } from "astro";
import type { RowDataPacket } from "mysql2";
import pool from "../../../lib/db";
import { isAuthed } from "../../../lib/edit-auth";
import { clientIpFrom, json, userAgentFrom } from "../../../lib/editable";
import { checkCaption, findPhoto, isGroup, labelOf, readEvents, replay } from "../../../lib/gallery-live";
import { MAX_UPLOAD_BYTES, inspect, store } from "../../../lib/gallery-media";
import { NEAR_DUPLICATE_BITS, distance } from "../../../lib/dhash";
import assetHashes from "../../../data/gallery-hashes.json";
import { snapshot } from "../../../lib/gallery-snapshot";

export const prerender = false;

/* A shared passphrase guards this, so the limit is about a runaway
   script or a stolen cookie filling the disk, not normal use. */
const RATE = 150;
const WINDOW_MS = 60 * 60 * 1000;
const recent = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= RATE) {
    recent.set(key, list);
    return true;
  }
  list.push(now);
  recent.set(key, list);
  return false;
}

const TOO_BIG = "That photo is over 25 MB. Export a smaller copy and try again.";

export const POST: APIRoute = async (context) => {
  const { request } = context;
  if (!isAuthed(request)) return json({ error: "Your editing session has ended. Sign in again." }, 401);

  let socket: string | null = null;
  try {
    socket = context.clientAddress;
  } catch {
    socket = null;
  }
  const ip = clientIpFrom(request, socket);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 1024 * 1024) return json({ error: TOO_BIG }, 413);
  if (rateLimited(ip ?? "unknown")) {
    return json({ error: "Too many uploads in the last hour. Wait a while and try again." }, 429);
  }

  const header = (name: string): string => {
    const raw = request.headers.get(name) ?? "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return "";
    }
  };
  const group = header("x-gallery-group");
  if (!isGroup(group)) return json({ error: "Choose which service the photo belongs to." }, 400);
  const checked = checkCaption(header("x-gallery-caption"));
  if ("error" in checked) return json({ error: checked.error }, 400);
  const force = header("x-gallery-force") === "1";
  const originalName = header("x-file-name").slice(0, 255) || null;

  let buf: Buffer;
  try {
    buf = Buffer.from(await request.arrayBuffer());
  } catch {
    return json({ error: "Could not read the upload." }, 400);
  }
  if (buf.length === 0) return json({ error: "No photo was attached." }, 400);
  if (buf.length > MAX_UPLOAD_BYTES) return json({ error: TOO_BIG }, 413);

  const photo = await inspect(buf);
  if (!photo.ok) return json({ error: photo.error }, 400);

  const events = await readEvents();
  if (!events) return json({ error: "Could not read the gallery. Nothing was uploaded." }, 503);

  if (!force) {
    let uploaded: RowDataPacket[] = [];
    try {
      [uploaded] = await pool.execute<RowDataPacket[]>("SELECT file, hash FROM gallery_uploads");
    } catch (err) {
      console.error("Failed to read gallery uploads:", err);
      return json({ error: "Could not check for duplicates. Nothing was uploaded." }, 503);
    }
    const all: [string, string][] = [
      ...Object.entries(assetHashes as Record<string, string>),
      ...uploaded.map((r) => [r.file as string, r.hash as string] as [string, string]),
    ];
    let best: { file: string; d: number } | null = null;
    for (const [f, h] of all) {
      const d = distance(photo.hash, h);
      if (d <= NEAR_DUPLICATE_BITS && (!best || d < best.d)) best = { file: f, d };
    }
    if (best) {
      const match = findPhoto(replay(events), best.file);
      return json(
        {
          duplicate: {
            file: best.file,
            group: match ? labelOf(match.group) : null,
            caption: match?.caption ?? "",
            hidden: match?.hidden ?? true,
            upload: match?.upload ?? false,
            exact: best.d === 0,
          },
        },
        409
      );
    }
  }

  let stored;
  try {
    stored = await store(photo.image);
  } catch (err) {
    console.error("Failed to write upload:", err);
    return json({ error: "Could not save the photo on the server. Nothing was uploaded." }, 500);
  }

  const ua = userAgentFrom(request);
  try {
    await pool.execute(
      `INSERT INTO gallery_uploads (file, width, height, bytes, hash, original_name, client_ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [stored.file, stored.width, stored.height, stored.bytes, photo.hash, originalName, ip, ua]
    );
    await pool.execute(
      `INSERT INTO gallery_events (action, file, target_group, position, caption, ref_id, client_ip, user_agent)
       VALUES ('add', ?, ?, NULL, ?, NULL, ?, ?)`,
      [stored.file, group, checked.caption, ip, ua]
    );
  } catch (err) {
    console.error("Failed to record upload:", err);
    return json({ error: "The photo was saved but could not be added to the gallery. Try again." }, 500);
  }

  const after = await readEvents();
  if (!after) return json({ error: "Uploaded, but could not reload. Refresh the page." }, 503);
  return json({ uploaded: stored.file, ...(await snapshot(after)) });
};
