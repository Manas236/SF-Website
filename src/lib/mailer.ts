/* ============================================================
   Outgoing email: a copy of each contact-form lead
   ------------------------------------------------------------
   Every lead is saved to the database FIRST (src/pages/api/contact.ts);
   this only sends a copy. All settings are in .env (see .env.example):

     SMTP_HOST   empty = email is off: the lead is saved, nothing is
                 sent, and the server log says "email disabled"
     SMTP_PORT   465 (TLS) or 587 (STARTTLS)
     SMTP_USER   the sending mailbox
     SMTP_PASS   its password (for Gmail, an App Password)
     SMTP_FROM   the From address; empty = SMTP_USER
     LEADS_TO    where leads go (default samruddhifire@gmail.com)

   Read at request time, so a change needs a restart, not a rebuild.
   Server-only.
   ============================================================ */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import "dotenv/config";
import { site } from "../data/site";

export function mailConfigured(): boolean {
  return !!(process.env.SMTP_HOST ?? "").trim();
}

export function leadsInbox(): string {
  return (process.env.LEADS_TO ?? "").trim() || site.email;
}

let transport: Transporter | null = null;
let transportKey = "";

function transporter(): Transporter {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const user = (process.env.SMTP_USER ?? "").trim();
  const key = `${host}:${port}:${user}`;
  if (!transport || key !== transportKey) {
    transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass: (process.env.SMTP_PASS || "").replace(/\s+/g, "") } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    transportKey = key;
  }
  return transport;
}

export interface LeadMail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly replyTo?: string;
}

export type SendResult = { outcome: "disabled" } | { outcome: "sent" } | { outcome: "failed"; detail: string };

/** Sends a lead to the inbox. Never throws. */
export async function sendLead(mail: LeadMail): Promise<SendResult> {
  if (!mailConfigured()) return { outcome: "disabled" };
  const from = (process.env.SMTP_FROM ?? "").trim() || (process.env.SMTP_USER ?? "").trim();
  try {
    await transporter().sendMail({
      from: { name: `${site.name} website`, address: from },
      to: leadsInbox(),
      replyTo: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return { outcome: "sent" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Failed to email a lead:", detail);
    return { outcome: "failed", detail: detail.slice(0, 250) };
  }
}
