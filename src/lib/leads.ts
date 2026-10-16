/* ============================================================
   Contact-form enquiries ("leads"): validation
   ------------------------------------------------------------
   Imported by the API route (server) and by the form script (browser),
   so both apply the same rules and show the same messages. Keep it free
   of server-only imports.
   ============================================================ */
import { cleanText } from "./editable";
import { formErrors } from "../data/contact-page";
import { services } from "../data/site";

export const OTHER_SERVICE = "Something else";

/** The dropdown's values, in order: the six services, then "other". */
export const SERVICE_OPTIONS: readonly string[] = [...services.map((s) => s.name), OTHER_SERVICE];

export const MAX_MESSAGE = 2000;

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface LeadInput {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  service?: unknown;
  message?: unknown;
}

export type LeadCheck =
  | { ok: true; name: string; phone: string; email: string | null; service: string; message: string }
  | { ok: false; field: keyof LeadInput; error: string };

/** A message keeps its line breaks; everything else is one line. */
function cleanMessage(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => cleanText(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function validateLead(input: LeadInput): LeadCheck {
  const name = cleanText(input.name).slice(0, 200);
  if (name.length < 2 || name.length > 120) return { ok: false, field: "name", error: formErrors.name };

  const phone = cleanText(input.phone);
  const digits = phone.replace(/\D/g, "");
  if (!/^[+\d\s().-]+$/.test(phone) || digits.length < 10 || digits.length > 15)
    return { ok: false, field: "phone", error: formErrors.phone };

  const emailRaw = cleanText(input.email);
  if (emailRaw && (!RE_EMAIL.test(emailRaw) || emailRaw.length > 254))
    return { ok: false, field: "email", error: formErrors.email };

  const service = cleanText(input.service);
  if (!SERVICE_OPTIONS.includes(service)) return { ok: false, field: "service", error: formErrors.service };

  const message = cleanMessage(input.message);
  if (message.length < 5) return { ok: false, field: "message", error: formErrors.message };
  if (message.length > MAX_MESSAGE) return { ok: false, field: "message", error: formErrors.tooLong };

  return { ok: true, name, phone, email: emailRaw || null, service, message };
}

/** A service id from /services ("?service=fire-amc") to its dropdown value. */
export function serviceFromId(id: string | null): string {
  if (!id) return "";
  return services.find((s) => s.id === id)?.name ?? "";
}
