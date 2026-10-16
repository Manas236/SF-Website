/* ============================================================
   Noindex switch: a copy of the site that search engines skip
   ------------------------------------------------------------
   SITE_NOINDEX=1 in .env marks this deployment as not for search
   engines. It is the default while the site is in review. Then:

   - every response carries X-Robots-Tag: noindex, nofollow
     (src/middleware.ts): pages, images, the API, everything;
   - every page carries <meta name="robots" content="noindex, nofollow">
     (BaseLayout);
   - /robots.txt says Disallow: / and names no sitemap.

   Read from process.env at request time, so the same build is switched
   by editing .env and restarting, no rebuild. Set it to 0 (or remove
   the line) on the real domain, or the site never enters the index.
   ============================================================ */
import "dotenv/config";

export function isNoindexDeployment(): boolean {
  const v = (process.env.SITE_NOINDEX ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}
