/* ============================================================
   In-page editing: the rules, in one place
   ------------------------------------------------------------
   Imported by BOTH sides of the feature:

     · the API routes in src/pages/api/content*        (server)
     · src/scripts/inline-edit.js                      (browser)

   What the browser lets you click into and what the server lets you save
   must never disagree, so both are computed from the rules here.

   What is checked:

     · the page is one of KNOWN_PATHS
     · the edit_key is shaped like a declared key
     · the text is non-empty and no longer than MAX_TEXT
     · the text is stripped of markup and control characters

   There is no check on what the text SAYS. The session decides who may
   edit; this only stops a signed-in editor posting something the page
   cannot hold.

   Keep this file free of server-only imports (no mysql2, no node:*): it
   is bundled into the browser script.

   Invisible or look-alike characters are written as \\uXXXX escapes in
   new RegExp(...) on purpose; a pasted literal is a silent bug.
   ============================================================ */

/** Longest text we will store, in characters. */
export const MAX_TEXT = 2000;

/** localStorage key prefix for the per-page edit cache. */
export const CACHE_PREFIX = "sf-edits:";

/* ------------------------------------------------------------
   Which pages may be edited
   ------------------------------------------------------------
   Hardcoded from src/pages so a stray `path` in a POST body can never
   reach the database. Add a page here when you add one to src/pages.
   The 404 is deliberately absent: its address is any address.
   ------------------------------------------------------------ */
export const KNOWN_PATHS: readonly string[] = [
  "/",
  "/about",
  "/services",
  "/projects",
  "/locations",
  "/gallery",
  "/contact-us",
];

const KNOWN_PATH_SET = new Set(KNOWN_PATHS);

/**
 * Reduce a pathname to the single form we store: lower case, no query,
 * no hash, no trailing slash (except the root). "/About/" -> "/about".
 * Returns null if the result is not an editable page.
 */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let p = raw.trim();
  if (!p) return null;

  // Tolerate a full URL as well as a bare pathname.
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      return null;
    }
  }
  p = p.split("?")[0].split("#")[0].toLowerCase();
  if (!p.startsWith("/")) return null;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (p === "") p = "/";

  return KNOWN_PATH_SET.has(p) ? p : null;
}

/* ------------------------------------------------------------
   Text normalisation
   ------------------------------------------------------------
   Rendered HTML wraps copy across source lines, so "Fire safety\n   for"
   in the markup is "Fire safety for" on screen. Both sides funnel every
   string through this before comparing or storing.
   ------------------------------------------------------------ */
const RE_NBSP = new RegExp("\\u00a0", "g");
const RE_ZERO_WIDTH = new RegExp("[\\u200b-\\u200d\\ufeff]", "g");

/** Control characters, but NOT \t \r \n, which are folded to spaces
    below rather than deleted (deleting would glue two words together). */
const RE_CONTROL = new RegExp(
  "[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]",
  "g"
);

