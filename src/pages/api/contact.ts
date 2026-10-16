/* ============================================================
   POST /api/contact: an enquiry from the contact form
   ------------------------------------------------------------
   PUBLIC: anyone can post here. Two ways in:

     JSON (the form's script)   { name, phone, email, service, message,
                                  website, elapsed }  -> JSON answer
     a plain form post (no JS)  the same fields plus `t`, the time the
                                page was rendered     -> 303 back to
                                /contact-us with ?sent=1 or ?error=<field>

   SPAM: `website` is a honeypot hidden from people; a send within two
   seconds of the form appearing is a script. Both get a quiet "ok" and
   nothing is saved. Then a rate limit: 5 enquiries an hour from one
   address, 200 a day in all.

   ORDER: validate, then SAVE THE LEAD (leads table). The visitor is told
   it worked as soon as the row is saved. Only then, in the background,
   is a copy emailed (src/lib/mailer.ts); with SMTP_HOST empty that is
   skipped and the log says "email disabled". What happened to the email
   is recorded in lead_emails (append-only), so the app needs nothing
   beyond SELECT and INSERT.
   ============================================================ */
import type { APIRoute } from "astro";
import type { ResultSetHeader } from "mysql2";
import pool from "../../lib/db";
import { clientIpFrom, userAgentFrom } from "../../lib/editable";
import { validateLead, type LeadInput } from "../../lib/leads";
import { sendLead, type SendResult } from "../../lib/mailer";
import { formErrors } from "../../data/contact-page";
import { site } from "../../data/site";

export const prerender = false;

const MAX_BODY = 16 * 1024;
const MIN_ELAPSED_MS = 2000;

const PER_IP = 5;
const PER_IP_MS = 60 * 60 * 1000;
const PER_DAY = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const recent = new Map<string, number[]>();
let daily: number[] = [];

function rateLimited(key: string): boolean {
  const now = Date.now();
  daily = daily.filter((t) => now - t < DAY_MS);
  const list = (recent.get(key) ?? []).filter((t) => now - t < PER_IP_MS);
  recent.set(key, list);
  if (list.length >= PER_IP || daily.length >= PER_DAY) return true;
  list.push(now);
  daily.push(now);
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.length) recent.delete(k);
  return false;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function back(query: string): Response {
  return new Response(null, { status: 303, headers: { Location: `/contact-us?${query}#enquiry`, "Cache-Control": "no-store" } });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const INSERT_LEAD = `
  INSERT INTO leads (name, phone, email, service, message, page, client_ip, user_agent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;
const INSERT_MAIL = `INSERT INTO lead_emails (lead_id, outcome, detail) VALUES (?, ?, ?)`;

/** After the visitor has their answer: email a copy, record the outcome. */
async function mailInBackground(id: number, lead: { name: string; phone: string; email: string | null; service: string; message: string }) {
  const rows: [string, string][] = [
    ["Name", lead.name],
    ["Phone", lead.phone],
    ["Email", lead.email ?? "(not given)"],
    ["Service", lead.service],
  ];
  const text =
    `New enquiry from the ${site.name} website.\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nMessage:\n${lead.message}\n\nEnquiry number ${id} in the website database.`;
  const html =
    `<p>New enquiry from the ${escapeHtml(site.name)} website.</p><table cellpadding="4">` +
    rows.map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${escapeHtml(v)}</td></tr>`).join("") +
    `</table><p><strong>Message</strong><br>${escapeHtml(lead.message).replace(/\n/g, "<br>")}</p>` +
    `<p>Enquiry number ${id} in the website database.</p>`;

  let result: SendResult;
  try {
    result = await sendLead({
      subject: `Website enquiry: ${lead.service} | ${lead.name}`,
      text,
      html,
      replyTo: lead.email ? `"${lead.name.replace(/["\\]/g, "")}" <${lead.email}>` : undefined,
    });
  } catch (err) {
    result = { outcome: "failed", detail: String(err).slice(0, 250) };
  }
  if (result.outcome === "disabled") console.log(`Lead ${id} saved; email disabled (SMTP_HOST is empty).`);
  try {
    await pool.execute(INSERT_MAIL, [id, result.outcome, result.outcome === "failed" ? result.detail : null]);
  } catch (err) {
    console.error("Failed to record the email outcome for lead", id, err);
  }
}

export const POST: APIRoute = async (context) => {
  const { request } = context;
  const type = request.headers.get("content-type") ?? "";
  const isForm = type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data");

  let socket: string | null = null;
  try {
    socket = context.clientAddress;
  } catch {
    socket = null;
  }
  const ip = clientIpFrom(request, socket);
  const ua = userAgentFrom(request);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return isForm ? back("error=message") : json({ error: formErrors.tooLong, field: "message" }, 413);

  let body: Record<string, unknown>;
  try {
    if (isForm) {
      body = Object.fromEntries((await request.formData()).entries());
    } else {
      const raw = await request.text();
      if (raw.length > MAX_BODY) return json({ error: formErrors.tooLong, field: "message" }, 413);
      body = JSON.parse(raw);
    }
  } catch {
    return isForm ? back("error=server") : json({ error: formErrors.server }, 400);
  }
  if (!body || typeof body !== "object") return isForm ? back("error=server") : json({ error: formErrors.server }, 400);

  /* Bots: answer as if it worked, keep nothing. */
  const elapsed = isForm ? Date.now() - Number(body.t) : Number(body.elapsed);
  if (String(body.website ?? "").trim() || !(elapsed >= MIN_ELAPSED_MS)) {
    return isForm ? back("sent=1") : json({ ok: true });
  }

  if (rateLimited(ip ?? "unknown")) return isForm ? back("error=rate") : json({ error: formErrors.rate }, 429);

  const check = validateLead(body as LeadInput);
  if (!check.ok) return isForm ? back(`error=${check.field}`) : json({ error: check.error, field: check.field }, 400);

  let id: number;
  try {
    const [res] = await pool.execute<ResultSetHeader>(INSERT_LEAD, [
      check.name,
      check.phone,
      check.email,
      check.service,
      check.message,
      "/contact-us",
      ip,
      ua,
    ]);
    id = res.insertId;
  } catch (err) {
    console.error("Failed to save a lead:", err);
    return isForm ? back("error=server") : json({ error: formErrors.server }, 500);
  }

  /* The lead is safe. The email copy happens after the answer. */
  void mailInBackground(id, check);

  return isForm ? back("sent=1") : json({ ok: true });
};
