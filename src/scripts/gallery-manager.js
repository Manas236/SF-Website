/* ============================================================
   The studio gallery manager: browser half
   ------------------------------------------------------------
   Draws every service group and every page image slot from
   GET /api/gallery and sends each change to POST /api/gallery, which
   answers with the fresh state; the page repaints from that answer,
   never from its own guess. See src/pages/studio/gallery.astro and
   src/lib/gallery-live.ts.

   Positions: the server orders a group by its FULL list, hidden photos
   included, so every "put it here" is turned into an index in that
   full list before it is sent.
   ============================================================ */
import { isUpload, photoSources } from "../lib/gallery-images";

const $ = (id) => document.getElementById(id);

const groupsEl = $("gm-groups");
const slotsEl = $("gm-slots");
const statsEl = $("gm-stats");
const jumpEl = $("gm-jump");
const bannerEl = $("gm-banner");
const toastEl = $("gm-toast");
const historyEl = $("gm-history");
const historyList = $("gm-history-list");

const openHidden = new Set();
let data = null;
let busy = false;
let dragging = null;

/* ---------------- transport ---------------- */
async function call(method, body) {
  try {
    const res = await fetch("/api/gallery", {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) {
      showBanner("Your editing session has ended. Sign in again through the studio link, then reload this page.");
      return null;
    }
    if (!res.ok) {
      toast(json.error || "Something went wrong. Nothing was changed.");
      return null;
    }
    return json;
  } catch {
    toast("No connection. Nothing was changed.");
    return null;
  }
}

async function change(body, done) {
  if (busy) return;
  busy = true;
  document.body.classList.add("gm-busy");
  const next = await call("POST", body);
  busy = false;
  document.body.classList.remove("gm-busy");
  if (!next) return;
  data = next;
  render();
  const latest = data.history.find((h) => !h.undone);
  toast(done || "Saved. It is live on the site now.", body.action !== "undo" && latest ? latest.id : null);
}

/* ---------------- helpers ---------------- */
/** Index in `group`'s full list, with `file` taken out, where it lands
    if put directly after `afterFile`. */
function positionAfter(group, file, afterFile) {
  const list = group.photos.map((p) => p.file).filter((f) => f !== file);
  return afterFile ? list.indexOf(afterFile) + 1 : 0;
}

function positionBefore(group, file, beforeFile) {
  const list = group.photos.map((p) => p.file).filter((f) => f !== file);
  const i = list.indexOf(beforeFile);
  return i < 0 ? list.length : i;
}

function media(file) {
  const s = photoSources(file);
  return { thumb: s.tile, large: s.full };
}

function findPhoto(file) {
  for (const g of data ? data.groups : []) {
    const p = g.photos.find((x) => x.file === file);
    if (p) return { ...p, group: g };
  }
  return null;
}

function orientation(photo) {
  if (!isUpload(photo.file)) return "";
  if (!photo.w || !photo.h) return "";
  return photo.w > photo.h ? "Landscape" : photo.w === photo.h ? "Square" : "Portrait";
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

function anchorOf(id) {
  return "g-" + id;
}

/* ---------------- render ---------------- */
function render() {
  const visible = data.groups.reduce((n, g) => n + g.photos.filter((p) => !p.hidden).length, 0);
  const hidden = data.groups.reduce((n, g) => n + g.photos.filter((p) => p.hidden).length, 0);
  statsEl.replaceChildren(stat(visible, "on the site"), stat(hidden, "hidden"));

  jumpEl.replaceChildren(
    el("option", { value: "", text: "Choose a section" }),
    el("option", { value: "gm-slots-title", text: "Site images" }),
    ...data.groups.map((g) => el("option", { value: anchorOf(g.id), text: g.label }))
  );

  renderSlots();
  groupsEl.replaceChildren(...data.groups.map(renderGroup));
  renderHistory();
}

function stat(n, label) {
  return el("span", { class: "gm-stat" }, [el("strong", { text: String(n) }), " " + label]);
}

/* ---------------- site images (slots) ---------------- */
function renderSlots() {
  slotsEl.replaceChildren(
    ...data.slots.map((slot) => {
      const photo = findPhoto(slot.file);
      const t = media(slot.file);
      const changed = slot.file !== slot.baseFile;
      return el("article", { class: "gm-slot" }, [
        el(
          "button",
          { type: "button", class: "gm-thumb", "aria-label": `Enlarge the photo used for ${slot.label}`, onclick: () => photo && preview(photo) },
          [el("img", { src: t.thumb, alt: photo ? photo.caption : "", loading: "lazy" })]
        ),
        el("div", { class: "gm-meta" }, [
          el("p", { class: "gm-slot-label", text: slot.label }),
          el("p", { class: "gm-file" }, [`On ${slot.page}`, photo && photo.hidden ? el("span", { class: "gm-tag", text: "Hidden from the gallery" }) : null]),
          photo ? el("p", { class: "gm-cap gm-cap-static", text: photo.caption }) : null,
          el("div", { class: "gm-ctrls" }, [
            el("button", { type: "button", class: "gm-btn gm-btn-primary", text: "Change photo", onclick: () => openPicker(slot) }),
            changed
              ? el("button", {
                  type: "button",
                  class: "gm-btn gm-btn-quiet",
                  text: "Use the original",
                  onclick: () => change({ action: "slot", slot: slot.key, file: slot.baseFile }, "Original photo back in place."),
                })
              : null,
          ]),
        ]),
      ]);
    })
  );
}

const pickDialog = $("gm-pick");
function openPicker(slot) {
  $("gm-pick-for").textContent = `For: ${slot.label}. Click a photo to use it.`;
  const grid = $("gm-pick-grid");
  grid.replaceChildren(
    ...data.groups.flatMap((g) => [
      el("h3", { class: "gm-pick-head", text: g.label }),
      ...g.photos.map((p) =>
        el(
          "button",
          {
            type: "button",
            class: "gm-pick-item" + (p.file === slot.file ? " is-current" : ""),
            "aria-label": `Use: ${p.caption}`,
            onclick: () => {
              pickDialog.close();
              if (p.file === slot.file) return;
              change({ action: "slot", slot: slot.key, file: p.file }, `Photo changed for ${slot.label}. It is live on the site now.`);
            },
          },
          [el("img", { src: media(p.file).thumb, alt: "", loading: "lazy" }), el("span", { text: p.caption })]
        )
      ),
    ])
  );
  if (typeof pickDialog.showModal === "function") pickDialog.showModal();
}
$("gm-pick-close").addEventListener("click", () => pickDialog.close());

/* ---------------- groups ---------------- */
function renderGroup(group) {
  const visible = group.photos.filter((p) => !p.hidden);
  const hidden = group.photos.filter((p) => p.hidden);

  const grid = el("div", { class: "gm-grid" });
  visible.forEach((p, i) => grid.append(tile(group, p, visible, i)));
  grid.append(endZone(group));

  const box = el("section", { class: "gm-group", id: anchorOf(group.id) }, [
    el("header", { class: "gm-group-head" }, [
      el("h3", { text: group.label }),
      el("span", {
        class: "gm-count",
        text: `${visible.length} on the site${hidden.length ? `, ${hidden.length} hidden` : ""}`,
      }),
      el("button", {
        type: "button",
        class: "gm-btn gm-btn-quiet gm-upload-here",
        text: "Upload here",
        onclick: () => openUpload(group.id),
      }),
    ]),
    visible.length ? grid : el("p", { class: "gm-empty", text: "No photos on the site for this service." }),
  ]);
  if (!visible.length) box.append(grid);

  if (hidden.length) {
    const details = el("details", { class: "gm-hidden" }, [
      el("summary", { text: `Hidden (${hidden.length})` }),
      el("p", {
        class: "gm-note",
        text: "Not on the site. “Show on site” puts a photo back where it was; “Move to” sends it to another service.",
      }),
      el("div", { class: "gm-grid" }, hidden.map((p) => tile(group, p, null, -1))),
    ]);
    details.open = openHidden.has(group.id);
    details.addEventListener("toggle", () => {
      if (details.open) openHidden.add(group.id);
      else openHidden.delete(group.id);
    });
    box.append(details);
  }
  return box;
}

function tile(group, photo, visible, i) {
  const t = media(photo.file);
  const card = el("article", {
    class: "gm-tile" + (photo.hidden ? " is-hidden" : ""),
    "data-file": photo.file,
    draggable: photo.hidden ? null : "true",
  });

  const thumb = el(
    "button",
    { type: "button", class: "gm-thumb", "aria-label": `Enlarge ${photo.file}`, onclick: () => preview(photo) },
    [el("img", { src: t.thumb || "", alt: photo.caption, loading: "lazy" })]
  );

  const usedIn = data.slots.filter((s) => s.file === photo.file).map((s) => s.label);
  const fileLine = el("p", { class: "gm-file" }, [
    photo.file,
    el("span", { text: orientation(photo) ? `, ${orientation(photo)}` : "" }),
    photo.upload ? el("span", { class: "gm-tag", text: "Uploaded" }) : el("span", { class: "gm-tag", text: "Stock" }),
    usedIn.length ? el("span", { class: "gm-tag gm-tag-slot", text: `Also on: ${usedIn.join(", ")}` }) : null,
  ]);

  const controls = el("div", { class: "gm-ctrls" });
  if (!photo.hidden) {
    const prev = visible[i - 1];
    const next = visible[i + 1];
    controls.append(
      el("button", {
        type: "button",
        class: "gm-icon",
        title: "Move earlier",
        "aria-label": `Move ${photo.file} earlier`,
        disabled: !prev,
        text: "←",
        onclick: () => change({ action: "move", file: photo.file, group: group.id, position: positionBefore(group, photo.file, prev.file) }),
      }),
      el("button", {
        type: "button",
        class: "gm-icon",
        title: "Move later",
        "aria-label": `Move ${photo.file} later`,
        disabled: !next,
        text: "→",
        onclick: () => change({ action: "move", file: photo.file, group: group.id, position: positionAfter(group, photo.file, next.file) }),
      })
    );
  }
  controls.append(moveSelect(group, photo));
  controls.append(photo.hidden ? showButton(photo) : hideButton(photo));

  card.append(thumb, el("div", { class: "gm-meta" }, [captionBlock(photo), fileLine, controls]));

  if (!photo.hidden) {
    card.addEventListener("dragstart", (e) => {
      dragging = photo.file;
      card.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", photo.file);
    });
    card.addEventListener("dragend", () => {
      dragging = null;
      card.classList.remove("is-dragging");
      document.querySelectorAll(".is-over-before, .is-over-after").forEach((n) => n.classList.remove("is-over-before", "is-over-after"));
    });
    card.addEventListener("dragover", (e) => {
      if (!dragging || dragging === photo.file) return;
      e.preventDefault();
      const after = isAfter(card, e);
      card.classList.toggle("is-over-after", after);
      card.classList.toggle("is-over-before", !after);
    });
    card.addEventListener("dragleave", () => card.classList.remove("is-over-before", "is-over-after"));
    card.addEventListener("drop", (e) => {
      if (!dragging || dragging === photo.file) return;
      e.preventDefault();
      const file = dragging;
      const position = isAfter(card, e) ? positionAfter(group, file, photo.file) : positionBefore(group, file, photo.file);
      change({ action: "move", file, group: group.id, position });
    });
  }
  return card;
}

function isAfter(card, e) {
  const r = card.getBoundingClientRect();
  return e.clientX > r.left + r.width / 2;
}

/** The dashed box at the end of a group: drop here to put a photo last,
    including one dragged in from another service. */
function endZone(group) {
  const zone = el("div", { class: "gm-end", text: "Drop here to put it last" });
  zone.addEventListener("dragover", (e) => {
    if (!dragging) return;
    e.preventDefault();
    zone.classList.add("is-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
  zone.addEventListener("drop", (e) => {
    if (!dragging) return;
    e.preventDefault();
    zone.classList.remove("is-over");
    change({ action: "move", file: dragging, group: group.id });
  });
  return zone;
}

function captionBlock(photo) {
  const wrap = el("div", { class: "gm-cap-wrap" });
  const show = () => {
    const text = el("p", { class: "gm-cap", tabindex: "0", role: "button", title: "Click to edit the caption", text: photo.caption });
    const open = () => edit();
    text.addEventListener("click", open);
    text.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    wrap.replaceChildren(text);
    if (photo.caption !== photo.baseCaption) {
      wrap.append(
        el("button", {
          type: "button",
          class: "gm-link",
          text: "Restore original caption",
          title: photo.baseCaption,
          onclick: () => change({ action: "caption", file: photo.file, caption: photo.baseCaption }, "Original caption restored."),
        })
      );
    }
  };
  const edit = () => {
    const area = el("textarea", { class: "gm-cap-input", maxlength: "200", rows: "3", "aria-label": `Caption for ${photo.file}` });
    area.value = photo.caption;
    const save = () => {
      const value = area.value.replace(/\s+/g, " ").trim();
      if (!value) return toast("A caption cannot be empty.");
      if (value === photo.caption) return show();
      change({ action: "caption", file: photo.file, caption: value }, "Caption saved. It is live on the site now.");
    };
    area.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") show();
    });
    wrap.replaceChildren(
      area,
      el("div", { class: "gm-cap-actions" }, [
        el("button", { type: "button", class: "gm-btn gm-btn-primary", text: "Save caption", onclick: save }),
        el("button", { type: "button", class: "gm-btn", text: "Cancel", onclick: show }),
      ])
    );
    area.focus();
    area.select();
  };
  show();
  return wrap;
}

function moveSelect(group, photo) {
  const select = el("select", { class: "gm-move", "aria-label": `Move ${photo.file} to another service` });
  select.append(el("option", { value: "", text: "Move to..." }));
  for (const g of data.groups) {
    if (g.id !== group.id) select.append(el("option", { value: g.id, text: g.label }));
  }
  select.addEventListener("change", () => {
    const target = select.value;
    if (!target) return;
    const label = data.groups.find((g) => g.id === target)?.label || target;
    change({ action: "move", file: photo.file, group: target }, `Moved to ${label}. It is live on the site now.`);
  });
  return select;
}

/* Hiding asks twice: a photo vanishing from the site on one stray click
   is the mistake to stop. */
function hideButton(photo) {
  const button = el("button", { type: "button", class: "gm-btn gm-btn-quiet", text: "Hide" });
  let armed = false;
  let timer = 0;
  button.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      button.textContent = "Click again to hide";
      button.classList.add("is-armed");
      timer = window.setTimeout(() => {
        armed = false;
        button.textContent = "Hide";
        button.classList.remove("is-armed");
      }, 4000);
      return;
    }
    clearTimeout(timer);
    change({ action: "hide", file: photo.file }, "Hidden. It is off the site now.");
  });
  return button;
}

