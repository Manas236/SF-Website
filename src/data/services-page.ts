/* ============================================================
   Services page copy. Keys: services.<path>.
   One section per service, in the order of src/data/site.ts. Each
   section's id is the service id, the anchors the old site used:
   /services#fire-fighting, #alarm, #materials, #fire-amc,
   #fire-extenguisher-refilling (sic), #core-cutting.
   ============================================================ */

export interface ServiceCopy {
  readonly lead: string;
  readonly body: string;
  readonly coversHead: string;
  readonly covers: readonly string[];
}

export const servicesPage = {
  meta: {
    title: "Services",
    description:
      "Fire fighting and detection, alarm systems, fire safety materials, AMC, extinguisher refilling and core cutting in Mumbai, Navi Mumbai and Thane.",
  },
  hero: {
    kicker: "Our services",
    title: "Fire protection, from installation to upkeep",
    lead: "Everything from one team. Pick a service below, or call us and we will tell you what your building needs.",
  },
  actions: {
    call: "Call about this",
    enquire: "Send an enquiry",
    photos: "See photos",
  },
  items: {
    "fire-fighting": {
      lead: "Systems that control a fire and hold it back until help arrives.",
      body: "We install and maintain fire fighting systems in new and existing buildings: the pipework, valves, sprinklers, hydrants and hose reels that put water where it is needed. We look after detection that is linked to them, and test everything before handover.",
      coversHead: "What this covers",
      covers: [
        "Sprinkler systems and their pipework",
        "Hydrant systems, landing valves and hose reels",
        "Detection linked to the fire fighting system",
        "Testing and handover, with a walk-through of the system",
      ],
    },
    alarm: {
      lead: "Early warning, so everyone in the building has time to get out.",
      body: "We install and maintain fire alarm systems: the control panel, smoke and heat detectors, manual call points, sounders and strobes. Every device is tested so the alarm works the day it is needed.",
      coversHead: "What this covers",
      covers: [
        "Fire alarm control panels",
        "Smoke and heat detectors",
        "Manual call points, sounders and strobes",
        "Testing, fault finding and repairs",
      ],
    },
    materials: {
      lead: "Fire safety materials and equipment, supplied when you need them.",
      body: "We supply fire safety equipment for sites and buildings, from extinguishers and hose reels to the valves, fittings and detectors that go into a system. Tell us what you need and we will help you choose.",
      coversHead: "What we supply",
      covers: [
        "Fire extinguishers",
        "Fire hoses, hose reels and hose boxes",
        "Valves, pipes and fittings",
        "Detectors, call points and alarm devices",
        "Fire safety signs",
      ],
    },
    "fire-amc": {
      lead: "A yearly maintenance contract that keeps your systems ready.",
      body: "Under an AMC we visit on a regular schedule to inspect, test and service your fire safety systems, and we tell you plainly what needs attention. You get a record of every visit.",
      coversHead: "What this covers",
      covers: [
        "Scheduled inspection visits",
        "Testing of alarms, detectors and fire fighting systems",
        "Servicing of extinguishers and hose reels",
        "A written note of what was checked and found",
      ],
    },
    "fire-extenguisher-refilling": {
      lead: "Extinguishers checked, refilled and ready for use again.",
      body: "An extinguisher that has been used, has lost pressure or is due for service needs refilling. We check the cylinder, valve and hose, refill it with the right agent, and confirm it holds pressure before it goes back.",
      coversHead: "What this covers",
      covers: [
        "Refilling after use or when due",
        "Pressure and condition checks",
        "Valve, hose and seal inspection",
        "Advice on which extinguisher suits which area",
      ],
    },
    "core-cutting": {
      lead: "Clean, accurate openings through concrete and masonry.",
      body: "We cut round openings through walls and slabs for pipes, cables and ducts, and drill for anchors and fixings. Core cutting leaves a neat hole with far less mess and disturbance than breaking through.",
      coversHead: "What this covers",
      covers: [
        "Core cutting through walls and slabs",
        "Openings for fire lines, plumbing, cables and ducts",
        "Drilling for anchors and fixings",
        "Clean-up after the job",
      ],
    },
  } satisfies Record<string, ServiceCopy>,
} as const;
