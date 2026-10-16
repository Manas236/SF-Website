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

/* Captions describe what is in the picture. They never claim the work
   shown is Samruddhi Fire's own: these are stock photos. */
const photos: Record<string, readonly GalleryPhoto[]> = {
  "fire-fighting": [
    { file: "sprinkler-grid-warehouse-roof.jpg", caption: "Sprinkler pipework laid out under a warehouse roof" },
    { file: "red-fire-mains-concrete-ceiling.jpg", caption: "Red fire mains running under a concrete slab beside the cable trays" },
    { file: "sprinkler-risers-factory-wall.jpg", caption: "Sprinkler risers and control valves along a factory wall" },
    { file: "hydrant-valve-manifold.jpg", caption: "A wall-mounted hydrant manifold with outlets on every side" },
    { file: "red-pipework-cable-trays.jpg", caption: "Fire line pipework routed around beams and other services" },
  ],
  alarm: [
    { file: "manual-call-point.jpg", caption: "A manual call point beside its sign, ready to raise the alarm" },
    { file: "alarm-horn-strobe.jpg", caption: "A sounder and strobe that warns people by sound and by light" },
    { file: "ceiling-detector.jpg", caption: "Detectors on a ceiling, each labelled with its address on the loop" },
  ],
  materials: [
    { file: "extinguishers-along-corridor.jpg", caption: "Extinguishers placed along a corridor, within easy reach" },
    { file: "extinguisher-concrete-wall.jpg", caption: "A fire extinguisher mounted below its sign" },
    { file: "hose-reel-cabinet.jpg", caption: "A hose reel cabinet with its sign above it" },
    { file: "hose-box-landing-valve.jpg", caption: "A fire hose box with a landing valve below it" },
  ],
  "fire-amc": [
    { file: "valve-station-detail.jpg", caption: "Valves, gauges and fittings on a sprinkler valve station" },
    { file: "pipework-inspection.jpg", caption: "Checking valves and pipework on a maintenance visit" },
    { file: "red-fire-main-ceiling.jpg", caption: "Supports, clamps and joints on a fire main, all part of a routine check" },
  ],
  "fire-extenguisher-refilling": [
    { file: "extinguisher-gauge-valve.jpg", caption: "The pressure gauge shows whether an extinguisher is ready to use" },
    { file: "extinguishers-on-pallet.jpg", caption: "Extinguishers gathered on a pallet, waiting to be refilled" },
  ],
  "core-cutting": [
    { file: "diamond-core-drill.jpg", caption: "A diamond core bit cutting a clean round hole through stone" },
    { file: "masonry-drill-bits.jpg", caption: "Masonry drill bits for fixing and anchoring into concrete" },
  ],
};

export const galleryGroups: readonly GalleryGroup[] = services.map((s) => ({
  id: s.id,
  label: s.name,
  photos: photos[s.id] ?? [],
}));