function showButton(photo) {
  return el("button", {
    type: "button",
    class: "gm-btn gm-btn-primary",
    text: "Show on site",
    onclick: () => change({ action: "show", file: photo.file }, "Back on the site."),
  });
}

/* ---------------- history ---------------- */
function describe(h) {
  switch (h.action) {
    case "hide":
      return `Hid ${h.file}`;
    case "show":
      return `Put ${h.file} back on the site`;
    case "move":
      return h.position == null ? `Moved ${h.file} to ${h.group}` : `Moved ${h.file} to ${h.group}, position ${h.position + 1}`;
    case "caption":
      return `Changed the caption of ${h.file} to “${h.caption}”`;
    case "add":
      return `Uploaded a photo to ${h.group}: “${h.caption}”`;
    case "slot":
      return `Used ${h.file} for ${h.group}`;
    default:
      return `${h.action} ${h.file || ""}`;
  }
}

function when(at) {
  const d = new Date(at && at.includes("T") ? at : String(at).replace(" ", "T") + "Z");
  return isNaN(d) ? "" : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function renderHistory() {
  if (!data.history.length) {
    historyList.replaceChildren(el("li", { class: "gm-note", text: "No changes yet." }));
    return;
  }
  historyList.replaceChildren(
    ...data.history.map((h) =>
      el("li", { class: h.undone ? "is-undone" : "" }, [
        el("img", { src: h.file ? media(h.file).thumb : "", alt: "", loading: "lazy" }),
        el("div", {}, [el("p", { text: describe(h) }), el("span", { class: "gm-note", text: `${when(h.at)}${h.undone ? ", undone" : ""}` })]),
        h.undone
          ? h.undoneBy
            ? el("button", { type: "button", class: "gm-btn", text: "Redo", onclick: () => change({ action: "undo", ref: h.undoneBy }, "Redone.") })
            : null
          : el("button", { type: "button", class: "gm-btn", text: "Undo", onclick: () => change({ action: "undo", ref: h.id }, "Undone.") }),
      ])
    )
  );
}

$("gm-history-open").addEventListener("click", () => {
  historyEl.hidden = false;
  $("gm-history-close").focus();
});
$("gm-history-close").addEventListener("click", () => {
  historyEl.hidden = true;
  $("gm-history-open").focus();
});

/* ---------------- preview, jump, banner, toast ---------------- */
function preview(photo) {
  const dialog = $("gm-preview");
  const t = media(photo.file);
  $("gm-preview-img").src = t.large || t.thumb || "";
  $("gm-preview-img").alt = photo.caption;
  $("gm-preview-cap").textContent = `${photo.caption} (${photo.file})`;
  if (typeof dialog.showModal === "function") dialog.showModal();
}

jumpEl.addEventListener("change", () => {
  const target = jumpEl.value && document.getElementById(jumpEl.value);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  jumpEl.value = "";
});

function showBanner(message) {
  bannerEl.textContent = message;
  bannerEl.hidden = false;
}

let toastTimer = 0;
function toast(message, undoId) {
  toastEl.replaceChildren(el("span", { text: message }));
  if (undoId) {
    toastEl.append(el("button", { type: "button", class: "gm-link", text: "Undo", onclick: () => change({ action: "undo", ref: undoId }, "Undone.") }));
  }
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), 6000);
}

