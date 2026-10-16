/* ============================================================
   Gallery page copy. Keys: gallery.<path>.
   The photos and their captions are not here: they are the live
   gallery (src/data/gallery.ts plus the studio's changes).
   ============================================================ */
export const galleryPage = {
  meta: {
    title: "Gallery",
    description:
      "Photos of the fire safety equipment and systems behind our services: sprinklers, hydrants, alarms, extinguishers and core cutting.",
  },
  hero: {
    kicker: "Gallery",
    title: "A closer look at the work",
    lead: "The equipment and systems behind each of our services. Tap any photo to see it larger.",
  },
  serviceLink: "About this service",
  lightbox: { previous: "Previous", next: "Next", close: "Close" },
  empty: "Photos for this page are on their way.",
} as const;
