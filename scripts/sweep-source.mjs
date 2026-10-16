/* ============================================================
   Strip check: no trace of the source project
   ------------------------------------------------------------
   This codebase was ported from another contractor's website
   (docs/PORT-MAP.md). Nothing of that business may remain: not its
   name, people, clients, places, CSS variables, cookie or table
   prefixes, comments, docs, alt text, fixtures or package names.

   Sweeps every text file in the repository (and every file and folder
   NAME), case-insensitively, plus the git commit messages. Prints each
   hit with its line, and "0 hits" when clean. Exit 1 on any hit.

   The term list is stored base64-encoded so this file does not match
   itself. Short terms are matched as whole tokens, so a word that
   merely contains the letters (insurance, archive) is not a hit.

   Skipped: node_modules, .git, dist, .astro, media (uploads),
   raw-images, check-output, and binary files (images, fonts).

   Usage:  node scripts/sweep-source.mjs
   ============================================================ */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/* [base64 term, whole-token?] */
const ENCODED = [
  ["Sy5ELg==", false],
  ["S0Q=", true],
  ["a2Qt", "prefix"],
  ["LS1rZC0=", false],
  ["a2Rf", "prefix"],
  ["Q29uc3RydWN0aW9ucw==", false],
  ["S2FpbGFzaA==", false],
  ["U2FyaXRh", false],
  ["U2hpdg==", true],
  ["TW9oYW5sYWw=", false],
  ["QW1yaXRhbnNodQ==", false],
  ["VXJhbg==", true],
  ["S2FyamF0", false],
  ["Q0lEQ08=", false],
  ["Tk1NQw==", false],
  ["SVJDT04=", false],
  ["RkNJ", true],
  ["a2Rjb25zdHJ1Y3Rpb24=", false],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TERMS = ENCODED.map(([b64, mode]) => {
  const term = Buffer.from(b64, "base64").toString("utf8");
  let source = esc(term);
  if (mode === true) source = `(?<![A-Za-z0-9])${source}(?![A-Za-z0-9])`;
  else if (mode === "prefix") source = `(?<![A-Za-z0-9])${source}`;
  return { term, re: new RegExp(source, "i") };
});

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".astro", "media", "raw-images", "check-output"]);
const BINARY = /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|mp4|pdf|zip)$/i;

/* package-lock.json integrity hashes are base64 noise, not words. */
function scrub(rel, line) {
  if (rel === "package-lock.json") return line.replace(/"integrity":\s*"[^"]*"/g, '"integrity": ""');
  return line;
}

const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full).split(path.sep).join("/");
    const st = statSync(full);
    for (const { term, re } of TERMS) if (re.test(name)) hits.push(`${rel}  [file name]  (${term})`);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full);
      continue;
    }
    if (BINARY.test(name)) continue;
    const lines = readFileSync(full, "utf8").split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = scrub(rel, raw);
      for (const { term, re } of TERMS) {
        if (re.test(line)) hits.push(`${rel}:${i + 1}  (${term})  ${line.trim().slice(0, 140)}`);
      }
    });
  }
}

walk(ROOT);

let commits = 0;
try {
  const log = execFileSync("git", ["log", "--format=%H%x09%B%x1e"], { cwd: ROOT, encoding: "utf8" });
  for (const entry of log.split("\x1e")) {
    const [hash, ...rest] = entry.trim().split("\t");
    if (!hash) continue;
    commits++;
    const body = rest.join("\t");
    for (const { term, re } of TERMS) if (re.test(body)) hits.push(`commit ${hash.slice(0, 7)}  (${term})`);
  }
} catch {
  /* not a git checkout: files only */
}

console.log(`Source-trace sweep: ${TERMS.length} terms, case-insensitive, over the repository tree${commits ? ` and ${commits} commit messages` : ""}.`);
if (hits.length) {
  for (const h of hits) console.log("  HIT  " + h);
  console.log(`\n${hits.length} hits.`);
  process.exit(1);
}
console.log("0 hits.");
