/* ============================================================
   Homepage copy. Keys: home.<path> (docs/DESIGN-SYSTEM.md, 9).
   Visitor-facing: no em dashes, no figures, no claims (CLAUDE.md).
   ============================================================ */
import { services } from "./site";

export const home = {
  meta: {
    description:
      "Samruddhi Fire installs, services and supplies fire fighting, alarm and detection systems in Mumbai, Navi Mumbai and Thane. Call +91 88984 20303.",
  },
  hero: {
    kicker: "Fire protection in Mumbai, Navi Mumbai and Thane",
    headline: "Fire safety systems, installed properly and looked after.",
    sub: "We install, service and supply fire fighting, detection and alarm systems, and keep your extinguishers ready for use.",
    call: "Call Now",
    whatsapp: "WhatsApp us",
    services: "Our services",
  },
  services: {
    kicker: "What we do",
    heading: "One team for every part of fire safety",
    sub: "From the first pipe to the yearly check, the same people look after your fire safety.",
    more: "Read more",
    cards: services.map((s) => ({ id: s.id, title: s.name })),
    blurbs: {
      "fire-fighting": "Sprinkler, hydrant and hose reel systems that hold a fire back until help arrives.",
      alarm: "Detectors, call points and sounders that warn everyone in the building early.",
      materials: "Extinguishers, hoses, valves, fittings and other fire safety equipment.",
      "fire-amc": "A yearly maintenance contract with regular checks, testing and servicing.",
      "fire-extenguisher-refilling": "Extinguishers checked, refilled and returned ready for use.",
      "core-cutting": "Clean round openings through concrete and masonry for pipes, cables and ducts.",
    } as Record<string, string>,
  },
  intro: {
    kicker: "Why call us",
    heading: "Straight advice and careful work",
    body: "We look at your building, tell you plainly what it needs, and do the work neatly. Then we stay in touch, so the system is serviced and ready on the day it is needed.",
    points: [
      { title: "A site visit first", text: "We see the building before we suggest anything." },
      { title: "Tidy installation", text: "Pipework, cabling and fittings run neatly and finished properly." },
      { title: "Regular servicing", text: "Checks on a schedule that suits you, with a note of what was done." },
      { title: "Equipment on hand", text: "Extinguishers, fittings and spares supplied when you need them." },
    ],
  },
  steps: {
    kicker: "How we work",
    heading: "From first call to yearly check",
    items: [
      { title: "Talk to us", text: "Call or WhatsApp us and tell us about the building." },
      { title: "Site visit", text: "We visit, look at what is there and what is needed." },
      { title: "Install or service", text: "We carry out the work and walk you through the system." },
      { title: "Keep it ready", text: "We come back to service, test and refill on schedule." },
    ],
  },
  areas: {
    kicker: "Where we work",
    heading: "Mumbai, Navi Mumbai and Thane",
    text: "Our office is in Koparkhairane, Navi Mumbai, and we work across all three cities.",
    link: "See our service areas",
  },
  projects: {
    kicker: "Our work",
    heading: "Projects",
    text: "See our ongoing and completed work.",
    link: "View projects",
  },
} as const;
