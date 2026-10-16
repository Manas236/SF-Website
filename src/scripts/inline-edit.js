/* ============================================================
   In-page text editing: the editor
   ------------------------------------------------------------
   Part 2 of 2. The early half is the inline head script in
   src/layouts/BaseLayout.astro, which hangs window.__ntEdit: the page
   path, key lookup, text normalisation and the localStorage cache. This
   file calls back into those instead of reimplementing them, so a key
   read on the way in always matches a key read on the way out.

   The rules about WHAT may be edited come from src/lib/editable.ts, the
   same module the API routes import, so the browser never offers an
   edit the server will refuse.

   Shape of the thing:

     · every element carrying a declared `data-edit` key and holding one
       run of text becomes editable; `data-no-edit` opts a block out
     · none of this exists for a visitor. BaseLayout only imports this
       file when the `sf_edit_ui` hint cookie is set, and the check is
       repeated here. It is a hint, not authorisation: the signed token
       cookie the write routes check decides everything.
     · nothing is live until "Edit text" is pressed; with the mode on,
       one click enters an element and no link navigates
     · one element is editable at a time, and only while it has focus
     · saving is optimistic: the text changes, then the POST goes; a
       rejection puts the old text back and says why
     · nothing is ever destroyed: a revert writes a new row
   ============================================================ */
import { MAX_TEXT } from "../lib/editable";

const NT = window.__ntEdit;

/** How long a press has to last to count as deliberate. */
const HOLD_MS = 500;
/** Move further than this and it was a scroll, not a press. */
const MOVE_CANCEL_PX = 10;
/** Versions offered in the per-element menu. */
const MENU_VERSIONS = 5;
const TOAST_MS = 4200;

/** sessionStorage, not localStorage: edit mode survives a navigation
    within the tab but not the tab itself. */
const MODE_KEY = "sf-edit-mode";

/** The sign-in hint BaseLayout gates the import on. */
const UI_COOKIE = "sf_edit_ui";

function hasUiCookie() {
  return document.cookie.split("; ").some((c) => c === `${UI_COOKIE}=1`);
}

const state = {
  /** key -> { text, original, id } for this page. */
  edits: {},
  /** The one element currently open for editing. */
  active: null,
  /** Its text when we entered, for the failure path. */
  before: "",
  menu: null,
  editing: false,
  bar: null,
  toggle: null,
  holdTimer: 0,
  holdFrom: null,
};

/* ============================================================
   Boot
   ============================================================ */
/* A second lock on the door BaseLayout already shut: covers a bundle
   still cached from before signing out, or a hand-typed import. */
if (NT && hasUiCookie()) boot();

async function boot() {
  // NT.applied: the head script has already put the server's answer on
  // the page for every visitor; the editor only needs the same map.
  const data = await NT.applied;

  // Offline, or the database is down: edit against the cached copy.
  state.edits = data && data.edits ? data.edits : NT.readCache();

  markElements();
  installGestures();
  buildToolbar();
}

/* ============================================================
   Deciding what may be edited
   ------------------------------------------------------------
   Declared slots only: a run of text without a `data-edit` key is not
   editable by design. Two guards:

     optOut      the editor's own furniture and anything opted out by
                 hand, so the toolbar cannot be typed into
     isTextLeaf  a key on an element holding anything but one run of
                 text is an authoring error; marking it would delete its
                 children the moment textContent was assigned
   ============================================================ */
function markElements() {
  for (const el of document.body.querySelectorAll("[data-edit]")) {
    if (el.closest(NT.optOut)) continue;
    if (!NT.isTextLeaf(el)) continue;
    if (!NT.textOf(el)) continue;
    el.setAttribute("data-nt-editable", "");
  }
}

function keyOf(el) {
  return el.dataset.ntKey || NT.keyFor(el);
}

/** The text the page shipped with: the anchor every row is filed under. */
function anchorOf(el, fallback) {
  return el.dataset.ntOriginal || fallback;
}

function editableFrom(target) {
  if (!target || !target.closest) return null;
  const el = target.closest("[data-nt-editable]");
  return el && !el.closest("[data-nt-ui]") ? el : null;
}

/* ============================================================
   Gestures
   ------------------------------------------------------------
   Everything here is off until "Edit text" is pressed. With an explicit
   mode, intent is stated once and the gestures stop competing with the
   browser's own (double-click selects, long-press selects, a click on a
   link follows it):

     off   nothing is bound. Reading is reading; links are links.
     on    one click enters an element. A capture-phase handler calls
           preventDefault on that click, so a link does not navigate.
     both  right-click (desktop) or a ~500 ms hold (touch) on an edited
           element opens its version list.

   A click is only intercepted when it lands on something editable, so
   the page still works in edit mode: the phone menu opens, the lightbox
   opens, and the copy itself stops behaving like a control.
   ============================================================ */
