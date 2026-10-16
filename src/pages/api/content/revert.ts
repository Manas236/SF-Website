/* ============================================================
   POST /api/content/revert      Body: { path, key, toId? }
   ------------------------------------------------------------
   Reverting deletes nothing. It reads an older row and writes a NEW row
   carrying that row's text forward, so the history stays a straight
   line you can keep walking back along:

     id 7  "Fire safety you can rely on"   <- an edit
     id 9  "Fire safety, done properly"    <- another
     id 12 "Fire safety you can rely on"   <- revert to id 7: a new row

   With no `toId` it is one step back (the toolbar's "Undo last change").
   With a `toId` it restores that version (the per-element menu).
   ============================================================ */
import type { APIRoute } from "astro";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../../lib/db";
import { isAuthed } from "../../../lib/edit-auth";
import {
  MAX_TEXT,
  cleanText,
  clientIpFrom,
  isValidKey,
  json,
  normalizePath,
  userAgentFrom,
} from "../../../lib/editable";

export const prerender = false;

const SELECT_HISTORY = `
  SELECT id, original_text, new_text
    FROM content_edits
   WHERE page_path = ? AND edit_key = ?
   ORDER BY id DESC
`;

/* A revert is an edit like any other and is attributed like one. */
const INSERT_EDIT = `
  INSERT INTO content_edits
    (page_path, edit_key, original_text, new_text, client_ip, user_agent)
  VALUES (?, ?, ?, ?, ?, ?)
`;

export const POST: APIRoute = async (context) => {
  const { request } = context;

  if (!isAuthed(request))
    return json({ error: "Your editing session has ended." }, 401);

  let socket: string | null = null;
  try {
    socket = context.clientAddress;
  } catch {
    socket = null;
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Could not read the request." }, 400);
  }
  if (!body || typeof body !== "object")
    return json({ error: "Could not read the request." }, 400);

  const path = normalizePath(body.path);
  if (!path) return json({ error: "That page cannot be edited." }, 400);
  if (!isValidKey(body.key))
    return json({ error: "Could not identify the text on the page." }, 400);
  const key = body.key;

  // Optional. When present it must be one of THIS key's rows, looked up
  // in the result set below, never trusted as a bare id.
  let toId: number | null = null;
  if (body.toId !== undefined && body.toId !== null) {
    toId = Number(body.toId);
    if (!Number.isInteger(toId) || toId <= 0)
      return json({ error: "That version is not valid." }, 400);
  }

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(SELECT_HISTORY, [path, key]);
    if (rows.length === 0)
      return json({ error: "This text has not been changed yet." }, 400);

    const current = rows[0];

    let target: string;
    if (toId !== null) {
      const row = rows.find((r) => r.id === toId);
      if (!row) return json({ error: "That version is no longer here." }, 400);
      target = row.new_text;
    } else if (rows.length > 1) {
      // One step back: whatever the text was before the current row.
      target = rows[1].new_text;
    } else {
      // Only one edit ever made: a step back is the built text.
      target = current.original_text;
    }

    target = cleanText(target);

    // An old row was legal when written; limits may have tightened since.
    if (!target || target.length > MAX_TEXT)
      return json({ error: "That version can no longer be restored." }, 400);

    if (target === cleanText(current.new_text))
      return json({ error: "That is already what the page says." }, 400);

    /* File the revert under the anchor in force, the NEWEST row's. Taking
       the oldest would undo an anchor adoption (see api/content.ts). */
    const anchor = rows[0].original_text;

    const [res] = await pool.execute<ResultSetHeader>(INSERT_EDIT, [
      path,
      key,
      anchor,
      target,
      clientIpFrom(request, socket),
      userAgentFrom(request),
    ]);
    return json({ ok: true, id: res.insertId, text: target });
  } catch (err) {
    console.error("Failed to revert content edit:", err);
    return json({ error: "Could not undo. Please try again." }, 500);
  }
};
