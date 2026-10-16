/* ============================================================
   POST   /api/edit-session   sign in    { passphrase }
   DELETE /api/edit-session   sign out
   GET    /api/edit-session   { authed: boolean }
   ------------------------------------------------------------
   The passphrase goes in, a signed cookie comes out. See
   src/lib/edit-auth.ts for the token and for why there is no session
   store.

   Reachable by path alone, on purpose. The secret slug hides the sign-in
   PAGE from crawlers; it is not the protection. Putting the slug in this
   URL would put the secret in every fetch, every network log and every
   access log, and buy nothing. Rate-limit this path at the reverse proxy
   (docs/DEPLOY.md).
   ============================================================ */
import type { APIRoute } from "astro";
import {
  EDIT_COOKIE,
  EDIT_UI_COOKIE,
  TOKEN_TTL_SECONDS,
  checkPassphrase,
  isAuthed,
  issueToken,
} from "../../lib/edit-auth";
import { clientIpFrom } from "../../lib/editable";

export const prerender = false;

function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  // Set-Cookie legitimately repeats, so it is appended.
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
}

/* `Secure` follows the real scheme. A Secure cookie set over plain HTTP
   (a test server on a bare IP) is dropped silently and sign-in would
   never work. The proxy sets X-Forwarded-Proto.

   SameSite=Lax: nothing on another origin may post here with the
   cookie. HttpOnly on the token so no script can lift a session. */
function cookieLine(
  name: string,
  value: string,
  maxAge: number,
  secure: boolean,
  httpOnly: boolean
): string {
  const bits = [`${name}=${value}`, "Path=/", `Max-Age=${maxAge}`, "SameSite=Lax"];
  if (httpOnly) bits.push("HttpOnly");
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

function isHttps(request: Request): boolean {
  return request.headers.get("x-forwarded-proto") === "https";
}

/* A backstop to the proxy's limit, in case the site runs without one:
   10 attempts per 10 minutes per address. A correct passphrase is never
   counted. */
const ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;
const failures = new Map<string, number[]>();

function tooMany(ip: string): boolean {
  const now = Date.now();
  const list = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(ip, list);
  if (failures.size > 5000) for (const [k, v] of failures) if (!v.length) failures.delete(k);
  return list.length >= ATTEMPTS;
}

export const POST: APIRoute = async (context) => {
  const { request } = context;
  let socket: string | null = null;
  try {
    socket = context.clientAddress;
  } catch {
    socket = null;
  }
  const ip = clientIpFrom(request, socket) ?? "unknown";
  if (tooMany(ip)) return json({ error: "Too many attempts. Wait a few minutes and try again." }, 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const passphrase =
    body && typeof body === "object" ? (body as Record<string, unknown>).passphrase : null;

  /* One message for every failure, so a script learns nothing about
     which part to vary. */
  if (typeof passphrase !== "string" || !checkPassphrase(passphrase)) {
    failures.get(ip)?.push(Date.now());
    return json({ error: "That passphrase is not right." }, 401);
  }

  const secure = isHttps(request);

  return json({ ok: true }, 200, [
    cookieLine(EDIT_COOKIE, issueToken(), TOKEN_TTL_SECONDS, secure, true),
    /* The hint. Not HttpOnly, deliberately: the page reads it to decide
       whether to import the editor bundle. It carries no authority; the
       server must never read it. */
    cookieLine(EDIT_UI_COOKIE, "1", TOKEN_TTL_SECONDS, secure, false),
  ]);
};

export const DELETE: APIRoute = async ({ request }) => {
  const secure = isHttps(request);
  // Attributes must match the ones they were set with, Path above all.
  return json({ ok: true }, 200, [
    cookieLine(EDIT_COOKIE, "", 0, secure, true),
    cookieLine(EDIT_UI_COOKIE, "", 0, secure, false),
  ]);
};

/** A boolean and nothing else: the token is never echoed back. */
export const GET: APIRoute = async ({ request }) => json({ authed: isAuthed(request) });