function installGestures() {
  document.addEventListener(
    "click",
    (e) => {
      if (!state.editing) return;
      if (e.target.closest && e.target.closest("[data-nt-ui]")) return;

      const el = editableFrom(e.target);
      if (!el) return;

      e.preventDefault();
      e.stopPropagation();
      enter(el);
    },
    true
  );

  /* Touch has no right-click, so it keeps the hold, but only to open
     history, never to enter an element. */
  document.addEventListener(
    "pointerdown",
    (e) => {
      clearHold();
      if (!state.editing || e.button > 0) return;
      const el = editableFrom(e.target);
      if (!el || !el.hasAttribute("data-nt-edited")) return;

      state.holdFrom = { x: e.clientX, y: e.clientY };
      state.holdTimer = window.setTimeout(() => {
        state.holdTimer = 0;
        openVersions(el);
      }, HOLD_MS);
    },
    { passive: true }
  );

  document.addEventListener(
    "pointermove",
    (e) => {
      if (!state.holdTimer || !state.holdFrom) return;
      if (
        Math.abs(e.clientX - state.holdFrom.x) > MOVE_CANCEL_PX ||
        Math.abs(e.clientY - state.holdFrom.y) > MOVE_CANCEL_PX
      ) {
        clearHold(); // that was a scroll
      }
    },
    { passive: true }
  );

  for (const type of ["pointerup", "pointercancel", "wheel", "scroll"]) {
    document.addEventListener(type, clearHold, { passive: true, capture: true });
  }

  document.addEventListener("contextmenu", (e) => {
    if (!state.editing) return; // leave the browser menu alone
    const el = editableFrom(e.target);
    if (!el || !el.hasAttribute("data-nt-edited")) return;
    e.preventDefault();
    openVersions(el);
  });

  document.addEventListener("focusout", (e) => {
    if (state.active && e.target === state.active) exit(true);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.menu) {
      closeMenu();
      return;
    }
    // Escape with nothing open leaves the mode itself.
    if (e.key === "Escape" && !state.active && state.editing) {
      setMode(false);
      return;
    }
    if (!state.active) return;
    if (e.key === "Enter") {
      e.preventDefault(); // one run of text, so Enter means "done"
      exit(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      exit(false);
    }
  });

  // Paste arrives as plain text or not at all.
  document.addEventListener("paste", (e) => {
    const el = state.active;
    if (!el || !(el === e.target || el.contains(e.target))) return;
    e.preventDefault();
    const raw = (e.clipboardData || window.clipboardData).getData("text/plain");
    insertPlain(NT.normalize(raw));
  });

  document.addEventListener("scroll", closeMenu, { passive: true });
}

function clearHold() {
  if (state.holdTimer) clearTimeout(state.holdTimer);
  state.holdTimer = 0;
  state.holdFrom = null;
}

