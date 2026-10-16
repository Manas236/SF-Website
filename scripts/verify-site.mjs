/* ============================================================
   Check: the whole public site, against the running server
   ------------------------------------------------------------
     HTTP   every route 200; /contact 301 to /contact-us; an old
            trailing-slash address 301s; an unknown path and /404 are
            404; titles "<Page> | Samruddhi Fire" (home: the name),
            unique; meta descriptions present and 155 characters or
            less; no em dash in any served page, robots.txt or the
            sitemap; noindex header and meta while SITE_NOINDEX=1;
            one LocalBusiness JSON-LD block with no rating or review
     BROWSER
            the old /services#anchors land on their section; no
            horizontal scroll at 360, 390 and 1280; layout shift about
            zero; the phone drawer opens and lists every service; the
            desktop Services menu opens; motion is on by default and
            off under reduced motion, without JavaScript, in edit mode
            and in print
     COUNT  placeholders still showing, per page

   Usage:  node scripts/verify-site.mjs [origin]
   ============================================================ */
import { chromium } from "playwright";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
dotenv.config({ path: ROOT + ".env", quiet: true });
const ORIGIN = (process.argv[2] || `http://localhost:${process.env.PORT || 4323}`).replace(/\/+$/, "");
const NOINDEX = ["1", "true"].includes((process.env.SITE_NOINDEX ?? "").trim().toLowerCase());

const ROUTES = {
  "/": "Samruddhi Fire",
  "/about": "About | Samruddhi Fire",
  "/services": "Services | Samruddhi Fire",
  "/projects": "Projects | Samruddhi Fire",
  "/locations": "Service Areas | Samruddhi Fire",
  "/gallery": "Gallery | Samruddhi Fire",
  "/contact-us": "Contact Us | Samruddhi Fire",
};
const ANCHORS = ["fire-fighting", "alarm", "materials", "fire-amc", "fire-extenguisher-refilling", "core-cutting"];
const EM = "—";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "  PASS  " : "  FAIL  "}${label}${detail ? `  (${detail})` : ""}`);
};
const get = (path, opts = {}) => fetch(ORIGIN + path, { redirect: "manual", ...opts });
const emCount = (s) => s.split(EM).length - 1 + (s.match(/&mdash;|&#8212;|&#x2014;/gi) || []).length;
const attr = (html, re) => (html.match(re) || [])[1];

/* ---------------- HTTP ---------------- */
console.log(`Site checks on ${ORIGIN} (SITE_NOINDEX ${NOINDEX ? "on" : "off"})\n\nHTTP`);
const titles = new Set();
const placeholders = {};
let emTotal = 0;
for (const [path, wantTitle] of Object.entries(ROUTES)) {
  const res = await get(path);
  const html = await res.text();
  check(res.status === 200, `${path} answers 200`, `got ${res.status}`);
  const title = attr(html, /<title>([^<]*)<\/title>/);
  check(title === wantTitle, `${path} title`, `"${title}"`);
  titles.add(title);
  const desc = attr(html, /<meta name="description" content="([^"]*)"/) ?? "";
  check(desc.length > 0 && desc.length <= 155, `${path} meta description is 1 to 155 characters`, `${desc.length}`);
  const em = emCount(html);
  emTotal += em;
  check(em === 0, `${path} has no em dash`, em ? `${em} found` : "");
  if (NOINDEX) {
    check(res.headers.get("x-robots-tag") === "noindex, nofollow", `${path} sends X-Robots-Tag noindex`);
    check(/<meta name="robots" content="noindex, nofollow"/.test(html), `${path} has the robots noindex meta`);
  }
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const biz = ld.find((x) => x["@type"] === "LocalBusiness");
  check(!!biz && !/aggregateRating|review/i.test(JSON.stringify(ld)), `${path} LocalBusiness JSON-LD, no rating or review`);
  placeholders[path] = (html.match(/<[a-z0-9]+\s[^>]*\bdata-placeholder\b[^>]*>/gi) || []).length;
}
check(titles.size === Object.keys(ROUTES).length, "every title is unique");

const redirect = await get("/contact");
check(redirect.status === 301 && new URL(redirect.headers.get("location"), ORIGIN).pathname === "/contact-us", "/contact is a 301 to /contact-us", `${redirect.status} ${redirect.headers.get("location")}`);
const slash = await get("/services/");
check(slash.status === 301 && new URL(slash.headers.get("location"), ORIGIN).pathname === "/services", "/services/ is a 301 to /services", `${slash.status}`);
for (const p of ["/this-page-does-not-exist", "/404", "/studio/not-the-slug"]) {
  const r = await get(p);
  const html = await r.text();
  check(r.status === 404, `${p} answers 404`, `got ${r.status}`);
  if (p === "/this-page-does-not-exist") {
    emTotal += emCount(html);
    check(emCount(html) === 0 && /We could not find that page/.test(html), "the 404 page renders, with no em dash");
  }
}
for (const p of ["/robots.txt", "/sitemap-index.xml", "/sitemap-0.xml"]) {
  const r = await get(p);
  const body = await r.text();
  check(r.status === 200 && emCount(body) === 0, `${p} answers 200 with no em dash`);
  if (p === "/robots.txt" && NOINDEX) check(/Disallow: \//.test(body), "robots.txt disallows everything while noindex is on");
  if (p === "/sitemap-0.xml") {
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    const want = Object.keys(ROUTES);
    check(want.every((w) => locs.includes(w)) && locs.length === want.length, "sitemap lists exactly the seven pages", locs.join(" "));
  }
}
console.log(`  ....  em dashes across all served pages: ${emTotal}`);

/* ---------------- Browser ---------------- */
console.log("\nBROWSER");
let browser;
try {
  browser = await chromium.launch({ channel: "chrome" });
} catch {
  browser = await chromium.launch();
}

/* Anchors */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  for (const id of ANCHORS) {
    await page.goto(`${ORIGIN}/services#${id}`, { waitUntil: "load" });
    await page.waitForTimeout(700);
    const top = await page.evaluate((i) => document.getElementById(i)?.getBoundingClientRect().top ?? null, id);
    check(top !== null && top >= 0 && top <= 120, `/services#${id} lands on its section`, `section top at ${top === null ? "missing" : Math.round(top) + "px"}`);
  }
  await ctx.close();
}

