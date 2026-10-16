/* ============================================================
   Service areas page copy. Keys: locations.<path>.
   Only the three verified areas (src/data/site.ts). No localities are
   listed: that would be a claim the client has not made.
   ============================================================ */
export const locationsPage = {
  meta: {
    title: "Service Areas",
    description: "Samruddhi Fire works across Mumbai, Navi Mumbai and Thane from its office in Koparkhairane. Call to arrange a site visit.",
  },
  hero: {
    kicker: "Service areas",
    title: "Where we work",
    lead: "We work across Mumbai, Navi Mumbai and Thane, from our office in Koparkhairane.",
  },
  areas: {
    kicker: "Our area",
    heading: "Three cities, one team",
    items: [
      { name: "Mumbai", text: "Installation, servicing, refilling and supply for buildings across Mumbai." },
      { name: "Navi Mumbai", text: "Our home base. The office is in Koparkhairane, Sector 10." },
      { name: "Thane", text: "Installation, servicing, refilling and supply for buildings across Thane." },
    ],
    note: "Not sure whether we cover your site? Call or WhatsApp us and ask.",
  },
  office: {
    kicker: "Visit us",
    heading: "Our office",
    hoursLabel: "Hours",
    directions: "Get directions",
    mapTitle: "Map showing the Samruddhi Fire office in Koparkhairane, Navi Mumbai",
  },
} as const;
