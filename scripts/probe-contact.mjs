/* ============================================================
   Contact form, in a real browser
   ------------------------------------------------------------
     1. with JavaScript: an empty send shows a field error; a filled
        one shows the thank-you panel
     2. without JavaScript: the plain form post lands back on
        /contact-us?sent=1 with the thank-you panel showing
     3. ?service=<id> from the services page pre-selects the service
     4. the honeypot: a filled hidden field is answered "ok" and NOT
        saved (checked by counting rows)

   Each real send saves a lead marked "Automated form check" (leads are
   append-only). Usage:  node scripts/probe-contact.mjs [origin]
   ============================================================ */
import { chromium } from "playwright";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
dotenv.config({ path: ROOT + ".env", quiet: true });
const ORIGIN = (process.argv[2] || `http://localhost:${process.env.PORT || 4323}`).replace(/\/+$/, "");
const MARK = `Automated form check ${new Date().toISOString().slice(0, 19)}`;

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "  PASS  " : "  FAIL  "}${label}${detail ? ` (${detail})` : ""}`);
};

const db = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
const count = async () => Number((await db.execute("SELECT COUNT(*) AS n FROM leads WHERE message LIKE ?", [`${MARK}%`]))[0][0].n);

let browser;
try {
  browser = await chromium.launch({ channel: "chrome" });
} catch {
  browser = await chromium.launch();
}

async function fill(page, note) {
  await page.fill("#cf-name", "Form Check");
  await page.fill("#cf-phone", "+91 90000 00000");
  await page.selectOption("#cf-service", "Fire AMC");
  await page.fill("#cf-message", `${MARK}: ${note}. Please ignore.`);
}

try {
  /* 1. with JavaScript */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/contact-us`, { waitUntil: "load" });
  await page.click("[data-contact-form] button[type=submit]");
  const err = await page.locator("[data-contact-error]").textContent();
  check(/name/i.test(err ?? ""), "empty send shows a field error", err?.trim());
  await page.waitForTimeout(2100); // a human takes more than two seconds
  await fill(page, "sent with JavaScript");
  await page.click("[data-contact-form] button[type=submit]");
  await page.waitForSelector("[data-contact-done]:not([hidden])", { timeout: 10000 });
  check(await page.locator("[data-contact-done]").isVisible(), "thank-you panel shows after a send");
  check((await count()) === 1, "the lead is in the database");
  await ctx.close();

  /* 2. without JavaScript */
  const nojs = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const p2 = await nojs.newPage();
  /* Without JavaScript Chrome ignores loading="lazy", so "load" would
     wait on the map iframes: wait for the DOM instead. */
  await p2.goto(`${ORIGIN}/contact-us`, { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(2100);
  await fill(p2, "sent without JavaScript");
  /* Enter in a field submits the form, as it does for a visitor. (A
     click can report "not stable" while the map iframes, loaded
     eagerly with JavaScript off, are still settling.) */
  await p2.press("#cf-name", "Enter", { noWaitAfter: true });
  /* waitForURL can hang with JavaScript off: poll the address instead. */
  for (let i = 0; i < 50 && !/\/contact-us\?sent=1/.test(p2.url()); i++) await p2.waitForTimeout(200);
  await p2.waitForTimeout(500);
  check(await p2.locator("[data-contact-done]").isVisible(), "no-JS post comes back to the thank-you panel", p2.url());
  check((await count()) === 2, "the no-JS lead is in the database");

  /* 3. pre-selected service */
  await p2.goto(`${ORIGIN}/contact-us?service=core-cutting`, { waitUntil: "domcontentloaded" });
  check((await p2.locator("#cf-service").inputValue()) === "Core Cutting & Drilling", "?service=core-cutting pre-selects the service");
  await nojs.close();

  /* 4. honeypot */
  const res = await fetch(`${ORIGIN}/api/contact`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Bot", phone: "9000000000", service: "Fire AMC", message: `${MARK}: honeypot`, website: "http://spam.example", elapsed: 9000 }),
  });
  const body = await res.json();
  check(res.status === 200 && body.ok && (await count()) === 2, "a filled honeypot is answered ok and not saved");
} catch (e) {
  failures++;
  console.log("  FAIL  threw: " + e.message);
} finally {
  await browser.close();
  await db.end();
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll contact form checks passed.");
process.exit(failures ? 1 : 0);
