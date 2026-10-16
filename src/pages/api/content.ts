/* ============================================================
   GET  /api/content?path=<pathname>   the edits for one page
   POST /api/content                   save one edit
   ------------------------------------------------------------
   The read half runs on every page view, for every visitor: one indexed
   query, no session. It must STAY open. It is what paints the edited
   copy for the public; gate it and every visitor sees the text the site
   was built with instead of the text the client wrote.

   The write half is behind the signed-cookie session
   (src/lib/edit-auth.ts) and still trusts nothing in the body: every
   field goes through validateEdit() (src/lib/editable.ts), the same
   module the browser uses to decide what it lets you click into.

   content_edits is APPEND-ONLY. A save is an INSERT; the current text
   for a key is the row with the highest id. Nothing here UPDATEs or
   DELETEs, so the table is also the audit trail, and
   /api/content/revert can walk back through it.
   ============================================================ */
import type { APIRoute } from "astro";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../lib/db";
import { isAuthed } from "../../lib/edit-auth";
import {
  cleanText,
  clientIpFrom,
  json,
  normalizePath,
  userAgentFrom,
  validateEdit,
} from "../../lib/editable";

export const prerender = false;

/* The latest row per edit_key for one page. Columns are named one by
   one, and client_ip / user_agent are not among them: this goes to the
   browser. Never widen it to SELECT *. */
const SELECT_LATEST = `
  SELECT e.id, e.edit_key, e.original_text, e.new_text
    FROM content_edits e
    JOIN (
      SELECT edit_key, MAX(id) AS max_id
        FROM content_edits
       WHERE page_path = ?
       GROUP BY edit_key
    ) latest ON latest.max_id = e.id
`;

export const GET: APIRoute = async ({ url }) => {
  const path = normalizePath(url.searchParams.get("path"));

  // An unknown page simply has no edits. The head script asks on every
  // page, the 404 included, and a 400 there would be console noise.
  if (!path) return json({ edits: {} });

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(SELECT_LATEST, [path]);

    const edits: Record<string, { text: string; original: string; id: number }> = {};
    for (const row of rows) {
      edits[row.edit_key] = {
        text: row.new_text,
        original: row.original_text,
        id: row.id,
      };
    }
    return json({ edits });
  } catch (err) {
    console.error("Failed to read content edits:", err);
    // 503, not 500: the browser keeps showing its cached copy rather than
    // snapping the page back to the built-in text.
    return json({ edits: {}, error: "Edits are unavailable right now." }, 503);
  }
};

/* ------------------------------------------------------------
   POST: save one edit. Body: { path, key, original, text }

   `original_text` is the anchor: the text the page was BUILT with under
   that key. It does not follow the edits (a second edit would otherwise
   be filed under the first edit's text), but it does follow the BUILD:
   when the site's own copy under a key is rewritten, the stored anchor
   names a string that is no longer on the page. So the anchor on file is
   kept while the browser still reports it, and adopted from the browser
   when it does not. The browser reads `original` off the live page, so
   what arrives here was on the page by definition.
   ------------------------------------------------------------ */
const SELECT_CURRENT = `
  SELECT original_text, new_text
    FROM content_edits
   WHERE page_path = ? AND edit_key = ?
   ORDER BY id DESC
   LIMIT 1
`;

const INSERT_EDIT = `
  INSERT INTO content_edits
    (page_path, edit_key, original_text, new_text, client_ip, user_agent)
  VALUES (?, ?, ?, ?, ?, ?)
`;

/** Roughly 8x the longest legal edit. The reverse proxy caps this too. */
const MAX_BODY = 16 * 1024;

export const POST: APIRoute = async (context) => {
  const { request } = context;

  /* Before the body is read and before the database is touched. The
     wording is what the editor shows when a session runs out mid-edit. */
  if (!isAuthed(request))
    return json({ error: "Your editing session has ended." }, 401);

  // The socket address, used only if X-Forwarded-For does not parse.
  // Astro throws when the adapter cannot report it, and a save must not
  // fail over an audit column.
  let socket: string | null = null;
  try {
    socket = context.clientAddress;
  } catch {
    socket = null;
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return json({ error: "That is too much text." }, 413);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Could not read the change." }, 400);
  }
  if (!body || typeof body !== "object")
    return json({ error: "Could not read the change." }, 400);

  const check = validateEdit(body as Record<string, unknown>);
  if (!check.ok) return json({ error: check.reason }, 400);

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(SELECT_CURRENT, [
      check.path,
      check.key,
    ]);
    const latest = rows[0];

    /* The row on file, but only while its anchor is still live, i.e.
       still the string the browser reports finding on the page. Compared
       cleaned, so whitespace alone is never drift. */
    const live =
      latest && cleanText(latest.original_text) === check.original
        ? latest
        : null;

    const anchor = live ? live.original_text : check.original;

    /* What the page ACTUALLY says under this key. A row whose anchor is
       dead never paints, so the built copy shows, and that is exactly
       what the browser sent as `original`. Comparing against the dead
       row's new_text would refuse the one edit that heals the key. */
    const current = live ? cleanText(live.new_text) : check.original;

    if (current === check.text)
      return json({ error: "That is already what the page says." }, 400);

    const [res] = await pool.execute<ResultSetHeader>(INSERT_EDIT, [
      check.path,
      check.key,
      anchor,
      check.text,
      clientIpFrom(request, socket),
      userAgentFrom(request),
    ]);
    return json({ ok: true, id: res.insertId, text: check.text });
  } catch (err) {
    console.error("Failed to save content edit:", err);
    return json({ error: "Could not save. Please try again." }, 500);
  }
};
