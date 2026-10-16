/* ============================================================
   Editor round trip, in a real browser
   ------------------------------------------------------------
   Everything about the in-page editor that can go wrong goes wrong in
   the browser: the sign-in cookies, the editor bundle gated on the hint
   cookie, the gesture model, the optimistic write, the POST, and the
   repaint from the server on the NEXT load. So this drives Chrome
   through all of it:

     1. sign in at /studio/<slug>; a wrong slug must be a plain 404
     2. turn on "Edit text", click the target, type, press Enter
     3. the row is stored under the declared key (/api/content)
     4. a CLEAN browser (no cookies, no localStorage) sees the edit
     5. the editor sees it after a reload too
     6. "Undo last change" puts the original text back, and a clean
        browser sees the original again
     7. motion is off in edit mode (no sf-motion class after reload)

   Leaves the page as it found it: the undo in step 6 is a new row
   carrying the original text (the table is append-only).

   Usage:  node scripts/probe-editor.mjs [origin] [path] [key]
           defaults: http://localhost:<PORT>  /  home.hero.headline
   ============================================================ */
import { chromium } from "playwright";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
dotenv.config({ path: ROOT + ".env", quiet: true });

const ORIGIN = process.argv[2] || `http://localhost:${process.env.PORT || 4323}`;
const PAGE = process.argv[3] || "/";
const KEY = process.argv[4] || "home.hero.headline";
const STAMP = new Date().toISOString().slice(11, 19);
const NEW_TEXT = `Probe edit ${STAMP}: fire safety, done properly`;

const SLUG = process.env.EDIT_LOGIN_SLUG;
const PASS = process.env.EDIT_PASSPHRASE;
if (!SLUG || !PASS) {
  console.error("EDIT_LOGIN_SLUG and EDIT_PASSPHRASE must be set in .env");
  process.exit(1);
}

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "  PASS  " : "  FAIL  "}${label}${detail ? ` (${detail})` : ""}`);
};

async function launch() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return await chromium.launch();
  }
}

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  [page error] " + e.message));
const sel = `[data-edit="${KEY}"]`;

async function cleanRead() {
  const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await anon.newPage();
  await p.goto(ORIGIN + PAGE, { waitUntil: "networkidle" });
  const text = (await p.locator(sel).textContent())?.trim();
  const bar = await p.locator(".nt-bar").count();
  await anon.close();
  return { text, bar };
}

try {
  /* 1. sign in */
  await page.goto(`${ORIGIN}/studio/${SLUG}`, { waitUntil: "domcontentloaded" });
  await page.fill("#pass", PASS);
  await page.click("#go");
  await page.waitForURL(`${ORIGIN}/`, { timeout: 15000 });
  const names = (await ctx.cookies()).map((c) => c.name);
  check(names.includes("sf_edit"), "signed in: session cookie set");
  check(names.includes("sf_edit_ui"), "signed in: editor hint cookie set");

  const wrong = await page.request.get(`${ORIGIN}/studio/definitely-not-the-slug`);
  check(wrong.status() === 404, "a wrong sign-in slug is a plain 404", `got ${wrong.status()}`);

  /* 2. edit */
  await page.goto(ORIGIN + PAGE, { waitUntil: "networkidle" });
  await page.waitForSelector(".nt-bar .nt-pill-mode", { timeout: 15000 });
  check(true, "editor loaded for a signed-in browser");
  const original = (await page.locator(sel).textContent())?.trim();
  check(!!original, `slot present: ${KEY}`, original ? `"${original}"` : "missing");

  await page.click(".nt-pill-mode");
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-nt-mode"));
  check(await page.locator(sel).evaluate((n) => n.hasAttribute("data-nt-editable")), "slot marked editable");

  await page.locator(sel).click();
  await page.waitForFunction((s) => document.querySelector(s)?.hasAttribute("data-nt-editing"), sel);
  await page.keyboard.press("Control+A");
  await page.keyboard.type(NEW_TEXT);
  await page.keyboard.press("Enter");
  await page.waitForResponse((r) => r.url().endsWith("/api/content") && r.request().method() === "POST", { timeout: 10000 });

  /* 3. stored */
  const api = await (await page.request.get(`${ORIGIN}/api/content?path=${encodeURIComponent(PAGE)}`)).json();
  check(api.edits?.[KEY]?.text === NEW_TEXT, "stored under the declared key", api.edits?.[KEY] ? `"${api.edits[KEY].text}"` : "no row");

  /* 4. a clean browser sees it */
  const seen = await cleanRead();
  check(seen.text === NEW_TEXT, "a signed-out visitor sees the edit", `got "${seen.text}"`);
  check(seen.bar === 0, "no editor furniture for a signed-out visitor");

  /* 5. the editor sees it after reload; motion is off in edit mode */
  await page.reload({ waitUntil: "networkidle" });
  const after = (await page.locator(sel).textContent())?.trim();
  check(after === NEW_TEXT, "persists across a reload", `got "${after}"`);
  const motionOn = await page.evaluate(() => document.documentElement.classList.contains("sf-motion"));
  check(!motionOn, "motion is off while edit mode is on (no sf-motion class)");

  /* 6. undo puts the original back */
  await page.click(".nt-bar .nt-pill:not(.nt-pill-mode)");
  await page.waitForResponse((r) => r.url().endsWith("/api/content/revert"), { timeout: 10000 });
  await page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent.trim() === t, [sel, original], { timeout: 10000 });
  const back = await cleanRead();
  check(back.text === original, "after Undo, a signed-out visitor sees the original again", `got "${back.text}"`);

  /* leave edit mode for the next run */
  await page.click(".nt-pill-mode");
} catch (err) {
  failures++;
  console.log("  FAIL  threw: " + err.message);
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll editor round-trip checks passed.");
process.exit(failures ? 1 : 0);
