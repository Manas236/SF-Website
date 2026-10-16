/* ============================================================
   Samruddhi Fire: the verified facts
   ------------------------------------------------------------
   The ONLY place a fact about the business is written down. Every page,
   the JSON-LD, the footer and the contact page read from here.

   Rules (CLAUDE.md, "Content rules"):
     · nothing goes in here that the client has not confirmed
     · no figures of any kind (years, clients, projects, staff, ratings)
     · no testimonials, no named clients or projects
     · no accreditation, certification, licence, ISO or 24-hour claims
   Anything still to be supplied is a placeholder in a page copy module
   (src/data/placeholder.ts), never a guess here.
   ============================================================ */

export const site = {
  name: "Samruddhi Fire",
  founder: "Yogesh Bankar",
  gstin: "27BGRPB0456K1Z7",

  address: {
    /** As printed, one line per row. */
    lines: ["5/A-04, Shree Sai CHS", "Sector 10, Koparkhairane", "Navi Mumbai 400709"],
    /** The same address, split for structured data. */
    streetAddress: "5/A-04, Shree Sai CHS, Sector 10, Koparkhairane",
    locality: "Navi Mumbai",
    postalCode: "400709",
    country: "IN",
  },

  phone: {
    display: "+91 88984 20303",
    /** For tel: links and schema.org: E.164. */
    e164: "+918898420303",
  },
  whatsapp: {
    display: "+91 88984 20303",
    href: "https://wa.me/918898420303",
  },
  email: "samruddhifire@gmail.com",

  hours: {
    display: "Mon to Sat, 9 am to 8 pm",
    /** schema.org openingHoursSpecification. */
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    opens: "09:00",
    closes: "20:00",
  },

  areas: ["Mumbai", "Navi Mumbai", "Thane"],

  credit: "Designed & developed by Manas Gawde",
} as const;

/* ------------------------------------------------------------
   The six services
   ------------------------------------------------------------
   `id` is BOTH the anchor on /services and the gallery group key stored
   in gallery_events, so it never changes. The anchors are the ones the
   old WordPress site used, misspelling included
   (`fire-extenguisher-refilling`): links to them must keep working.
   ------------------------------------------------------------ */
export interface Service {
  readonly id: string;
  readonly name: string;
}

export const services: readonly Service[] = [
  { id: "fire-fighting", name: "Fire Fighting & Detection" },
  { id: "alarm", name: "Alarm System" },
  { id: "materials", name: "Material Supplier" },
  { id: "fire-amc", name: "Fire AMC" },
  { id: "fire-extenguisher-refilling", name: "Fire Extinguisher Refilling" },
  { id: "core-cutting", name: "Core Cutting & Drilling" },
];

/** The one-line address, for maps and schema. */
export const addressOneLine = `${site.address.streetAddress}, ${site.address.locality} ${site.address.postalCode}`;

/** Google Maps embed with no API key: a search for the ADDRESS only.
    Searching the business name makes Google draw its place card, which
    shows a star rating and review count, and the site carries no
    ratings or reviews (CLAUDE.md). The address alone drops a plain pin. */
export const mapEmbedUrl =
  "https://maps.google.com/maps?q=" + encodeURIComponent(addressOneLine) + "&z=16&output=embed";

export const directionsUrl =
  "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(addressOneLine);

export const telHref = `tel:${site.phone.e164}`;
export const mailHref = `mailto:${site.email}`;