/* ============================================================
   Uploads
   ------------------------------------------------------------
   Photos queue up in the dialog, each with its own REQUIRED caption,
   and go to POST /api/gallery/upload ONE AT A TIME, so each shows its
   own progress and a bad one fails alone. A 409 means the server thinks
   it is a near-copy of a photo the site already has: the queue shows
   both and the editor decides.
   ============================================================ */
const MAX_BYTES = 25 * 1024 * 1024;
const MIN_LONG_EDGE = 1000;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

const uploadDialog = $("gm-upload");
const queueEl = $("gm-queue");
const groupSelect = $("gm-upload-group");
const goButton = $("gm-upload-go");
const summaryEl = $("gm-upload-summary");
let queue = [];
let uploading = false;
let nextId = 1;

function openUpload(groupId) {
  groupSelect.replaceChildren(
    el("option", { value: "", text: "Choose a service" }),
    ...data.groups.map((g) => el("option", { value: g.id, text: g.label }))
  );
  if (groupId) groupSelect.value = groupId;
  renderQueue();
  if (typeof uploadDialog.showModal === "function") uploadDialog.showModal();
}

$("gm-upload-open").addEventListener("click", () => openUpload(""));
$("gm-upload-close").addEventListener("click", () => {
  if (uploading) return toast("Wait for the current upload to finish.");
  uploadDialog.close();
});
uploadDialog.addEventListener("cancel", (e) => {
  if (uploading) e.preventDefault();
});
groupSelect.addEventListener("change", renderQueue);
$("gm-upload-input").addEventListener("change", (e) => {
  addFiles(e.target.files);
  e.target.value = "";
});

