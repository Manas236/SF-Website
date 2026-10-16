/* ============================================================
   The live gallery: src/data/gallery.ts with the studio's changes
   ------------------------------------------------------------
   gallery.ts is the BASELINE. The studio gallery manager never edits
   it. It appends rows to gallery_events (db/migrate.sql) and every page
   that shows a photograph replays those rows over the baseline when it
   renders.

   Why replay instead of storing "the current gallery": the table is
   append-only, like content_edits, so nothing a signed-in editor does
   can destroy anything. Any change can be undone (an `undo` row), and
   an undo can itself be undone.

   Actions, in id order:
     hide     file                       take a photo off the site
     show     file                       put it back
     move     file, target_group, position   move or reorder it;
                                         position NULL = end
     caption  file, caption              new caption, everywhere
     add      file, target_group, caption    a studio upload
     slot     file, target_group = slot key  use this photo for a page
                                         image slot (src/data/image-slots.ts)
     undo     ref_id                     cancel event ref_id

   IF THE DATABASE CANNOT BE READ, pages show the baseline. A slightly
   stale gallery beats a broken page.

   Server-only: imports the database pool.
   ============================================================ */
import type { RowDataPacket } from "mysql2";
import pool from "./db";
import { cleanText } from "./editable";
import { galleryGroups, type GalleryPhoto } from "../data/gallery";
import { getSlot, imageSlots, isSlotKey } from "../data/image-slots";

export type GalleryAction = "hide" | "show" | "move" | "caption" | "undo" | "add" | "slot";

export interface GalleryEvent {
  readonly id: number;
  readonly action: GalleryAction;
  readonly file: string | null;
  readonly target_group: string | null;
  readonly position: number | null;
  readonly caption: string | null;
  readonly ref_id: number | null;
  readonly created_at?: string;
}

/* ------------------------------------------------------------
   Renamed groups
   ------------------------------------------------------------
   A group key is stored in gallery_events. If a group is ever renamed
   (a service id changes), map the OLD key to the new one here, so the
   moves, uploads and reorders already recorded under it are replayed
   into the new group instead of being dropped. Never delete an entry.
   ------------------------------------------------------------ */
export const RENAMED_GROUPS: Readonly<Record<string, string>> = {};

export const renamedGroup = (key: string): string => {
  let k = key;
  // Follow a chain of renames, but never loop.
  for (let i = 0; i < 10 && RENAMED_GROUPS[k]; i++) k = RENAMED_GROUPS[k];
  return k;
};

const groupIds = new Set(galleryGroups.map((g) => g.id));
const groupLabel = new Map(galleryGroups.map((g) => [g.id, g.label]));

export function isGroup(id: unknown): id is string {
  return typeof id === "string" && groupIds.has(id);
}

export function labelOf(id: string): string {
  return groupLabel.get(id) ?? id;
}

/* Every photo in the baseline. */
const baselinePhotos: { file: string; caption: string; group: string }[] = [];
for (const g of galleryGroups) {
  for (const p of g.photos) baselinePhotos.push({ file: p.file, caption: p.caption, group: g.id });
}

/* ------------------------------------------------------------
   Replay
   ------------------------------------------------------------ */
export interface LivePhoto extends GalleryPhoto {
  readonly hidden: boolean;
  /** Uploaded in the studio: its files are in MEDIA_DIR. */
  readonly upload: boolean;
  /** The caption it shipped (or was uploaded) with, before any edit. */
  readonly baseCaption: string;
}

export interface LiveState {
  /** Every group with every photo, hidden ones included, in order. */
  readonly groups: ReadonlyMap<string, readonly LivePhoto[]>;
  /** Slot key -> the photo chosen for it, where it differs from the baseline. */
  readonly slots: ReadonlyMap<string, string>;
  /** False when the events could not be read: this is the baseline. */
  readonly fromDatabase: boolean;
}

/** Which events count, after undo rows are applied. An undo toggles its
    target, so undoing an undo puts the change back. */
export function effectiveEvents(events: readonly GalleryEvent[]): GalleryEvent[] {
  const cancelled = new Set<number>();
  // Walk backwards: the latest undo decides. An undo that is itself
  // cancelled by a later undo does not cancel its target.
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.action !== "undo" || e.ref_id == null) continue;
    if (cancelled.has(e.id)) continue;
    cancelled.add(e.ref_id);
  }
  return events.filter((e) => e.action !== "undo" && !cancelled.has(e.id));
}

