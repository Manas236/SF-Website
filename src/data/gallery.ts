/* ============================================================
   The gallery BASELINE
   ------------------------------------------------------------
   The photographs, groups, order and captions the code ships with. The
   studio gallery manager (/studio/gallery) never edits this file: it
   appends rows to gallery_events and every page replays them over this
   baseline (src/lib/gallery-live.ts). So a photo the client hides,
   moves or recaptions stays that way through any deploy, and a change
   here only shows where the client has not changed that photo.

   One group per service; the group key is the service id
   (src/data/site.ts). Photos are stock until real ones arrive
   (docs/IMAGE-CREDITS.md); `file` names a set built into
   public/images/stock/ by scripts/build-stock-images.mjs.

   Captions are visitor-facing: no em dashes, no figures, no claims.
   ============================================================ */
import { services } from "./site";

export interface GalleryPhoto {
  readonly file: string;
  readonly caption: string;
}

export interface GalleryGroup {
  /** The service id: the key stored in gallery_events.target_group. */
  readonly id: string;
  readonly label: string;
  readonly photos: readonly GalleryPhoto[];
}

const photos: Record<string, readonly GalleryPhoto[]> = {
  "fire-fighting": [],
  alarm: [],
  materials: [],
  "fire-amc": [],
  "fire-extenguisher-refilling": [],
  "core-cutting": [],
};

export const galleryGroups: readonly GalleryGroup[] = services.map((s) => ({
  id: s.id,
  label: s.name,
  photos: photos[s.id] ?? [],
}));