const drop = $("gm-drop");
drop.addEventListener("dragover", (e) => {
  if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
  e.preventDefault();
  drop.classList.add("is-over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("is-over");
  addFiles(e.dataTransfer.files);
});

function addFiles(list) {
  for (const file of list) {
    const item = { id: nextId++, file, caption: "", status: "ready", error: "", progress: 0, url: URL.createObjectURL(file) };
    if (!ACCEPT.includes(file.type)) {
      item.status = "error";
      item.error = "Not a JPG, PNG or WebP photo. Export it as a JPG and add it again.";
    } else if (file.size > MAX_BYTES) {
      item.status = "error";
      item.error = `Over 25 MB (${(file.size / 1048576).toFixed(1)} MB). Export a smaller copy.`;
    } else {
      // Size check in the browser so a too-small photo is flagged before
      // it is sent. The server checks again.
      const img = new Image();
      img.onload = () => {
        item.w = img.naturalWidth;
        item.h = img.naturalHeight;
        if (Math.max(item.w, item.h) < MIN_LONG_EDGE && item.status === "ready") {
          item.status = "error";
          item.error = `Too small (${item.w} x ${item.h}). It needs at least ${MIN_LONG_EDGE} px on the long side.`;
        }
        renderQueue();
      };
      img.src = item.url;
    }
    queue.push(item);
  }
  renderQueue();
}

function sizeText(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function removeItem(item) {
  URL.revokeObjectURL(item.url);
  queue = queue.filter((q) => q !== item);
  renderQueue();
}

function pending() {
  return queue.filter((q) => q.status === "ready" || q.status === "duplicate-ok");
}

function updateGo() {
  const todo = pending();
  const missing = todo.filter((q) => !q.caption.trim()).length;
  const done = queue.filter((q) => q.status === "done").length;
  const parts = [];
  if (!groupSelect.value) parts.push("Choose a service.");
  if (missing) parts.push(`${missing} photo${missing > 1 ? "s need" : " needs"} a caption.`);
  if (done) parts.push(`${done} uploaded.`);
  summaryEl.textContent = parts.join(" ");
  goButton.textContent = todo.length > 1 ? `Upload ${todo.length} photos` : "Upload";
  goButton.disabled = uploading || !groupSelect.value || !todo.length || missing > 0;
}

function renderQueue() {
  queueEl.replaceChildren(...queue.map(queueRow));
  updateGo();
}

function queueRow(item) {
  const statusText =
    {
      ready: "",
      "duplicate-ok": "Will upload even though it looks like a photo the site already has.",
      uploading: `Uploading... ${item.progress}%`,
      processing: "Saving...",
      done: "Uploaded. It is live on the site now.",
      skipped: "Skipped.",
      error: item.error,
    }[item.status] || item.error;

  const row = el("li", { class: `gm-q is-${item.status}` });
  const body = el("div", { class: "gm-q-body" });
  body.append(el("p", { class: "gm-file" }, [item.file.name, el("span", { text: `, ${sizeText(item.file.size)}${item.w ? `, ${item.w} x ${item.h}` : ""}` })]));

  if (item.status === "ready" || item.status === "duplicate-ok" || item.status === "duplicate") {
    const area = el("textarea", {
      class: "gm-cap-input",
      rows: "2",
      maxlength: "200",
      placeholder: "Caption (required), e.g. Sprinkler line installed in a basement car park",
      "aria-label": `Caption for ${item.file.name}`,
    });
    area.value = item.caption;
    area.addEventListener("input", () => {
      item.caption = area.value;
      updateGo();
    });
    body.append(area);
  } else if (item.caption) {
    body.append(el("p", { class: "gm-cap", text: item.caption }));
  }

  if (item.status === "duplicate" && item.duplicate) {
    const d = item.duplicate;
    const where = d.group ? `${d.hidden ? "hidden in" : "on the site in"} ${d.group}` : "already on the site";
    body.append(
      el("div", { class: "gm-dup" }, [
        el("img", { src: media(d.file).thumb || "", alt: "" }),
        el("div", {}, [
          el("p", { text: `${d.exact ? "This is the same photo as" : "This looks like"} ${d.file}, ${where}.` }),
          d.caption ? el("p", { class: "gm-note", text: `“${d.caption}”` }) : null,
          el("div", { class: "gm-cap-actions" }, [
            el("button", {
              type: "button",
              class: "gm-btn gm-btn-primary",
              text: "Upload anyway",
              onclick: () => {
                item.status = "duplicate-ok";
                item.force = true;
                renderQueue();
              },
            }),
            el("button", {
              type: "button",
              class: "gm-btn",
              text: "Skip this one",
              onclick: () => {
                item.status = "skipped";
                renderQueue();
              },
            }),
          ]),
        ]),
      ])
    );
  } else if (statusText) {
    body.append(el("p", { class: "gm-q-status", text: statusText }));
  }

  if (item.status === "uploading") {
    body.append(el("div", { class: "gm-bar" }, [el("span", { style: `width:${item.progress}%` })]));
  }

  const canRemove = !["uploading", "processing", "done"].includes(item.status);
  row.append(
    el("img", { src: item.url, alt: "" }),
    body,
    canRemove
      ? el("button", { type: "button", class: "gm-icon", title: "Remove from the list", "aria-label": `Remove ${item.file.name}`, text: "×", onclick: () => removeItem(item) })
      : el("span")
  );
  return row;
}

/* XMLHttpRequest rather than fetch: it reports upload progress, which
   matters for a 10 MB photo on a phone connection. */
function send(item, groupId) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/gallery/upload");
    xhr.withCredentials = true;
    // The body is the file itself; the rest goes in headers (see the
    // note at the top of src/pages/api/gallery/upload.ts).
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Gallery-Group", encodeURIComponent(groupId));
    xhr.setRequestHeader("X-Gallery-Caption", encodeURIComponent(item.caption.trim()));
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(item.file.name));
    if (item.force) xhr.setRequestHeader("X-Gallery-Force", "1");
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      item.progress = Math.round((e.loaded / e.total) * 100);
      if (item.progress >= 100) item.status = "processing";
      renderQueue();
    };
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ status: 0, body: { error: "No connection. This photo was not uploaded." } });
    xhr.send(item.file);
  });
}