/* Widths, layout shift */
const CLS = `window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:"layout-shift",buffered:true});`;
let worstCls = 0;
for (const width of [360, 390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  await ctx.addInitScript(CLS);
  const page = await ctx.newPage();
  for (const path of Object.keys(ROUTES)) {
    await page.goto(ORIGIN + path, { waitUntil: "load" });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, cls: window.__cls }));
    worstCls = Math.max(worstCls, m.cls);
    check(m.sw <= m.iw, `${path} at ${width}px: no horizontal scroll`, `scrollWidth ${m.sw}, CLS ${m.cls.toFixed(4)}`);
  }
  await ctx.close();
}
check(worstCls < 0.05, "layout shift about zero on every page and width", `worst CLS ${worstCls.toFixed(4)}`);

/* Nav: phone drawer and desktop menu */
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
  const page = await ctx.newPage();
  await page.goto(ORIGIN + "/", { waitUntil: "load" });
  await page.click("#nav-drawer-toggle");
  const shown = await page.locator("#nav-drawer").isVisible();
  const links = await page.locator('#nav-drawer a[href^="/services#"]').count();
  check(shown && links === ANCHORS.length, "phone drawer opens and lists all six services", `${links} service links`);
  const fits = await page.evaluate(() => {
    const d = document.getElementById("nav-drawer").getBoundingClientRect();
    return d.right <= window.innerWidth + 0.5;
  });
  check(fits, "phone drawer fits the screen");
  await page.click('#nav-drawer a[href="/services#core-cutting"]');
  await page.waitForURL(/\/services#core-cutting$/);
  check(true, "a service link in the drawer goes to its section");
  await ctx.close();

  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await desk.newPage();
  await p2.goto(ORIGIN + "/about", { waitUntil: "load" });
  await p2.hover('header nav[aria-label="Primary"] a[href="/services"]');
  await p2.waitForTimeout(900);
  const items = await p2.locator(".sf-nav-menu a:visible").count();
  check(items === ANCHORS.length, "desktop Services menu opens on hover with six items", `${items}`);
  await p2.keyboard.press("Tab");
  await desk.close();
}

/* Motion guards */
{
  const on = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await on.newPage();
  await p.goto(ORIGIN + "/", { waitUntil: "load" });
  const hasClass = await p.evaluate(() => document.documentElement.classList.contains("sf-motion"));
  const heroAnims = await p.evaluate(() => [...document.querySelectorAll("[data-hero-in]")].reduce((n, el) => n + el.getAnimations().length, 0));
  check(hasClass && heroAnims > 0, "motion is on by default (sf-motion, hero entrance)", `${heroAnims} hero animations`);
  await p.emulateMedia({ media: "print" });
  const hiddenInPrint = await p.evaluate(() => [...document.querySelectorAll("[data-reveal]")].filter((el) => getComputedStyle(el).opacity !== "1").length);
  check(hiddenInPrint === 0, "nothing is hidden in print", `${hiddenInPrint} hidden`);
  await on.close();

  const reduced = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const r = await reduced.newPage();
  await r.goto(ORIGIN + "/", { waitUntil: "load" });
  await r.waitForTimeout(300);
  const st = await r.evaluate(() => ({
    anims: document.getAnimations().length,
    reveal: document.querySelectorAll("[data-reveal]").length,
  }));
  check(st.anims === 0 && st.reveal === 0, "reduced motion: no animations, nothing waiting to reveal", `${st.anims} animations, ${st.reveal} hidden`);
  await reduced.close();

  const nojs = await browser.newContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
  const n = await nojs.newPage();
  await n.goto(ORIGIN + "/services", { waitUntil: "load" });
  const nj = await n.evaluate(() => ({
    cls: document.documentElement.classList.contains("sf-motion"),
    hidden: [...document.querySelectorAll("main *")].filter((el) => getComputedStyle(el).opacity === "0").length,
  }));
  check(!nj.cls && nj.hidden === 0, "no JavaScript: no motion and nothing hidden", `${nj.hidden} hidden`);
  await nojs.close();

  const edit = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await edit.addCookies([{ name: "sf_edit_ui", value: "1", url: ORIGIN }]);
  await edit.addInitScript(() => sessionStorage.setItem("sf-edit-mode", "1"));
  const e = await edit.newPage();
  await e.goto(ORIGIN + "/", { waitUntil: "load" });
  await e.waitForTimeout(300);
  const ed = await e.evaluate(() => ({
    cls: document.documentElement.classList.contains("sf-motion"),
    anims: document.getAnimations().filter((a) => a.effect?.target?.closest?.("main")).length,
  }));
  check(!ed.cls && ed.anims === 0, "edit mode: no motion", `${ed.anims} animations in main`);
  await edit.close();
}
await browser.close();

/* ---------------- Placeholders ---------------- */
console.log("\nPLACEHOLDERS still showing (data-placeholder elements in the served HTML)");
let totalPh = 0;
for (const [p, n] of Object.entries(placeholders)) {
  totalPh += n;
  if (n) console.log(`  ${p.padEnd(12)} ${n}`);
}
console.log(`  total        ${totalPh}`);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll site checks passed.");
process.exit(failures ? 1 : 0);
