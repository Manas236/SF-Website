/* ============================================================
   Go-live gate: the site must know its own address
   ------------------------------------------------------------
   Every absolute URL the site emits (canonical, og:url, og:image, the
   JSON-LD, the sitemap, the Sitemap line in /robots.txt) is written
   against `site` in astro.config.mjs: PUBLIC_SITE_URL or, unset,
   http://localhost:<PORT>. That fallback is right for development and
   ruinous in production: a canonical of localhost tells a crawler the
   real domain is a copy. Neither fails loudly; the site just never
   ranks. So `npm run build:release` runs this first and refuses.

   It also refuses while SITE_NOINDEX is on: the launch site would tell
   every crawler to go away.

   Usage:  node scripts/check-site-url.mjs
   ============================================================ */
import "dotenv/config";

const raw = (process.env.PUBLIC_SITE_URL ?? "").trim();

function fail(reason) {
  console.log(`  FAIL  PUBLIC_SITE_URL ${reason}`);
  console.log(
    "        Set it in .env (or the environment) to the site's public origin,\n" +
      "        e.g. PUBLIC_SITE_URL=https://www.example.in (no path, no trailing slash)."
  );
  process.exit(1);
}

if (!raw) fail("is not set: every canonical and sitemap URL would say localhost");

let url;
try {
  url = new URL(raw);
} catch {
  fail(`is not a URL: ${raw}`);
}

if (url.protocol !== "https:") fail(`must be https, got ${url.protocol}//`);
if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(url.hostname)) {
  fail(`points at ${url.hostname}, the development fallback`);
}
if (url.pathname !== "/" || url.search || url.hash) fail(`must be an origin only, got ${raw}`);

console.log(`  PASS  PUBLIC_SITE_URL=${url.origin}`);

const noindex = (process.env.SITE_NOINDEX ?? "").trim().toLowerCase();
if (noindex === "1" || noindex === "true") {
  console.log("  FAIL  SITE_NOINDEX is on: the launch site would tell every crawler to go away.");
  console.log("        Set SITE_NOINDEX=0 in .env on the real domain (docs/DEPLOY.md).");
  process.exit(1);
}
console.log("  PASS  SITE_NOINDEX is off");
