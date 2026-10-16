/* ============================================================
   Projects page copy. Keys: projects.<path>.
   The entries themselves are not here: they are project text blocks
   the client adds in edit mode (src/lib/project-blocks.ts). Until there
   are any, the page shows the designed "coming soon" state below.
   ============================================================ */
export const projectsPage = {
  meta: {
    title: "Projects",
    description: "Ongoing and completed fire protection work by Samruddhi Fire in Mumbai, Navi Mumbai and Thane.",
  },
  hero: {
    kicker: "Projects",
    title: "Our work",
    lead: "Fire protection jobs we are working on now, and ones we have finished.",
  },
  lists: {
    ongoing: { heading: "Ongoing projects", empty: "No ongoing projects are listed at the moment." },
    completed: { heading: "Completed projects", empty: "No completed projects are listed at the moment." },
  },
  empty: {
    title: "Projects coming soon",
    text: "We are putting together a record of our recent work for this page. In the meantime, call or WhatsApp us and we will gladly talk you through jobs like yours.",
    call: "Call us",
    whatsapp: "WhatsApp us",
  },
} as const;
