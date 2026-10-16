/* ============================================================
   About page copy. Keys: about.<path>.
   The company story, mission, vision and founder note are the client's
   to write: they are placeholders (src/data/placeholder.ts) until then.
   ============================================================ */
import { ph } from "./placeholder";

export const about = {
  meta: {
    title: "About",
    description:
      "Samruddhi Fire is a fire protection contractor in Koparkhairane, Navi Mumbai, led by its founder Yogesh Bankar. Who we are and how we work.",
  },
  hero: {
    kicker: "About us",
    title: "A fire protection contractor based in Navi Mumbai",
    lead: "Samruddhi Fire installs, services and supplies fire safety systems for buildings across Mumbai, Navi Mumbai and Thane.",
  },
  story: {
    kicker: "Our story",
    heading: "Who we are",
    intro: "Samruddhi Fire is led by its founder, Yogesh Bankar, from our office in Koparkhairane, Navi Mumbai.",
    body: ph("a few lines on how Yogesh Bankar started Samruddhi Fire and the work the company is known for"),
    more: ph("one more short paragraph on the kinds of buildings and clients you usually work with (no client names)"),
  },
  mission: {
    kicker: "Mission",
    heading: "Our mission",
    text: ph("your mission statement, in one or two sentences"),
  },
  vision: {
    kicker: "Vision",
    heading: "Our vision",
    text: ph("your vision statement, in one or two sentences"),
  },
  values: {
    kicker: "How we work",
    heading: "What you can expect from us",
    items: [
      { title: "Straight answers", text: "We tell you what your building needs, and what it does not." },
      { title: "Careful work", text: "Pipework, cabling and fittings installed neatly and finished properly." },
      { title: "Follow-through", text: "We come back to service and test what we install." },
      { title: "Easy to reach", text: "Call or WhatsApp the team directly, Monday to Saturday." },
    ],
  },
  founder: {
    kicker: "Founder",
    name: "Yogesh Bankar",
    role: "Founder, Samruddhi Fire",
    note: ph("a short note about Yogesh Bankar for this page"),
  },
  details: {
    kicker: "Company details",
    heading: "At a glance",
    nameLabel: "Company",
    founderLabel: "Founder",
    gstinLabel: "GSTIN",
    officeLabel: "Office",
    hoursLabel: "Hours",
    areasLabel: "Service area",
  },
} as const;
