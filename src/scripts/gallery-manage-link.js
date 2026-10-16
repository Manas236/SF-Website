/* ============================================================
   Edit mode on a page with photographs: a link to the studio gallery
   manager. Loaded only for a signed-in editor (the sf_edit_ui hint
   cookie); shown only while "Edit text" is on (public/editor-ui.css).
   Marked data-nt-ui so the text editor leaves it alone.
   ============================================================ */
const link = document.createElement("a");
link.href = "/studio/gallery";
link.className = "nt-gallery-manage";
link.setAttribute("data-nt-ui", "");
link.textContent = "Manage photos";
document.body.appendChild(link);
