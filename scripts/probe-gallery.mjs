/* ============================================================
   Gallery studio round trip, in a real browser
   ------------------------------------------------------------
   Drives /studio/gallery the way an editor does:

     1. sign in
     2. upload one photo (a generated test image) with a caption
     3. hide one photo, reorder two, recaption one
     4. reload: all four changes are still there, in the studio AND on
        the public /gallery page (in a signed-out browser)
     5. undo all four from the History panel, reload, and check the
        gallery is back as it was

   The upload stays in gallery_uploads and MEDIA_DIR (append-only:
   nothing is deleted); undoing its `add` takes it off the site.

   Usage:  node scripts/probe-gallery.mjs [origin]
   ============================================================ */
import { chromium } from "playwright";
import sharp from "sharp";
import dotenv from "dotenv";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
dotenv.config({ path: ROOT + ".env", quiet: true });
const ORIGIN = (process.argv[2] || `http://localhost:${process.env.PORT || 4323}`).replace(/\/+$/, "");
const SLUG = process.env.EDIT_LOGIN_SLUG;
const PASS = process.env.EDIT_PASSPHRASE;
if (!SLUG || !PASS) {
  console.error("EDIT_LOGIN_SLUG and EDIT_PASSPHRASE must be set in .env");
  process.exit(1);
}

