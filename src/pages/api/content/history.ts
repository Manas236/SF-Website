/* ============================================================
   GET /api/content/history?path=<pathname>&key=<edit_key>
   ------------------------------------------------------------
   Every version of one piece of text, newest first. The editor shows the
   last five in its version menu. `original` on the oldest row is the
   text the page was built with.

   SIGNED IN ONLY, even though it writes nothing. /api/content returns
   the CURRENT copy, which is on the page for anyone to read anyway; this
   returns every version there has ever been, with timestamps, which is
   not public copy. The check is here, not only in the UI, because the UI
   is not a security boundary.
   ============================================================ */
import type { APIRoute } from "astro";
import type { RowDataPacket } from "mysql2";
import pool from "../../../lib/db";
import { isAuthed } from "../../../lib/edit-auth";
import { isValidKey, json, normalizePath } from "../../../lib/editable";

export const prerender = false;

/* client_ip and user_agent stay on the server. */
const SELECT_HISTORY = `
  SELECT id, original_text, new_text, created_at
    FROM content_edits
   WHERE page_path = ? AND edit_key = ?
   ORDER BY id DESC
`;

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAuthed(request))
    return json({ error: "Your editing session has ended." }, 401);

  const path = normalizePath(url.searchParams.get("path"));
  if (!path) return json({ error: "That page cannot be edited." }, 400);

  const key = url.searchParams.get("key");
  if (!isValidKey(key))
    return json({ error: "Could not identify the text on the page." }, 400);

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(SELECT_HISTORY, [path, key]);

    return json({
      path,
      key,
      history: rows.map((r) => ({
        id: r.id,
        text: r.new_text,
        original: r.original_text,
        created_at:
          r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      })),
    });
  } catch (err) {
    console.error("Failed to read content history:", err);
    return json({ error: "History is unavailable right now." }, 503);
  }
};
