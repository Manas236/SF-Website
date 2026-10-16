/* ============================================================
   Placeholders: content the client still has to supply or confirm
   ------------------------------------------------------------
   ONE format, everywhere:

       [Client to supply: <what is needed>]

   written through ph() below, in a copy module, on an editable slot. It
   renders as ordinary text on a striped, dashed-outline background
   (global.css, [data-placeholder]) so nobody mistakes it for finished
   copy. The client replaces it the same way they change any other
   text: sign in, "Edit text", click it, type, Enter. The edit is saved
   in content_edits and the marker disappears.

   `npm run check:placeholders` counts them in the copy modules and,
   when the database is reachable, says which ones the client has
   already replaced on the site.
   ============================================================ */

export const PLACEHOLDER_PREFIX = "[Client to supply: ";

export function ph(what: string): string {
  return `${PLACEHOLDER_PREFIX}${what}]`;
}

export function isPlaceholder(text: unknown): boolean {
  return typeof text === "string" && text.startsWith(PLACEHOLDER_PREFIX) && text.endsWith("]");
}
