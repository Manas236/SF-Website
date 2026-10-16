/* ============================================================
   Check: every flow that writes to the database, end to end
   ------------------------------------------------------------
   Drives the running site over HTTP the way an editor and a visitor do,
   and says PASS or FAIL for each write flow:

     1. text edit   an edit saved on the homepage shows in /api/content,
                    and is reverted again
     2. gallery     a photo hidden in the studio is hidden in the
                    snapshot, and the hide is undone again
     3. project     an entry added to the "ongoing" list shows on
                    /projects, and is removed again
     4. lead        (only with --with-lead) a contact-form enquiry is
                    saved to the `leads` table

   Written for a deploy (docs/DEPLOY.md): it proves the app works with
   its database user's own rights (SELECT and INSERT only), now that the
   schema comes from db/migrate.sql and never from the app. Each flow is
   checked by looking for what it wrote, not by a status code alone.

   IT CLEANS UP after itself where the app can: the edit is reverted,
   the hide undone, the entry removed (append-only tables keep both
   rows, as every editor action does). A lead cannot be removed by the
   app (leads are append-only), which is why step 4 is opt-in; its
   message says it is a test.

   Signs in with EDIT_PASSPHRASE from .env, which it never prints.

   Usage:  node scripts/check-db-flows.mjs [origin] [--with-lead]
   ============================================================ */
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
dotenv.config({ path: ROOT + ".env", quiet: true });

const args = process.argv.slice(2);
const WITH_LEAD = args.includes("--with-lead");
const ORIGIN = (args.find((a) => !a.startsWith("--")) || `http://localhost:${process.env.PORT || 4323}`).replace(/\/+$/, "");
const STAMP = new Date().toISOString().replace(/\D/g, "").slice(0, 17);
const MARK = `Deploy check ${STAMP}-${Math.random().toString(16).slice(2, 6)}`;

/* ---------- HTTP, with the session cookie carried along ---------- */
const jar = new Map();