export function replay(events: readonly GalleryEvent[], fromDatabase = true): LiveState {
  const order = new Map<string, string[]>();
  const caption = new Map<string, string>();
  const baseCaption = new Map<string, string>();
  const hidden = new Set<string>();
  const uploads = new Set<string>();
  const placement = new Map<string, string>();
  const slots = new Map<string, string>();

  for (const g of galleryGroups) order.set(g.id, []);
  for (const p of baselinePhotos) {
    order.get(p.group)!.push(p.file);
    placement.set(p.file, p.group);
    caption.set(p.file, p.caption);
    baseCaption.set(p.file, p.caption);
  }

  for (const raw of effectiveEvents(events)) {
    const file = raw.file;
    if (!file) continue;

    // A slot row names a slot, not a group: no group renaming.
    if (raw.action === "slot") {
      if (raw.target_group && isSlotKey(raw.target_group) && placement.has(file)) slots.set(raw.target_group, file);
      continue;
    }

    const e = raw.target_group ? { ...raw, target_group: renamedGroup(raw.target_group) } : raw;

    // An upload enters here: at the end of its group (or at `position`),
    // visible, with the caption it was uploaded with.
    if (e.action === "add") {
      if (placement.has(file) || !e.target_group || !order.has(e.target_group)) continue;
      const to = order.get(e.target_group)!;
      const at = e.position == null ? to.length : Math.max(0, Math.min(e.position, to.length));
      to.splice(at, 0, file);
      placement.set(file, e.target_group);
      caption.set(file, e.caption ?? "");
      baseCaption.set(file, e.caption ?? "");
      uploads.add(file);
      continue;
    }
    if (!placement.has(file)) continue;
    switch (e.action) {
      case "hide":
        hidden.add(file);
        break;
      case "show":
        hidden.delete(file);
        break;
      case "caption":
        if (e.caption) caption.set(file, e.caption);
        break;
      case "move": {
        if (!e.target_group || !order.has(e.target_group)) break;
        const from = order.get(placement.get(file)!)!;
        from.splice(from.indexOf(file), 1);
        const to = order.get(e.target_group)!;
        const at = e.position == null ? to.length : Math.max(0, Math.min(e.position, to.length));
        to.splice(at, 0, file);
        placement.set(file, e.target_group);
        hidden.delete(file);
        break;
      }
    }
  }

  const groups = new Map<string, LivePhoto[]>();
  for (const [id, files] of order) {
    groups.set(
      id,
      files.map((file) => ({
        file,
        caption: caption.get(file)!,
        baseCaption: baseCaption.get(file)!,
        hidden: hidden.has(file),
        upload: uploads.has(file),
      }))
    );
  }
  return { groups, slots, fromDatabase };
}

const SELECT_EVENTS = `
  SELECT id, action, file, target_group, position, caption, ref_id, created_at
    FROM gallery_events
   ORDER BY id ASC
`;

export async function readEvents(): Promise<GalleryEvent[] | null> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(SELECT_EVENTS);
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      file: r.file,
      target_group: r.target_group,
      position: r.position,
      caption: r.caption,
      ref_id: r.ref_id,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
    }));
  } catch (err) {
    console.error("Failed to read gallery events:", err);
    return null;
  }
}

/** Longest caption, in characters. */
export const MAX_CAPTION = 200;

/** A caption cleaned and checked, or the reason it cannot be used. */
export function checkCaption(raw: unknown): { caption: string } | { error: string } {
  const caption = cleanText(raw);
  if (!caption) return { error: "A caption cannot be empty." };
  if (caption.length > MAX_CAPTION) return { error: `Keep captions under ${MAX_CAPTION} characters.` };
  return { caption };
}

/** Width and height of every studio upload, from gallery_uploads. */
export async function uploadSizes(): Promise<Map<string, { w: number; h: number }>> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT file, width, height FROM gallery_uploads");
    return new Map(rows.map((r) => [r.file as string, { w: r.width as number, h: r.height as number }]));
  } catch (err) {
    console.error("Failed to read gallery uploads:", err);
    return new Map();
  }
}

/** Whether a photo is anywhere in this state, hidden or not. */
export function hasPhoto(state: LiveState, file: unknown): file is string {
  if (typeof file !== "string") return false;
  for (const photos of state.groups.values()) if (photos.some((p) => p.file === file)) return true;
  return false;
}

/** One photo's live details, or null. */
export function findPhoto(state: LiveState, file: string): (LivePhoto & { group: string }) | null {
  for (const [group, photos] of state.groups) {
    const p = photos.find((x) => x.file === file);
    if (p) return { ...p, group };
  }
  return null;
}

/** The live gallery for one page render. Never throws. */
export async function liveState(): Promise<LiveState> {
  const events = await readEvents();
  return events ? replay(events) : replay([], false);
}

/* ------------------------------------------------------------
   What pages render
   ------------------------------------------------------------ */
export function visiblePhotos(state: LiveState, group: string): GalleryPhoto[] {
  return (state.groups.get(group) ?? []).filter((p) => !p.hidden).map((p) => ({ file: p.file, caption: p.caption }));
}

/** Every group with photos on the site, in service order. */
export function liveGroups(state: LiveState): { id: string; label: string; photos: GalleryPhoto[] }[] {
  return galleryGroups
    .map((g) => ({ id: g.id, label: g.label, photos: visiblePhotos(state, g.id) }))
    .filter((g) => g.photos.length);
}

/** The photo a page image slot shows now: the studio's choice, else the
    baseline. Its caption is the alt text. */
export function slotPhoto(state: LiveState, key: string): GalleryPhoto | null {
  const slot = getSlot(key);
  if (!slot) return null;
  const chosen = state.slots.get(key);
  const file = chosen ?? slot.file;
  const live = findPhoto(state, file) ?? findPhoto(state, slot.file);
  if (!live) return null;
  return { file: live.file, caption: live.caption };
}

export { imageSlots };
