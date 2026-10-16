/* ============================================================
   Image slots: every photograph on a page that is not in a gallery grid
   ------------------------------------------------------------
   The homepage banner, the photo beside each service, and so on. Each
   slot has a baseline photo here; the studio's "Site images" panel can
   point it at any gallery photo, stock or uploaded, with a `slot` row in
   gallery_events (src/lib/gallery-live.ts). So every stock image on the
   site can be replaced without touching code.

   `key` is stored in the database: never rename one. The alt text of a
   slot is the chosen photo's caption.
   ============================================================ */

export interface ImageSlot {
  readonly key: string;
  /** What the studio calls it. */
  readonly label: string;
  /** The page it appears on. */
  readonly page: string;
  /** Baseline photo: a `file` from src/data/gallery.ts. */
  readonly file: string;
}

export const imageSlots: readonly ImageSlot[] = [];

const slotByKey = new Map(imageSlots.map((s) => [s.key, s]));

export function getSlot(key: string): ImageSlot | undefined {
  return slotByKey.get(key);
}

export function isSlotKey(key: unknown): key is string {
  return typeof key === "string" && slotByKey.has(key);
}
