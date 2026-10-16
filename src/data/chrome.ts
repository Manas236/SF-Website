/* ============================================================
   Copy shared by every page: nav and footer
   ------------------------------------------------------------
   One definition, rendered on every page. The edit KEYS are still per
   page (docs/DESIGN-SYSTEM.md, "Editable slots"): Nav and SiteFooter
   take a `page` prop that is the first segment of every key, so a nav
   label edited on /about changes it on /about. That is how
   content_edits is keyed (page_path, edit_key).
   ============================================================ */
import { services, site, telHref } from "./site";

export interface NavLink {
  readonly label: string;
  readonly href: string;
  readonly children?: readonly { readonly label: string; readonly href: string }[];
}

export const nav = {
  logoAlt: `${site.name} home`,
  links: [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    {
      label: "Services",
      href: "/services",
      children: services.map((s) => ({ label: s.name, href: `/services#${s.id}` })),
    },
    { label: "Projects", href: "/projects" },
    { label: "Gallery", href: "/gallery" },
    { label: "Contact", href: "/contact-us" },
  ] satisfies NavLink[],
  cta: { label: "Call Now", href: telHref },
} as const;

export const footer = {
  tagline: "Fire safety systems installed, serviced and supplied across Mumbai, Navi Mumbai and Thane.",
  columns: {
    company: {
      head: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Projects", href: "/projects" },
        { label: "Gallery", href: "/gallery" },
        { label: "Service areas", href: "/locations" },
        { label: "Contact", href: "/contact-us" },
      ],
    },
    services: { head: "Services" },
    contact: {
      head: "Get in touch",
      call: "Call",
      whatsapp: "WhatsApp",
      email: "Email",
      phoneLabel: "Phone",
      emailLabel: "Email",
      hoursLabel: "Hours",
      addressLabel: "Office",
      mapTitle: `Map showing the ${site.name} office in Koparkhairane, Navi Mumbai`,
      directions: "Get directions",
    },
  },
  bottom: {
    gstinLabel: "GSTIN",
  },
} as const;