const STAMP = new Date().toISOString().slice(11, 19);
const UPLOAD_CAPTION = `Studio check upload ${STAMP}`;
const NEW_CAPTION = `Studio check caption ${STAMP}`;
const HIDE = "ceiling-detector.jpg"; // alarm group
const MOVE = "sprinkler-grid-warehouse-roof.jpg"; // first in fire-fighting, moved one later
const RECAPTION = "extinguisher-concrete-wall.jpg";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "  PASS  " : "  FAIL  "}${label}${detail ? ` (${detail})` : ""}`);
};

/* A unique test photo: random coloured blocks, so the duplicate check
   never mistakes it for a stock photo. */
const dir = mkdtempSync(path.join(tmpdir(), "sf-gallery-probe-"));
const testFile = path.join(dir, `studio-check-${Date.now()}.jpg`);
{
  const w = 1600, h = 1067, cells = 12;
  const raw = Buffer.alloc(cells * cells * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
  const img = await sharp(raw, { raw: { width: cells, height: cells, channels: 3 } }).resize(w, h, { kernel: "nearest" }).jpeg({ quality: 85 }).toBuffer();
  writeFileSync(testFile, img);
}

let browser;
try {
  browser = await chromium.launch({ channel: "chrome" });
} catch {
  browser = await chromium.launch();
}
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  [page error] " + e.message));

const saved = () => page.waitForResponse((r) => r.url().endsWith("/api/gallery") && r.request().method() === "POST", { timeout: 15000 });
const tile = (file) => page.locator(`article.gm-tile[data-file="${file}"]`).first();
const snapshot = async () => (await page.request.get(`${ORIGIN}/api/gallery`)).json();
const groupFiles = (snap, id) => snap.groups.find((g) => g.id === id).photos.map((p) => p.file);

async function publicGallery() {
  const anon = await browser.newContext();
  const p = await anon.newPage();
  await p.goto(`${ORIGIN}/gallery`, { waitUntil: "load" });
  const groups = await p.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("main [id] figure[data-lightbox-item]")].reduce((m, f) => {
        const g = f.dataset.lightboxGroup;
        const arr = m.get(g) ?? [];
        arr.push({ src: f.querySelector("img").getAttribute("src"), caption: f.querySelector("figcaption").textContent.trim() });
        m.set(g, arr);
        return m;
      }, new Map())
    )
  );
  await anon.close();
  return groups;
}

let undoIds = [];
try {
  /* 1. sign in */
  await page.goto(`${ORIGIN}/studio/${SLUG}`);
  await page.fill("#pass", PASS);
  await page.click("#go");
  await page.waitForURL(`${ORIGIN}/`);
  await page.goto(`${ORIGIN}/studio/gallery`, { waitUntil: "networkidle" });
  await page.waitForSelector("article.gm-tile");
  const before = await snapshot();
  check(true, "studio gallery manager loaded", `${before.groups.reduce((n, g) => n + g.photos.length, 0)} photos`);

  /* 2. upload */
  await page.locator("#g-materials .gm-upload-here").click();
  await page.setInputFiles("#gm-upload-input", testFile);
  await page.locator(".gm-q textarea").fill(UPLOAD_CAPTION);
  const up = page.waitForResponse((r) => r.url().endsWith("/api/gallery/upload"), { timeout: 60000 });
  await page.click("#gm-upload-go");
  const upRes = await up;
  await page.waitForSelector(".gm-q.is-done", { timeout: 30000 });
  await page.click("#gm-upload-close");
  const mid = await snapshot();
  const uploaded = mid.groups
    .flatMap((g) => g.photos)
    .find((p) => p.upload && p.caption === UPLOAD_CAPTION)?.file;
  check(upRes.status() === 200 && !!uploaded, "upload with a caption accepted", uploaded || `HTTP ${upRes.status()}`);

  /* 3. hide (two clicks), reorder, recaption */
  const hideBtn = tile(HIDE).getByRole("button", { name: "Hide", exact: true });
  await hideBtn.click();
  let wait = saved();
  await tile(HIDE).getByRole("button", { name: "Click again to hide" }).click();
  await wait;

  wait = saved();
  await tile(MOVE).locator('button[title="Move later"]').click();
  await wait;

  await tile(RECAPTION).locator(".gm-cap").click();
  await tile(RECAPTION).locator("textarea").fill(NEW_CAPTION);
  wait = saved();
  await tile(RECAPTION).getByRole("button", { name: "Save caption" }).click();
  await wait;

  /* 4. reload: still there */
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("article.gm-tile");
  const after = await snapshot();
  const all = after.groups.flatMap((g) => g.photos.map((p) => ({ ...p, group: g.id })));
  const up1 = all.find((p) => p.file === uploaded);
  check(!!up1 && up1.group === "materials" && up1.caption === UPLOAD_CAPTION && !up1.hidden, "after reload: upload is in Material Supplier with its caption");
  check(all.find((p) => p.file === HIDE)?.hidden === true, `after reload: ${HIDE} is hidden`);
  const ff = groupFiles(after, "fire-fighting");
  const ff0 = groupFiles(before, "fire-fighting");
  check(ff[0] === ff0[1] && ff[1] === ff0[0], "after reload: first two Fire Fighting photos swapped", `${ff[0]}, ${ff[1]}`);
  check(all.find((p) => p.file === RECAPTION)?.caption === NEW_CAPTION, `after reload: ${RECAPTION} has its new caption`);
  const tileVisible = await page.locator(`#g-materials article.gm-tile[data-file="${uploaded}"]`).isVisible();
  check(tileVisible, "the studio page shows the uploaded tile after reload");

  const pub = await publicGallery();
  const base = (f) => f.replace(/\.jpg$/, "");
  check((pub.materials ?? []).some((t) => t.src.includes(base(uploaded)) && t.caption === UPLOAD_CAPTION), "public /gallery shows the upload with its caption");
  check(!(pub.alarm ?? []).some((t) => t.src.includes(base(HIDE))), "public /gallery no longer shows the hidden photo");
  check((pub["fire-fighting"] ?? [])[0]?.src.includes(base(ff0[1])), "public /gallery shows the new order");
  check((pub.materials ?? []).some((t) => t.src.includes(base(RECAPTION)) && t.caption === NEW_CAPTION), "public /gallery shows the new caption");

  /* 5. undo all four from History */
  undoIds = after.history.filter((h) => !h.undone).slice(0, 4).map((h) => h.id);
  await page.click("#gm-history-open");
  for (const id of undoIds) {
    const li = page.locator("#gm-history-list li").filter({ has: page.getByRole("button", { name: "Undo" }) }).first();
    wait = saved();
    await li.getByRole("button", { name: "Undo" }).click();
    await wait;
  }
  await page.reload({ waitUntil: "networkidle" });
  const undone = await snapshot();
  const allU = undone.groups.flatMap((g) => g.photos);
  check(!allU.some((p) => p.file === uploaded), "after undo: the upload is off the site");
  check(allU.find((p) => p.file === HIDE)?.hidden === false, `after undo: ${HIDE} is back`);
  check(groupFiles(undone, "fire-fighting").join() === ff0.join(), "after undo: Fire Fighting order is back");
  check(allU.find((p) => p.file === RECAPTION)?.caption === before.groups.flatMap((g) => g.photos).find((p) => p.file === RECAPTION).caption, "after undo: original caption is back");
  const sameAsBefore = JSON.stringify(undone.groups.map((g) => g.photos.map((p) => [p.file, p.caption, p.hidden]))) ===
    JSON.stringify(before.groups.map((g) => g.photos.map((p) => [p.file, p.caption, p.hidden])));
  check(sameAsBefore, "after undo: the whole gallery matches how it started");

  await page.request.delete(`${ORIGIN}/api/edit-session`);
} catch (err) {
  failures++;
  console.log("  FAIL  threw: " + err.message);
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll gallery studio checks passed.");
process.exit(failures ? 1 : 0);