async function call(method, path, body) {
  const headers = { origin: ORIGIN };
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(ORIGIN + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  for (const line of res.headers.getSetCookie()) {
    const pair = line.split(";")[0];
    const at = pair.indexOf("=");
    const name = pair.slice(0, at).trim();
    const value = pair.slice(at + 1).trim();
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}

const said = (r) => (r.json?.error ? `HTTP ${r.status}: ${r.json.error}` : `HTTP ${r.status}`);

const results = [];
function record(step, outcome, detail = "") {
  results.push({ step, outcome });
  console.log(`${outcome.padEnd(4)}  ${step}${detail ? `  (${detail})` : ""}`);
}

const left = { edit: false, hide: null, block: null };

/* ---------- 1. text edit ---------- */
async function textFlow() {
  const key = "home.hero.headline";
  const before = await call("GET", "/api/content?path=/");
  const current = before.json?.edits?.[key]?.text ?? null;
  const html = await call("GET", "/");
  const built = html.text.match(new RegExp(`data-edit="${key.replace(/\./g, "\\.")}"[^>]*>([^<]*)<`))?.[1]?.trim();
  if (!built) return record("1 text edit", "FAIL", "the homepage has no home.hero.headline slot");

  const save = await call("POST", "/api/content", { path: "/", key, original: built, text: MARK });
  if (!(save.status === 200 && save.json?.ok)) return record("1 text edit", "FAIL", `save: ${said(save)}`);
  left.edit = true;
  const read = await call("GET", "/api/content?path=/");
  const stored = read.json?.edits?.[key]?.text === MARK;

  const undo = await call("POST", "/api/content/revert", { path: "/", key });
  const after = await call("GET", "/api/content?path=/");
  const restored = (after.json?.edits?.[key]?.text ?? null) === (current ?? built);
  if (undo.status === 200) left.edit = false;

  if (!stored) record("1 text edit", "FAIL", "saved, but /api/content does not return it");
  else if (undo.status !== 200) record("1 text edit", "FAIL", `revert: ${said(undo)}`);
  else if (!restored) record("1 text edit", "FAIL", "reverted, but the text is not what it was");
  else record("1 text edit", "PASS", "saved, read back and reverted");
}

/* ---------- 2. gallery ---------- */
async function galleryFlow() {
  const snap = await call("GET", "/api/gallery");
  if (snap.status !== 200) return record("2 gallery", "FAIL", said(snap));
  const photo = snap.json.groups.flatMap((g) => g.photos).find((p) => !p.hidden);
  if (!photo) return record("2 gallery", "SKIP", "no visible photo to hide");

  const hide = await call("POST", "/api/gallery", { action: "hide", file: photo.file });
  if (hide.status !== 200) return record("2 gallery", "FAIL", `hide: ${said(hide)}`);
  const ev = hide.json.history.find((h) => h.action === "hide" && h.file === photo.file && !h.undone);
  left.hide = ev?.id ?? null;
  const hidden = hide.json.groups.flatMap((g) => g.photos).find((p) => p.file === photo.file)?.hidden;
  const page = await call("GET", "/gallery");
  const offPage = !page.text.includes(photo.file.replace(/\.jpg$/, ""));

  const undo = left.hide ? await call("POST", "/api/gallery", { action: "undo", ref: left.hide }) : { status: 0 };
  const back = undo.status === 200 && !undo.json.groups.flatMap((g) => g.photos).find((p) => p.file === photo.file)?.hidden;
  if (back) left.hide = null;

  if (!hidden) record("2 gallery", "FAIL", "hide saved, but the photo is not hidden");
  else if (!offPage) record("2 gallery", "FAIL", "hidden in the studio, but /gallery still shows it");
  else if (!back) record("2 gallery", "FAIL", `undo: ${said(undo)}`);
  else record("2 gallery", "PASS", `${photo.file} hidden, gone from /gallery, then restored`);
}

/* ---------- 3. project list ---------- */
async function projectFlow() {
  const add = await call("POST", "/api/project-blocks", { action: "add", slug: "ongoing", kind: "heading", text: `${MARK}, removed by the same script` });
  if (!(add.status === 200 && add.json?.id)) return record("3 project", "FAIL", `add: ${said(add)}`);
  left.block = add.json.id;
  const shown = (await call("GET", "/projects")).text.includes(`data-block="${left.block}"`);
  const rm = await call("POST", "/api/project-blocks", { action: "remove", slug: "ongoing", id: left.block });
  const gone = !(await call("GET", "/projects")).text.includes(`data-block="${left.block}"`);
  if (rm.status === 200 && rm.json?.ok) left.block = null;

  if (!shown) record("3 project", "FAIL", "saved, but /projects does not show it");
  else if (!(rm.status === 200 && rm.json?.ok)) record("3 project", "FAIL", `remove: ${said(rm)}`);
  else if (!gone) record("3 project", "FAIL", "removed, but /projects still shows it");
  else record("3 project", "PASS", `entry #${add.json.id} added to "ongoing" and removed`);
}

/* ---------- 4. lead ---------- */
async function leadFlow() {
  if (!WITH_LEAD) return record("4 lead", "SKIP", "leads cannot be deleted; rerun with --with-lead to include it");
  const sent = await call("POST", "/api/contact", {
    name: "Deploy check",
    phone: "+91 90000 00000",
    email: "",
    service: "Fire AMC",
    message: `${MARK}: an automated test enquiry. Please ignore.`,
    website: "",
    elapsed: 5000,
  });
  if (!(sent.status === 200 && sent.json?.ok)) return record("4 lead", "FAIL", said(sent));
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [rows] = await db.execute("SELECT id FROM leads WHERE message LIKE ? ORDER BY id DESC LIMIT 1", [`${MARK}%`]);
  let mail = null;
  if (rows.length) {
    const [m] = await db.execute("SELECT outcome FROM lead_emails WHERE lead_id = ? ORDER BY id DESC LIMIT 1", [rows[0].id]);
    mail = m[0]?.outcome ?? "none recorded yet";
  }
  await db.end();
  if (!rows.length) record("4 lead", "FAIL", "the form said ok, but no row is in `leads`");
  else record("4 lead", "PASS", `lead #${rows[0].id} saved; email: ${mail}`);
}

/* ---------- run ---------- */
console.log(`Database flows on ${ORIGIN}, marker "${MARK}"\n`);
if (!process.env.EDIT_PASSPHRASE) {
  console.log(`FAIL  sign in  (no EDIT_PASSPHRASE in ${ROOT}.env)`);
  process.exit(1);
}

let signedIn = false;
try {
  const login = await call("POST", "/api/edit-session", { passphrase: process.env.EDIT_PASSPHRASE });
  if (!(login.status === 200 && login.json?.ok && jar.has("sf_edit"))) {
    record("sign in", "FAIL", said(login));
  } else {
    signedIn = true;
    await textFlow();
    await galleryFlow();
    await projectFlow();
    await leadFlow();
  }
} catch (err) {
  record("run", "FAIL", `could not reach ${ORIGIN}: ${err.cause?.code || err.message}`);
} finally {
  try {
    if (left.edit) await call("POST", "/api/content/revert", { path: "/", key: "home.hero.headline" });
    if (left.hide) await call("POST", "/api/gallery", { action: "undo", ref: left.hide });
    if (left.block) await call("POST", "/api/project-blocks", { action: "remove", slug: "ongoing", id: left.block });
    if (signedIn) await call("DELETE", "/api/edit-session");
  } catch {
    /* reported below */
  }
  const leftOver = Object.entries(left).filter(([, v]) => v);
  if (leftOver.length) console.log(`\nLEFT ON THE SITE: undo by hand: ${leftOver.map(([k, v]) => `${k} ${v}`).join(", ")}`);
}

const failed = results.filter((r) => r.outcome === "FAIL").length;
const skipped = results.filter((r) => r.outcome === "SKIP").length;
console.log(
  `\n${failed ? `${failed} FAILED` : "All run flows passed"}${skipped ? `, ${skipped} skipped` : ""}, ${results.filter((r) => r.outcome === "PASS").length} passed.`
);
process.exit(failed ? 1 : 0);
