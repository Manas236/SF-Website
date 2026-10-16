/* ============================================================
   /robots.txt: crawl everything, and here is the sitemap
   ------------------------------------------------------------
   Served rather than dropped in public/ because the Sitemap line needs
   an absolute URL (`site` in astro.config.mjs, from PUBLIC_SITE_URL).

   Nothing is disallowed on a live site, on purpose:
   - NOT /api/. Every page fetches /api/content to paint the client's
     saved text; a crawler that renders pages but cannot reach it would
     index the text the site was built with.
   - NOT /studio/. The sign-in page sends noindex and its slug is a
     secret nothing links to; a Disallow line would only announce it.

   While SITE_NOINDEX=1 (src/lib/staging.ts) it disallows everything and
   names no sitemap.
   ============================================================ */
import type { APIRoute } from "astro";
import { isNoindexDeployment } from "../lib/staging";

export const prerender = false;

export const GET: APIRoute = ({ site }) => {
  if (isNoindexDeployment()) {
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }
  const lines = ["User-agent: *", "Allow: /"];
  if (site) lines.push("", `Sitemap: ${new URL("/sitemap-index.xml", site).href}`);
  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
