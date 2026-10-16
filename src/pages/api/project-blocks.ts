/* ============================================================
   POST /api/project-blocks: entries on the /projects lists
   ------------------------------------------------------------
   Body: { action: "add", slug, kind: "heading" | "paragraph", text }
      or { action: "remove", slug, id }
      or { action: "move", slug, id, position }
   slug is "ongoing" or "completed".

   Behind the same signed-cookie session as /api/content, checked before
   the body is read. project_text_events is append-only (see
   src/lib/project-blocks.ts). The page reads its blocks itself when it
   renders, so there is no GET; the editor reloads after each change.
   ============================================================ */
import type { APIRoute } from "astro";
import type { ResultSetHeader } from "mysql2";
import pool from "../../lib/db";
import { isAuthed } from "../../lib/edit-auth";
import { clientIpFrom, json, userAgentFrom } from "../../lib/editable";
import { isProjectSlug, readBlockRows, replayBlocks, validateBlock } from "../../lib/project-blocks";

export const prerender = false;

const INSERT = `
  INSERT INTO project_text_events
    (action, page_slug, block_id, kind, text, position, client_ip, user_agent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

const MAX_BODY = 16 * 1024;

export const POST: APIRoute = async (context) => {
  const { request } = context;
  if (!isAuthed(request)) return json({ error: "Your editing session has ended." }, 401);

  let socket: string | null = null;
  try {
    socket = context.clientAddress;
  } catch {
    socket = null;
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return json({ error: "That is too much text." }, 413);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Could not read the change." }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "Could not read the change." }, 400);

  const slug = body.slug;
  if (!isProjectSlug(slug)) return json({ error: "That list cannot be edited." }, 400);

  const ip = clientIpFrom(request, socket);
  const ua = userAgentFrom(request);

  try {
    if (body.action === "add") {
      const check = validateBlock(body);
      if (!check.ok) return json({ error: check.reason }, 400);
      const [res] = await pool.execute<ResultSetHeader>(INSERT, ["add", slug, null, check.kind, check.text, null, ip, ua]);
      return json({ ok: true, id: res.insertId });
    }

    if (body.action === "remove" || body.action === "move") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id < 1) return json({ error: "Could not identify that text." }, 400);

      // Only a block that is in this list now can be removed or moved.
      const blocks = replayBlocks(await readBlockRows(slug));
      const at = blocks.findIndex((b) => b.id === id);
      if (at < 0) return json({ error: "That text is already gone." }, 404);

      if (body.action === "remove") {
        await pool.execute<ResultSetHeader>(INSERT, ["remove", slug, id, null, null, null, ip, ua]);
        return json({ ok: true });
      }

      const position = Number(body.position);
      if (!Number.isInteger(position) || position < 0 || position >= blocks.length)
        return json({ error: "It cannot move any further." }, 400);
      if (position === at) return json({ ok: true });
      await pool.execute<ResultSetHeader>(INSERT, ["move", slug, id, null, null, position, ip, ua]);
      return json({ ok: true });
    }

    return json({ error: "Could not read the change." }, 400);
  } catch (err) {
    console.error("Failed to save project text block:", err);
    return json({ error: "Could not save. Please try again." }, 500);
  }
};
