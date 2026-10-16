/* ============================================================
   Editor sign-in: the shared rules
   ------------------------------------------------------------
   Two layers, and they must not be confused:

     the SECRET PATH (EDIT_LOGIN_SLUG) controls DISCOVERY. It keeps
     /studio/<slug> off crawlers, wordlists and address bars. It is not
     authorisation: knowing the URL never means "may write". All it
     unlocks is the sight of a passphrase box.

     the PASSPHRASE (EDIT_PASSPHRASE) is the actual protection. It turns
     into a signed cookie, and that cookie is what every write route
     checks.

   STATELESS ON PURPOSE. A session is a signed string the browser
   carries, not a row and not an in-memory map, so a restart for a
   deploy never signs the editor out mid-sentence. The trade: one token
   cannot be revoked on its own. Changing EDIT_SECRET or EDIT_PASSPHRASE
   signs everybody out at once, which is right for one shared passphrase
   held by one or two people.
   ============================================================ */
import crypto from "node:crypto";
import "dotenv/config";

export const EDIT_COOKIE = "sf_edit";

/* Read by the browser, never trusted by the server. It only decides
   whether a page downloads the editor bundle at all (see
   src/pages/api/edit-session.ts). */
export const EDIT_UI_COOKIE = "sf_edit_ui";

/** Seven days: a week of edits needs one sign-in. */
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const SECRET = process.env.EDIT_SECRET ?? "";

/* Loud, at import time. A missing signing key must stop the write routes
   working at all; an HMAC keyed on "" could be forged by anyone who has
   read this file. Do not give this a default. Visitors still get the
   pages; the read path for saved text answers 500 until it is set, which
   is loud on purpose. */
if (!SECRET) {
  throw new Error(
    "EDIT_SECRET is not set. The in-page editor cannot sign or verify " +
      "sessions without it. Set EDIT_SECRET (32+ random bytes) in .env " +
      "(see .env.example)."
  );
}

/* Constant-time comparison. Hashing both sides first makes every
   comparison 32 bytes against 32 bytes, so neither the content nor the
   length of the secret leaks through timing. */
function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function sameSecret(input: string, expected: string): boolean {
  // An unset env var can never be matched, not even by an empty input.
  if (!expected) return false;
  return crypto.timingSafeEqual(digest(input), digest(expected));
}

/** Is this the secret path segment? Discovery only. */
export function checkSlug(slug: string): boolean {
  return sameSecret(slug, process.env.EDIT_LOGIN_SLUG ?? "");
}

/** Is this the shared passphrase? The only check that grants anything. */
export function checkPassphrase(input: string): boolean {
  return sameSecret(input, process.env.EDIT_PASSPHRASE ?? "");
}

/* The token: <expiryEpochSeconds>.<hmac>. The expiry travels in the
   clear but is signed, so the server, not the cookie's Max-Age, decides
   when a session ends. */
function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function issueToken(): string {
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  return `${expiry}.${sign(String(expiry))}`;
}

export function verifyToken(token: string | null): boolean {
  if (!token) return false;

  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const expiry = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  // Digits only: a payload that does not round-trip is malformed.
  if (!/^\d+$/.test(expiry)) return false;

  // Signature first: an unsigned token is never worth reading the clock for.
  if (!sameSecret(mac, sign(expiry))) return false;

  return Number(expiry) > Math.floor(Date.now() / 1000);
}

/* Hand-parsed so API routes and pages can share it: the Request is the
   one thing both have. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return part.slice(eq + 1).trim();
  }
  return null;
}

/** The only question the write routes ask. */
export function isAuthed(request: Request): boolean {
  return verifyToken(readCookie(request, EDIT_COOKIE));
}