export function normalizeText(raw: unknown): string {
  return String(raw ?? "")
    .replace(RE_NBSP, " ")
    .replace(RE_ZERO_WIDTH, "") // zero-width junk arrives with pasted text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Remove any markup. We store plain text and render it via textContent. */
export function stripTags(raw: unknown): string {
  return String(raw ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(RE_CONTROL, "");
}

/** stripTags + normalizeText: the form everything is judged in. */
export function cleanText(raw: unknown): string {
  return normalizeText(stripTags(raw));
}

/* ------------------------------------------------------------
   edit_key: a DECLARED NAMED SLOT
   ------------------------------------------------------------
   An edit is keyed by a string the author writes into the markup:

       <h1 data-edit="home.hero.headline">{copy.hero.headline}</h1>

   The key is stored as-is and not computed from the DOM, so it survives
   the section around it being rewritten, re-wrapped or reordered.
   `original_text` is still recorded, as an audit note of what the page
   said when the edit was made, never as the thing the browser matches
   on.

   The key mirrors the copy object's path, with the page as its first
   segment (docs/DESIGN-SYSTEM.md, "Editable slots").

   The server never builds a key and refuses anything not shaped like
   one. The value goes back out to other visitors' browsers as a
   querySelector argument, so its character set is deliberately narrow:
   lower-case alphanumerics and hyphens within a segment, dots between
   segments, at least two segments.
   ------------------------------------------------------------ */
export const MAX_KEY = 512;

const KEY_SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)*";
export const RE_EDIT_KEY = new RegExp(
  "^" + KEY_SEGMENT + "(?:\\." + KEY_SEGMENT + ")+$"
);

export function isValidKey(raw: unknown): raw is string {
  return (
    typeof raw === "string" &&
    raw.length > 0 &&
    raw.length <= MAX_KEY &&
    RE_EDIT_KEY.test(raw)
  );
}

/* ------------------------------------------------------------
   Where an edit came from
   ------------------------------------------------------------
   Writes sit behind one shared passphrase, so the address and user agent
   are the only record of where a change came from. Audit data has to be
   true or absent: anything that does not parse is stored as NULL.

   The address arrives in X-Forwarded-For, set by the reverse proxy. The
   first entry is the closest thing to the real origin and is entirely
   client-controlled, which is why it is parsed rather than trusted. If
   it is not an address we fall back to the socket address.

   Server-side only in practice, but nothing here touches node:*, so the
   browser bundle can tree-shake it away.
   ------------------------------------------------------------ */

/** Longest an IPv6 address can print, which is what the column holds. */
const MAX_IP = 45;

/** Strict dotted quad. Leading zeros are rejected as ambiguous. */
const RE_IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const RE_HEX_GROUP = /^[0-9a-f]{1,4}$/;

/** Split one side of a "::" into its groups; null if a stray colon
    left an empty one, as in ":1" or "1:". */
function ipv6Groups(part: string): string[] | null {
  if (part === "") return [];
  const groups = part.split(":");
  for (const g of groups) if (g === "") return null;
  return groups;
}

function isIPv6(raw: string): boolean {
  const s = raw.toLowerCase();
  if (s.length < 2 || s.length > MAX_IP) return false;
  if (!/^[0-9a-f:.]+$/.test(s)) return false;

  const halves = s.split("::");
  if (halves.length > 2) return false;
  const compressed = halves.length === 2;

  const head = ipv6Groups(halves[0]);
  const tail = compressed ? ipv6Groups(halves[1]) : [];
  if (head === null || tail === null) return false;

  const groups = head.concat(tail);
  let count = groups.length;

  // A trailing dotted quad ("::ffff:127.0.0.1") stands in for two groups.
  const last = groups[groups.length - 1];
  if (last !== undefined && last.includes(".")) {
    if (!RE_IPV4.test(last)) return false;
    count += 1;
    for (const g of groups.slice(0, -1))
      if (!RE_HEX_GROUP.test(g)) return false;
  } else {
    for (const g of groups) if (!RE_HEX_GROUP.test(g)) return false;
  }

  // "::" stands for at least one omitted group.
  return compressed ? count <= 7 : count === 8;
}

/**
 * An address we are willing to write down, or null. IPv4-mapped IPv6
 * ("::ffff:203.0.113.4") is folded to its IPv4 form.
 */
export function validIp(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s || s.length > MAX_IP) return null;

  // A bracketed literal, as in "[::1]".
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);

  if (RE_IPV4.test(s)) return s;
  if (!isIPv6(s)) return null;

  const mapped = /^::ffff:(.+)$/i.exec(s);
  if (mapped && RE_IPV4.test(mapped[1])) return mapped[1];
  return s.toLowerCase();
}

/**
 * The address to file a write under: the first entry of
 * X-Forwarded-For if it parses, otherwise the socket address, otherwise
 * nothing.
 */
export function clientIpFrom(
  request: Request,
  clientAddress?: string | null
): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = validIp(forwarded.split(",")[0]);
    if (first) return first;
  }
  return validIp(clientAddress);
}

/** The User-Agent, trimmed to what the column holds, or null. */
export function userAgentFrom(request: Request): string | null {
  const ua = request.headers.get("user-agent");
  if (!ua) return null;
  const clean = ua.replace(RE_CONTROL, "").trim();
  return clean ? clean.slice(0, 255) : null;
}

/* ------------------------------------------------------------
   One validation pass, shared by every write route
   ------------------------------------------------------------ */
export interface EditInput {
  path?: unknown;
  key?: unknown;
  original?: unknown;
  text?: unknown;
}

export type EditCheck =
  | { ok: true; path: string; key: string; original: string; text: string }
  | { ok: false; reason: string };

export function validateEdit(input: EditInput): EditCheck {
  const path = normalizePath(input.path);
  if (!path) return { ok: false, reason: "That page cannot be edited." };

  if (!isValidKey(input.key))
    return { ok: false, reason: "Could not identify the text on the page." };
  const key = String(input.key);

  const original = cleanText(input.original);
  const text = cleanText(input.text);

  if (!original) return { ok: false, reason: "The original text is missing." };
  if (original.length > MAX_TEXT)
    return { ok: false, reason: "That block of text is too long to edit." };

  if (!text) return { ok: false, reason: "Text cannot be empty." };
  if (text.length > MAX_TEXT)
    return { ok: false, reason: `Keep it under ${MAX_TEXT} characters.` };

  // No "text === original" check here: `original` is the text the page
  // was BUILT with, not necessarily what it says now. Only the route
  // knows the current value, so the route makes that call.
  return { ok: true, path, key, original, text };
}

/** Shared helper for the API routes: JSON, never cached. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