goButton.addEventListener("click", async () => {
  const groupId = groupSelect.value;
  if (!groupId || uploading) return;
  uploading = true;
  for (const item of pending()) {
    if (!item.caption.trim()) continue;
    item.status = "uploading";
    item.progress = 0;
    renderQueue();
    const { status, body } = await send(item, groupId);
    if (status === 200) {
      item.status = "done";
      data = body;
      render();
    } else if (status === 409 && body.duplicate) {
      item.status = "duplicate";
      item.duplicate = body.duplicate;
    } else if (status === 401) {
      item.status = "error";
      item.error = "Your editing session has ended. Sign in again, then reopen this page.";
      showBanner(item.error);
      break;
    } else {
      item.status = "error";
      item.error = body.error || "Could not upload this photo.";
    }
    renderQueue();
  }
  uploading = false;
  renderQueue();
  const done = queue.filter((q) => q.status === "done").length;
  const label = data.groups.find((g) => g.id === groupId)?.label || groupId;
  if (done) toast(`${done} photo${done > 1 ? "s" : ""} uploaded to ${label}. Live on the site now.`);
});

/* ---------------- start ---------------- */
(async () => {
  const first = await call("GET");
  if (!first) {
    groupsEl.replaceChildren(el("p", { class: "gm-empty", text: "The gallery could not be loaded. Reload the page to try again." }));
    return;
  }
  data = first;
  render();
})();
