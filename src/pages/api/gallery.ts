/* ============================================================
   GET  /api/gallery   the whole gallery for the studio manager
   POST /api/gallery   one change
   ------------------------------------------------------------
   Both halves are behind the same signed-cookie session as
   /api/content, checked before the body is read. The public pages never
   call this: they read the live gallery themselves when they render
   (src/lib/gallery-live.ts).

   Body for POST:
     { action: "hide",    file }
     { action: "show",    file }
     { action: "move",    file, group, position? }   position omitted = end
     { action: "caption", file, caption }
     { action: "slot",    slot, file }               page image slot
     { action: "undo",    ref }                      ref = an event id

   gallery_events is APPEND-ONLY: every POST is one INSERT, an undo is a
   row of its own, nothing is UPDATEd or DELETEd. Each POST answers with
   the fresh state, so the manager repaints from what the server holds.

   client_ip and user_agent are audit columns and are never sent back.
   ============================================================ */
import type { APIRoute } from "astro";
import type { RowDataPacket } from "mysql2";
import pool from "../../lib/db";
import { isAuthed } from "../../lib/edit-auth";
import { clientIpFrom, json, userAgentFrom } from "../../lib/editable";
import {
  checkCaption,
  hasPhoto,
  isGroup,
  readEvents,
  replay,
  type GalleryAction,
  type LiveState,
} from "../../lib/gallery-live";
import { isSlotKey } from "../../data/image-slots";
import { snapshot } from "../../lib/gallery-snapshot";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthed(request)) return json({ error: "Not signed in." }, 401);
  const events = await readEvents();
  if (!events) return json({ error: "Could not read the gallery. Try again in a moment." }, 503);
  return json(await snapshot(events));
};

interface Insert {
  action: GalleryAction;
  file: string | null;
  group: string | null;
  position: number | null;
  caption: string | null;
  ref: number | null;
}

function validate(body: Record<string, unknown>, state: LiveState): Insert | string {
  const action = body.action;
  const file = body.file;

  if (action === "undo") {
    const ref = Number(body.ref);
    if (!Number.isInteger(ref) || ref < 1) return "Nothing to undo.";
    return { action, file: null, group: null, position: null, caption: null, ref };
  }

  if (!hasPhoto(state, file)) return "That photo is not in the gallery.";

  switch (action) {
    case "hide":
    case "show":
      return { action, file, group: null, position: null, caption: null, ref: null };
    case "move": {
      if (!isGroup(body.group)) return "Choose one of the service groups.";
      let position: number | null = null;
      if (body.position != null) {
        const p = Number(body.position);
        if (!Number.isInteger(p) || p < 0 || p > 5000) return "That position is not valid.";
        position = p;
      }
      return { action, file, group: body.group, position, caption: null, ref: null };
    }
    case "caption": {
      const checked = checkCaption(body.caption);
      if ("error" in checked) return checked.error;
      return { action, file, group: null, position: null, caption: checked.caption, ref: null };
    }
    case "slot": {
      if (!isSlotKey(body.slot)) return "That page image is not one the site has.";
      return { action, file, group: body.slot, position: null, caption: null, ref: null };
    }
    default:
      return "Unknown change.";
  }
}

const INSERT = `
  INSERT INTO gallery_events
    (action, file, target_group, position, caption, ref_id, client_ip, user_agent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

const MAX_BODY = 4096;

export const POST: APIRoute = async (context) => {
  const { request } = context;
  if (!isAuthed(request)) return json({ error: "Not signed in." }, 401);

  // clientAddress throws where the adapter cannot supply one.
  let socket: string | null = null;
  try {
    socket = context.clientAddress;
  } catch {
    socket = null;
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return json({ error: "That request is too large." }, 413);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Could not read the request." }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "Could not read the request." }, 400);

  const before = await readEvents();
  if (!before) return json({ error: "Could not read the gallery. Nothing was changed." }, 503);
  const change = validate(body, replay(before));
  if (typeof change === "string") return json({ error: change }, 400);

  try {
    if (change.action === "undo") {
      const [rows] = await pool.execute<RowDataPacket[]>("SELECT id FROM gallery_events WHERE id = ?", [change.ref]);
      if (!rows.length) return json({ error: "That change no longer exists." }, 400);
    }
    await pool.execute(INSERT, [
      change.action,
      change.file,
      change.group,
      change.position,
      change.caption,
      change.ref,
      clientIpFrom(request, socket),
      userAgentFrom(request),
    ]);
  } catch (err) {
    console.error("Failed to save gallery change:", err);
    return json({ error: "Could not save. Nothing was changed." }, 500);
  }

  const events = await readEvents();
  if (!events) return json({ error: "Saved, but could not reload. Refresh the page." }, 503);
  return json(await snapshot(events));
};