function insertPlain(text) {
  if (!text) return;
  // Deprecated, but still the only insertion on the browser's undo stack.
  if (document.execCommand && document.execCommand("insertText", false, text)) return;

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/* ============================================================
   Entering and leaving an element
   ============================================================ */
function enter(el) {
  if (state.active === el) return;
  exit(true); // only ever one at a time
  closeMenu();

  state.active = el;
  state.before = NT.textOf(el);
  // First edit of an untouched element: what it says now is the anchor.
  if (!el.dataset.ntOriginal) el.dataset.ntOriginal = state.before;

  // plaintext-only also blocks Ctrl+B and rich drops; an engine that
  // does not take it throws rather than falling back.
  try {
    el.contentEditable = "plaintext-only";
  } catch (err) {
    el.contentEditable = "true";
  }
  if (!el.isContentEditable) el.contentEditable = "true";

  el.spellcheck = false;
  el.setAttribute("data-nt-editing", "");
  el.focus({ preventScroll: true });
}

function exit(commit) {
  const el = state.active;
  if (!el) return;

  state.active = null;
  el.contentEditable = "false";
  el.removeAttribute("data-nt-editing");
  if (document.activeElement === el) el.blur();

  const before = state.before;
  const after = NT.normalize(el.textContent);

  // Cancelled, emptied, or untouched: put it back exactly.
  if (!commit || !after || after === before) {
    NT.setText(el, before);
    return;
  }
  saveEdit(el, before, after);
}

/* ============================================================
   Saving: optimistic, then reconciled
   ============================================================ */
function saveEdit(el, before, after) {
  const key = keyOf(el);
  if (!key) return;
  const anchor = anchorOf(el, before);

  // The server's own rule, so an obvious refusal costs no round trip.
  if (after.length > MAX_TEXT) {
    NT.setText(el, before);
    toast(`Keep it under ${MAX_TEXT} characters.`);
    return;
  }

  const previous = state.edits[key];

  NT.setText(el, after);
  el.dataset.ntKey = key;
  el.dataset.ntApplied = after;
  el.setAttribute("data-nt-edited", "");
  state.edits[key] = { text: after, original: anchor, id: previous ? previous.id : 0 };
  NT.writeCache(state.edits);

  send("/api/content", { path: NT.path, key, original: anchor, text: after }).then((res) => {
    if (res.ok) {
      state.edits[key] = { text: res.data.text, original: anchor, id: res.data.id };
      NT.writeCache(state.edits);
      return;
    }
    // Rejected: put the page back exactly as it was and say why.
    NT.setText(el, before);
    el.dataset.ntApplied = before;
    if (previous) {
      state.edits[key] = previous;
    } else {
      delete state.edits[key];
      el.removeAttribute("data-nt-edited");
    }
    NT.writeCache(state.edits);

    /* 401 must not be a passing toast: the next twenty edits would fail
       the same way unnoticed. */
    if (res.status === 401) {
      endSession();
      return;
    }
    toast(res.error);
  });
}

/* ============================================================
   The session ran out
   ------------------------------------------------------------
   Seven days passed, or the passphrase was rotated. Stop looking
   editable: drop the hint cookie, take the furniture off the page, and
   leave a message that stays up. It does not name the sign-in URL.
   ============================================================ */
function endSession() {
  document.cookie = `${UI_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;

  // Let go of the open element WITHOUT committing it: it is the edit
  // that was just refused.
  const el = state.active;
  state.active = null;
  if (el) {
    el.contentEditable = "false";
    el.removeAttribute("data-nt-editing");
    if (document.activeElement === el) el.blur();
  }

  state.editing = false;
  closeMenu();
  clearHold();
  document.documentElement.removeAttribute("data-nt-mode");
  try {
    sessionStorage.removeItem(MODE_KEY);
  } catch (err) {
    /* storage disabled: nothing was remembered */
  }

  if (state.bar) state.bar.remove();
  state.bar = null;
  state.toggle = null;

  for (const marked of document.querySelectorAll("[data-nt-editable]")) {
    marked.removeAttribute("data-nt-editable");
  }

  toast("Your editing session has ended. Sign in again to keep editing.", true);
}

/* ============================================================
   Undo
   ============================================================ */
function undoLast() {
  const keys = Object.keys(state.edits);
  if (!keys.length) {
    toast("Nothing has been changed on this page yet.");
    return;
  }
  // The most recent change on the page is the highest row id.
  let newest = keys[0];
  for (const k of keys) {
    if ((state.edits[k].id || 0) > (state.edits[newest].id || 0)) newest = k;
  }
  revert(newest, null);
}

function revert(key, toId) {
  const el = findByKey(key) || NT.elFor(key);

  send("/api/content/revert", { path: NT.path, key, toId }).then((res) => {
    if (!res.ok) {
      if (res.status === 401) endSession();
      else toast(res.error);
      return;
    }
    const entry = state.edits[key];
    if (el) {
      NT.setText(el, res.data.text);
      el.dataset.ntApplied = res.data.text;
    }
    state.edits[key] = {
      text: res.data.text,
      original: entry ? entry.original : el ? anchorOf(el, res.data.text) : res.data.text,
      id: res.data.id,
    };
    NT.writeCache(state.edits);
    toast("Change undone.");
  });
}

function findByKey(key) {
  return document.querySelector(`[data-nt-key="${CSS.escape(key)}"]`);
}

/* ============================================================
   Version menu
   ============================================================ */
async function openVersions(el) {
  closeMenu();
  const key = keyOf(el);
  if (!key) return;

  const res = await request(
    `/api/content/history?path=${encodeURIComponent(NT.path)}&key=${encodeURIComponent(key)}`
  );
  if (!res.ok) {
    if (res.status === 401) endSession();
    else toast(res.error);
    return;
  }
  const rows = (res.data.history || []).slice(0, MENU_VERSIONS);
  if (!rows.length) {
    toast("This text has not been changed yet.");
    return;
  }

  const menu = document.createElement("div");
  menu.className = "nt-menu";
  menu.setAttribute("data-nt-ui", "");
  menu.setAttribute("role", "menu");

  const head = document.createElement("p");
  head.className = "nt-menu-head";
  head.textContent = "Earlier versions";
  menu.appendChild(head);

  rows.forEach((row, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "nt-menu-item";

    const line = document.createElement("span");
    line.className = "nt-menu-text";
    line.textContent = row.text;
    item.appendChild(line);

    const meta = document.createElement("span");
    meta.className = "nt-menu-meta";
    // The newest row is what the page already says: a label, not an offer.
    meta.textContent = i === 0 ? "on the page now" : whenever(row.created_at);
    item.appendChild(meta);

    if (i === 0) {
      item.disabled = true;
    } else {
      item.addEventListener("click", () => {
        closeMenu();
        revert(key, row.id);
      });
    }
    menu.appendChild(item);
  });

  // The text the page was built with, as the last offer.
  const oldest = res.data.history[res.data.history.length - 1];
  if (oldest && oldest.original && oldest.original !== rows[0].text) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "nt-menu-item";
    const line = document.createElement("span");
    line.className = "nt-menu-text";
    line.textContent = oldest.original;
    const meta = document.createElement("span");
    meta.className = "nt-menu-meta";
    meta.textContent = "as built";
    item.append(line, meta);
    item.addEventListener("click", () => {
      closeMenu();
      restoreBuilt(el, key, oldest.original);
    });
    menu.appendChild(item);
  }

  document.body.appendChild(menu);
  positionMenu(menu, el);
  state.menu = menu;

  setTimeout(() => {
    document.addEventListener("pointerdown", onOutside, true);
  }, 0);
}

/* Putting the built text back is an edit like any other: a new row. */
function restoreBuilt(el, key, text) {
  const before = NT.textOf(el);
  if (before === text) return;
  saveEdit(el, before, text);
}

function onOutside(e) {
  if (state.menu && !state.menu.contains(e.target)) closeMenu();
}

function closeMenu() {
  if (!state.menu) return;
  document.removeEventListener("pointerdown", onOutside, true);
  state.menu.remove();
  state.menu = null;
}

function positionMenu(menu, el) {
  const r = el.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  const pad = 8;

  let left = r.left + window.scrollX;
  let top = r.bottom + window.scrollY + 6;

  left = Math.min(left, window.scrollX + window.innerWidth - w - pad);
  left = Math.max(left, window.scrollX + pad);
  // Flip above if it would hang off the bottom.
  if (r.bottom + h + 6 > window.innerHeight) {
    top = Math.max(window.scrollY + pad, r.top + window.scrollY - h - 6);
  }
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function whenever(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/* ============================================================
   Toolbar and toast (appended to <body>, never inserted)
   ============================================================ */
function buildToolbar() {
  const bar = document.createElement("div");
  bar.className = "nt-bar";
  bar.setAttribute("data-nt-ui", "");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "nt-pill nt-pill-mode";
  toggle.addEventListener("click", () => setMode(!state.editing));

  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "nt-pill";
  undo.textContent = "Undo last change";
  undo.addEventListener("click", undoLast);

  bar.appendChild(toggle);
  bar.appendChild(undo);
  document.body.appendChild(bar);

  state.bar = bar;
  state.toggle = toggle;
  // Restore the mode this tab was left in, so it survives a navigation.
  setMode(readMode(), true);
}

function readMode() {
  try {
    return sessionStorage.getItem(MODE_KEY) === "1";
  } catch (err) {
    return false;
  }
}

/** Turn editing on or off. `quiet` skips the toast on restore. */
function setMode(on, quiet) {
  state.editing = !!on;

  if (!state.editing) {
    exit(true); // commit whatever was open, then let go of the page
    closeMenu();
    clearHold();
  }

  document.documentElement.toggleAttribute("data-nt-mode", state.editing);
  if (state.toggle) {
    state.toggle.textContent = state.editing ? "Done editing" : "Edit text";
    state.toggle.setAttribute("aria-pressed", String(state.editing));
  }

  try {
    if (state.editing) sessionStorage.setItem(MODE_KEY, "1");
    else sessionStorage.removeItem(MODE_KEY);
  } catch (err) {
    /* storage disabled: the mode will not survive the next page */
  }

  if (quiet) return;
  toast(state.editing ? "Editing on. Click any text to change it." : "Editing off.");
}

let toastTimer = 0;
/** `stay` holds it on screen: for "nothing more will work". */
function toast(message, stay) {
  if (!message) return;
  let node = document.querySelector(".nt-toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "nt-toast";
    node.setAttribute("data-nt-ui", "");
    node.setAttribute("role", "status");
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add("is-up");

  clearTimeout(toastTimer);
  if (stay) return;
  toastTimer = window.setTimeout(() => node.classList.remove("is-up"), TOAST_MS);
}

/* ============================================================
   Transport
   ============================================================ */
async function send(url, body) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      // Survives a navigation started by the click that saved.
      keepalive: true,
    });
    const data = await res.json().catch(() => ({}));
    // 401 is carried out: it ends the session rather than reporting.
    if (!res.ok) return { ok: false, status: res.status, error: data.error || "Could not save." };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, status: 0, error: "No connection. The change was not saved." };
  }
}

async function request(url) {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data.error || "Could not load." };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, status: 0, error: "No connection." };
  }
}
