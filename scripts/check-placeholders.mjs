/* ============================================================
   Placeholders: what the client still has to supply
   ------------------------------------------------------------
   Every gap is ONE format, ph("...") in a copy module, rendered as
   "[Client to supply: ...]" on an editable slot (src/data/placeholder.ts).

     1. SOURCE: lists every ph(...) call in src/data/*.ts, with its file
        and line. No server needed.
     2. LIVE (when the site answers at the origin): for every page,
        finds the elements still marked data-placeholder and asks
        /api/content whether the client has already replaced that text
        in place. A replaced one is done, even though the source still
        says ph(...): the client's edit is what visitors see.

   Exit 1 while any placeholder is still showing on the live site (or,
   with no server, while any exists in the source), so a launch build
   can refuse to go out with one.

   Usage:  node scripts/check-placeholders.mjs [origin]
   ============================================================ */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
dotenv.config({ path: ROOT + ".env", quiet: true });
const ORIGIN = (process.argv[2] || `http://localhost:${process.env.PORT || 4323}`).replace(/\/+$/, "");
const PAGES = ["/", "/about", "/services", "/projects", "/locations", "/gallery", "/contact-us"];

/* 1. Source */
const dataDir = path.join(ROOT, "src", "data");
const found = [];
for (const file of readdirSync(dataDir).filter((f) => f.endsWith(".ts") && f !== "placeholder.ts")) {
  readFileSync(path.join(dataDir, file), "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      for (const m of line.matchAll(/\bph\(\s*"([^"]*)"\s*\)/g)) found.push({ file: `src/data/${file}`, line: i + 1, what: m[1] });
    });
}
console.log(`SOURCE: ${found.length} placeholder${found.length === 1 ? "" : "s"} in the copy modules`);
for (const f of found) console.log(`  ${f.file}:${f.line}  [Client to supply: ${f.what}]`);

/* 2. Live */
let live = null;
try {
  live = [];
  for (const page of PAGES) {
    const html = await (await fetch(ORIGIN + page)).text();
    const keys = [...html.matchAll(/<[a-z0-9]+\s[^>]*data-edit="([^"]+)"[^>]*\bdata-placeholder\b[^>]*>/gi)].map((m) => m[1]);
    if (!keys.length) continue;
    const { edits = {} } = await (await fetch(`${ORIGIN}/api/content?path=${encodeURIComponent(page)}`)).json();
    for (const key of keys) {
      const text = edits[key]?.text;
      live.push({ page, key, replaced: !!text && !text.startsWith("[Client to supply:") });
    }
  }
} catch {
  live = null;
}

if (live) {
  const open = live.filter((l) => !l.replaced);
  console.log(`\nLIVE on ${ORIGIN}: ${live.length} placeholder slots, ${live.length - open.length} replaced by the client, ${open.length} still showing`);
  for (const l of live) console.log(`  ${l.replaced ? "done   " : "OPEN   "} ${l.page.padEnd(12)} ${l.key}`);
  process.exit(open.length ? 1 : 0);
}
console.log(`\n(No site at ${ORIGIN}; source count only.)`);
process.exit(found.length ? 1 : 0);
