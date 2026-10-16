/* ============================================================
   The studio gallery manager's view of the gallery
   ------------------------------------------------------------
   What GET /api/gallery, POST /api/gallery and POST /api/gallery/upload
   all answer with: every group with every photo (hidden ones too), the
   page image slots, and the recent history with what each Undo / Redo
   button needs. Server-only.
   ============================================================ */
import { galleryGroups } from "../data/gallery";
import { imageSlots } from "../data/image-slots";
import { effectiveEvents, labelOf, renamedGroup, replay, uploadSizes, type GalleryEvent } from "./gallery-live";

const HISTORY = 60;

export async function snapshot(events: readonly GalleryEvent[]) {
  const state = replay(events);
  const sizes = await uploadSizes();

  const groups = galleryGroups.map((g) => ({
    id: g.id,
    label: g.label,
    photos: (state.groups.get(g.id) ?? []).map((p) => (p.upload ? { ...p, ...sizes.get(p.file) } : p)),
  }));

  const slots = imageSlots.map((s) => ({
    key: s.key,
    label: s.label,
    page: s.page,
    baseFile: s.file,
    file: state.slots.get(s.key) ?? s.file,
  }));

  // Which non-undo events are in force, and which undo row cancelled each
  // one that is not: that row is what "Redo" undoes. Same walk as
  // effectiveEvents(): newest first, a cancelled undo cancels nothing.
  const active = new Set(effectiveEvents(events).map((e) => e.id));
  const cancelledBy = new Map<number, number>();
  const cancelled = new Set<number>();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.action !== "undo" || e.ref_id == null || cancelled.has(e.id)) continue;
    cancelled.add(e.ref_id);
    if (!cancelledBy.has(e.ref_id)) cancelledBy.set(e.ref_id, e.id);
  }

  const slotLabel = new Map(imageSlots.map((s) => [s.key, s.label]));
  const history = events
    .filter((e) => e.action !== "undo")
    .slice(-HISTORY)
    .reverse()
    .map((e) => {
      const target = e.target_group
        ? e.action === "slot"
          ? (slotLabel.get(e.target_group) ?? e.target_group)
          : labelOf(renamedGroup(e.target_group))
        : null;
      return {
        id: e.id,
        action: e.action,
        file: e.file,
        group: target,
        position: e.position,
        caption: e.caption,
        at: e.created_at,
        undone: !active.has(e.id),
        undoneBy: active.has(e.id) ? null : (cancelledBy.get(e.id) ?? null),
      };
    });

  return { groups, slots, history };
}
