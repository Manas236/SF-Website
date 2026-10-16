/* ============================================================
   Project text blocks: server side
   ------------------------------------------------------------
   The /projects page has two lists, "ongoing" and "completed". Both
   start empty and show a designed "coming soon" state. A signed-in
   editor adds entries in edit mode (src/scripts/project-blocks-editor.js
   -> src/pages/api/project-blocks.ts): a HEADING starts a project and
   the PARAGRAPHS after it describe it (src/components/ProjectList.astro).

   Stored in project_text_events (db/migrate.sql), APPEND-ONLY:

     add     action = 'add'; its own id IS the block id
     remove  action = 'remove', block_id = that id
     move    action = 'move', block_id, position = its new index

   A list's blocks = its 'add' rows in id order, minus the removed ones,
   with the moves replayed over them.

   A block's WORDING is changed like any other text on the site: it is
   an ordinary editable element under the key projects.blocks.<id>, so
   its edits and their history live in content_edits.

   The app never creates the table (its database user may only SELECT
   and INSERT). If the table is missing, the lists show empty and adding
   an entry says so.

   Server-only: imports the database pool.
   ============================================================ */
import type { RowDataPacket } from "mysql2";
import pool from "./db";
import { MAX_TEXT, cleanText } from "./editable";

export type BlockKind = "heading" | "paragraph";

export interface TextBlock {
  readonly id: number;
  readonly kind: BlockKind;
  readonly text: string;
}

export const MAX_HEADING = 160;

/** The lists the /projects page has; the value is stored as page_slug. */
export const PROJECT_LISTS = ["ongoing", "completed"] as const;
export type ProjectList = (typeof PROJECT_LISTS)[number];

export function isProjectSlug(slug: unknown): slug is ProjectList {
  return typeof slug === "string" && (PROJECT_LISTS as readonly string[]).includes(slug);
}

export interface BlockRow {
  id: number;
  action: "add" | "remove" | "move";
  block_id: number | null;
  kind: BlockKind | null;
  text: string | null;
  position: number | null;
}

const SELECT_EVENTS = `
  SELECT id, action, block_id, kind, text, position
    FROM project_text_events
   WHERE page_slug = ?
   ORDER BY id ASC
`;

/** Replay one list's rows into its blocks, in page order. */
export function replayBlocks(rows: readonly BlockRow[]): TextBlock[] {
  const list: TextBlock[] = [];
  for (const r of rows) {
    if (r.action === "add" && r.kind && r.text) {
      list.push({ id: r.id, kind: r.kind, text: r.text });
    } else if (r.action === "remove") {
      const i = list.findIndex((b) => b.id === r.block_id);
      if (i >= 0) list.splice(i, 1);
    } else if (r.action === "move" && r.position != null) {
      const i = list.findIndex((b) => b.id === r.block_id);
      if (i < 0) continue;
      const [b] = list.splice(i, 1);
      list.splice(Math.max(0, Math.min(r.position, list.length)), 0, b);
    }
  }
  return list;
}

export async function readBlockRows(slug: string): Promise<BlockRow[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(SELECT_EVENTS, [slug]);
  return rows as BlockRow[];
}

/** One list's blocks. Never throws: if the database cannot be read the
    list shows empty, which is its designed state anyway. */
export async function blocksFor(slug: string): Promise<TextBlock[]> {
  try {
    return replayBlocks(await readBlockRows(slug));
  } catch (err) {
    console.error("Failed to read project text blocks:", err);
    return [];
  }
}

export type BlockCheck = { ok: true; kind: BlockKind; text: string } | { ok: false; reason: string };

/** One validation pass for a new block. */
export function validateBlock(input: Record<string, unknown>): BlockCheck {
  const kind = input.kind;
  if (kind !== "heading" && kind !== "paragraph") return { ok: false, reason: "Choose a project name or a description." };
  const text = cleanText(input.text);
  if (!text) return { ok: false, reason: "Type the text first." };
  const max = kind === "heading" ? MAX_HEADING : MAX_TEXT;
  if (text.length > max) return { ok: false, reason: `Keep it under ${max} characters.` };
  return { ok: true, kind, text };
}

/* ------------------------------------------------------------
   Grouping for display: a heading starts a project, the paragraphs
   after it belong to it. Paragraphs before the first heading form an
   untitled entry, so nothing an editor adds is ever hidden.
   ------------------------------------------------------------ */
export interface ProjectEntry {
  readonly heading: TextBlock | null;
  readonly body: readonly TextBlock[];
}

export function groupEntries(blocks: readonly TextBlock[]): ProjectEntry[] {
  const out: { heading: TextBlock | null; body: TextBlock[] }[] = [];
  for (const b of blocks) {
    if (b.kind === "heading" || out.length === 0) out.push({ heading: b.kind === "heading" ? b : null, body: [] });
    if (b.kind === "paragraph") out[out.length - 1].body.push(b);
  }
  return out;
}
