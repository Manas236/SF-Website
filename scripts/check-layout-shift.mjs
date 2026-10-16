/* ============================================================
   Check: layout shift (CLS) while fonts and images arrive
   ------------------------------------------------------------
   Measures Cumulative Layout Shift with PerformanceObserver, the same
   signal Lighthouse reports, on throttled cold loads, because on
   localhost a font arrives in milliseconds and a fallback never gets
   the chance to paint: an unthrottled CLS of 0 proves nothing.

   Runs every route at 360 and 1280 wide: Slow 3G cold, then warm.
   Budget 0.1 (Google's "good"); the aim is about 0.

   Usage:  node scripts/check-layout-shift.mjs [origin]
   ============================================================ */
import { chromium } from "playwright";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
dotenv.config({ path: ROOT + ".env", quiet: true });

const ORIGIN = process.argv[2] || `http://localhost:${process.env.PORT || 4323}`;
const ROUTES = ["/", "/about", "/services", "/projects", "/locations", "/gallery", "/contact-us"];
const BUDGET = 0.1;

const INSTRUMENT = `
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
`;

async function launch() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return await chromium.launch();
  }
}

const SLOW_3G = { down: (400 * 1024) / 8, up: (400 * 1024) / 8, latency: 400 };

async function measure(browser, route, width, throttle) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(INSTRUMENT);
  if (throttle) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.clearBrowserCache");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: throttle.down, uploadThroughput: throttle.up, latency: throttle.latency });
  }
  await page.goto(ORIGIN + route, { waitUntil: "load", timeout: 180000 });
  await page.waitForTimeout(1500);
  const cls = await page.evaluate(() => window.__cls);
  await ctx.close();
  return cls;
}

const browser = await launch();
let worst = 0;
for (const route of ROUTES) {
  for (const width of [360, 1280]) {
    const cold = await measure(browser, route, width, SLOW_3G);
    const warm = await measure(browser, route, width, null);
    worst = Math.max(worst, cold, warm);
    console.log(`  ${route.padEnd(12)} ${String(width).padStart(4)}px  cold ${cold.toFixed(4)}  warm ${warm.toFixed(4)}`);
  }
}
await browser.close();
console.log(`\n  ${worst <= BUDGET ? "PASS" : "FAIL"}  worst CLS ${worst.toFixed(4)} against a budget of ${BUDGET}`);
process.exit(worst <= BUDGET ? 0 : 1);
