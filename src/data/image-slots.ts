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

export const imageSlots: readonly ImageSlot[] = [
  { key: "home.hero", label: "Home: top banner", page: "/", file: "red-fire-mains-concrete-ceiling.jpg" },
  { key: "home.intro", label: "Home: beside the introduction", page: "/", file: "hydrant-valve-manifold.jpg" },
  { key: "about.story", label: "About: beside our story", page: "/about", file: "pipework-inspection.jpg" },
  { key: "services.fire-fighting", label: "Services: Fire Fighting & Detection", page: "/services", file: "sprinkler-grid-warehouse-roof.jpg" },
  { key: "services.alarm", label: "Services: Alarm System", page: "/services", file: "manual-call-point.jpg" },
  { key: "services.materials", label: "Services: Material Supplier", page: "/services", file: "extinguishers-along-corridor.jpg" },
  { key: "services.fire-amc", label: "Services: Fire AMC", page: "/services", file: "valve-station-detail.jpg" },
  {
    key: "services.fire-extenguisher-refilling",
    label: "Services: Fire Extinguisher Refilling",
    page: "/services",
    file: "extinguisher-gauge-valve.jpg",
  },
  { key: "services.core-cutting", label: "Services: Core Cutting & Drilling", page: "/services", file: "diamond-core-drill.jpg" },
  { key: "locations.photo", label: "Service areas: beside the list", page: "/locations", file: "sprinkler-risers-factory-wall.jpg" },
];

const slotByKey = new Map(imageSlots.map((s) => [s.key, s]));

export function getSlot(key: string): ImageSlot | undefined {
  return slotByKey.get(key);
}

export function isSlotKey(key: unknown): key is string {
  return typeof key === "string" && slotByKey.has(key);
}
