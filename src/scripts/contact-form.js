/* ============================================================
   The enquiry form: the visitor's half
   ------------------------------------------------------------
   Checks the fields with the same rules the server uses
   (src/lib/leads.ts), posts JSON to /api/contact, and on success swaps
   the form for the thank-you panel. `elapsed` is how long the form had
   been on screen (under two seconds is treated as a script); `website`
   is the honeypot. Without this script the form still posts, as a
   plain form (see src/components/ContactForm.astro).
   ============================================================ */
import { validateLead } from "../lib/leads";
import { formErrors } from "../data/contact-page";

const form = document.querySelector("[data-contact-form]");
const done = document.querySelector("[data-contact-done]");
const shownAt = Date.now();

if (form && done) {
  const error = form.querySelector("[data-contact-error]");
  const button = form.querySelector("button[type=submit]");
  const label = button.querySelector("[data-edit]") || button;

  const fail = (message, fieldName) => {
    error.textContent = message;
    error.hidden = false;
    const field = fieldName && form.elements[fieldName];
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.focus();
    }
  };

  form.addEventListener("input", (e) => e.target.removeAttribute?.("aria-invalid"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.hidden = true;
    const f = form.elements;
    const values = {
      name: f.name.value,
      phone: f.phone.value,
      email: f.email.value,
      service: f.service.value,
      message: f.message.value,
    };
    const check = validateLead(values);
    if (!check.ok) return fail(check.error, check.field);

    const idle = label.textContent;
    button.disabled = true;
    label.textContent = form.dataset.sending || idle;
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, website: f.website.value, elapsed: Date.now() - shownAt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        fail(data.error || formErrors.server, data.field);
        return;
      }
      form.hidden = true;
      done.hidden = false;
      done.focus();
    } catch {
      fail(formErrors.network);
    } finally {
      button.disabled = false;
      label.textContent = idle;
    }
  });
}
