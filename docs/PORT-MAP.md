# Port map

Written before anything was copied. It records what the source project (the
previous contractor website this codebase was ported from, read-only, never
modified) contains, what came across into the Samruddhi Fire site, what was
left behind, and every dependency that had to be cut on the way.

The source project is referred to here only as "the source". Its name, its
people, its clients, its places and its data are deliberately absent from this
repository (see "Strip" at the end).

## Stack

| Piece | Source | SF |
| --- | --- | --- |
| Framework | Astro 7, `output: "server"`, `compressHTML: false` | same |
| Adapter | `@astrojs/node`, standalone | same |
| CSS | Tailwind v4 through `@tailwindcss/vite` | same |
| Database | `mysql2/promise` pool, `dotenv` | same |
| Images | `sharp` (uploads, dHash, share card) | same |
| Mail | `nodemailer` (careers form only) | kept, now for contact-form leads |
| Checks | `playwright` (dev) | same |
| Fonts | two `@fontsource-variable` families | dropped; `@fontsource/poppins` instead |
| Sitemap | a hand-written `/sitemap.xml` endpoint, no integration | `@astrojs/sitemap`, as the SF brief asks (every SF route is a fixed path, so the build-time integration sees all of them) |

`package.json` and `package-lock.json` were taken from the source so the
versions match, renamed to `sf-website`, and the two font packages were
removed. Nothing else was dropped: every other dependency is used by a ported
feature.

## 1. In-page text editor

| Source file | What it does | SF |
| --- | --- | --- |
| `src/lib/edit-auth.ts` | Stateless sign-in. `EDIT_LOGIN_SLUG` hides the sign-in page at `/studio/<slug>`; `EDIT_PASSPHRASE` is the real gate; `EDIT_SECRET` signs a 7-day HMAC token cookie (HttpOnly) plus a readable "UI hint" cookie that decides whether the editor bundle is downloaded at all. Throws at import if `EDIT_SECRET` is missing. Constant-time comparisons. | Ported unchanged in logic; cookie names become `sf_edit` / `sf_edit_ui`. |
| `src/lib/editable.ts` | Shared browser + server rules: `KNOWN_PATHS`, path normalisation, text cleaning, the declared-key format (`page.section.field`, `[a-z0-9-]` segments), client IP / user agent audit helpers, `validateEdit()`. | Ported; `KNOWN_PATHS` is the seven SF routes; the project-page shape match is dropped (SF has no per-project pages). Cache prefix `sf-edits:`. |
| `src/pages/api/content.ts` | `GET` latest edit per key for a page (open, it is the read path for every visitor); `POST` saves one edit behind the session. Append-only. Anchor adoption: the stored `original_text` is kept while the browser still reports it, otherwise the browser's reading of the page becomes the anchor. | Ported unchanged. |
| `src/pages/api/content/history.ts` | Every version of one key, signed-in only. | Ported unchanged. |
| `src/pages/api/content/revert.ts` | Revert one step, or to a chosen version, by INSERTing a new row. | Ported unchanged. |
| `src/pages/api/edit-session.ts` | `POST` sign in, `DELETE` sign out, `GET` authed flag. `Secure` follows `X-Forwarded-Proto`. | Ported unchanged. |
| `src/pages/studio/[key].astro` | The sign-in page. A wrong slug returns a bodyless 404 with `X-Astro-Error` so it is identical to any other 404. `no-referrer`, `noindex`, `no-store`. | Ported; markup rewritten in SF tokens. |
| `src/layouts/BaseLayout.astro` (head script) | `window.__ntEdit`: paints cached edits from localStorage before first paint, fetches `/api/content` for every visitor, applies edits by `data-edit` key, exposes helpers to the editor. | Ported unchanged in behaviour. |
| `src/scripts/inline-edit.js` | The editor: "Edit text" mode toggle (sessionStorage), click to edit, Enter to save, Esc to cancel, optimistic save with rollback, per-element version menu (right-click / long-press), "Undo last change", session-ended handling, toast. | Ported unchanged in behaviour; storage key `sf-edit-mode`. |
| `public/editor-ui.css` | Toolbar, toast, version menu, edit-mode outlines. Lives in `public/` so editor furniture stays out of the design tokens. | Ported; colours repointed at SF tokens. The careers job-card styles in it are removed (see "Cut dependencies"). |

Table: `content_edits` (append-only; `client_ip` / `user_agent` audit columns
never returned to the browser).

## 2. Gallery studio

| Source file | What it does | SF |
| --- | --- | --- |
| `src/lib/gallery-live.ts` | The live gallery = code baseline + `gallery_events` replayed in id order. Actions `hide`, `show`, `move` (group + position), `caption`, `undo` (toggles its target; undoing an undo redoes), `add` (an upload). Falls back to the baseline if the table cannot be read. Old group names are remapped on replay (`renamedGroup`). Split-project "parts" and a "library" of off-site photos. | Ported. Groups are the six SF services. Old-name remapping kept as a generic `RENAMED_GROUPS` map (empty today). Split parts and the photo library are source-specific and dropped. New action `slot`: sets which photo fills a page image slot (see 2a). |
| `src/lib/gallery-snapshot.ts` | What the manager draws: all groups, all photos (hidden too), last 60 history rows with Undo / Redo targets. | Ported; also returns the image slots. |
| `src/pages/api/gallery.ts` | `GET` snapshot, `POST` one change, behind the session. | Ported; accepts `slot`. |
| `src/pages/api/gallery/upload.ts` | One photo per request, raw body (not multipart, so Astro's origin check never misfires behind a proxy). Group and a **required caption** in headers. Rate limit, size limit, sharp sniffing, near-duplicate warning (dHash, 409, "upload anyway"). Writes `gallery_uploads` + a `gallery_events` `add` row. | Ported unchanged in behaviour. |
| `src/lib/gallery-media.ts` | Writes three renditions under `MEDIA_DIR/gallery/` (outside the repo and `dist/`, so a deploy never touches them): master JPG, cropped tile WebP, lightbox WebP. Strips EXIF/GPS. | Ported; tile size matches SF's tile ratio. |
| `src/pages/media/gallery/[name].ts` | Serves upload renditions by strict name pattern, immutable cache. | Ported unchanged. |
| `src/lib/dhash.ts`, `scripts/build-gallery-hashes.mjs` | 64-bit difference hash and the pre-computed hashes of the shipped photos. | Ported; hashes are computed over `public/images/stock/`. |
| `src/lib/gallery-images.ts` | Resolves a baseline file to Astro image metadata; upload URL helpers. | Rewritten: SF baseline photos are pre-built files in `public/images/stock/` (WebP at three widths plus a JPEG fallback), so the resolver returns those URLs. |
| `src/pages/studio/gallery.astro`, `src/scripts/gallery-manager.js`, `public/gallery-manager.css` | The manager screen: stats, jump-to, per-group grids, drag or arrow reorder, "Move to", two-click Hide, Show, click-to-edit caption with "Restore original caption", History panel with Undo/Redo, upload dialog with per-photo required caption, progress, duplicate prompt. | Ported; sections are flattened to one list of service groups; a "Site images" panel added for slots. |
| `src/scripts/gallery-manage-link.js` | "Manage photos" link shown in edit mode on pages with photos. | Ported. |
| `src/components/GalleryGrid.astro`, `src/components/Lightbox.astro` | Tile grid and a native `<dialog>` lightbox; captions are `data-no-edit` (edited in the studio, one value per photo). | Ported, restyled in SF tokens. |

Tables: `gallery_events` (append-only), `gallery_uploads` (append-only).

### 2a. New in SF: image slots

The SF brief requires every stock image to be replaceable without code. The
source only managed gallery photos; its page heroes were code assets. SF adds
one action to the same append-only table, `slot` (`file` = the photo,
`target_group` = the slot key such as `home.hero`), replayed by the same code,
undoable by the same `undo` row and listed in the same History panel. The
studio's "Site images" panel lets an editor pick any gallery photo (stock or
uploaded) for each slot. The alt text of a slot is the chosen photo's caption.

## 3. Project text blocks

| Source file | What it does | SF |
| --- | --- | --- |
| `src/lib/project-blocks.ts` | Append-only `project_text_events` (`add` with kind heading/paragraph, `remove`, `move`), replayed per page slug. Wording edits go through `content_edits` under `projects.blocks.<id>`. | Ported. The "page slugs" are now the two lists on `/projects`: `ongoing` and `completed`. |
| `src/pages/api/project-blocks.ts` | Add, remove, move, behind the session. | Ported unchanged. |
| `src/scripts/project-blocks-editor.js` | Edit-mode "Add text" card and up / down / remove buttons per block. | Ported; copy reworded for project entries; uses its own card styles instead of the careers ones. |
| `src/components/projects/TextBlocks.astro` | Renders the blocks as editable leaves. | Ported as `ProjectList.astro`: a heading starts a project card and the paragraphs after it belong to that card. An empty list shows the designed "coming soon" state. |

## 4. Motion system

| Source file | What it does | SF |
| --- | --- | --- |
| `src/styles/motion.css` | All timing in §0 as custom properties, one pace multiplier; nav menu unroll and item stagger; scroll reveal; hover zoom, arrow nudge, card rule; homepage hero entrance from 35% opacity (LCP-safe); hero video fade. Every rule gated by `:root.<motion class>:not([data-nt-mode])` inside `@media screen and (prefers-reduced-motion: no-preference)`, hover also inside `(hover: hover)`. | Ported with variables renamed to `--sf-motion-*`, class `sf-motion`. The hero video section is dropped (SF has no video). |
| `src/scripts/reveal.js` | Marks only below-the-fold blocks, reveals once, stagger by arrival, no numbers of its own (reads §0), stops and shows everything if edit mode switches on. | Ported; walks `main section > .sf-container`. |
| BaseLayout inline head script | Adds the motion class before first paint; skipped on `/studio/*` and when the editor will restore edit mode. | Ported unchanged. |

Guards, all four kept: reduced motion, no JS (no class, no motion), edit mode
(`data-nt-mode`), print (`screen` media only).

## 5. SEO plumbing

| Source | SF |
| --- | --- |
| Unique titles `<Page> | <Name>`, homepage just the name | `<Page> | Samruddhi Fire`, homepage `Samruddhi Fire` |
| Meta descriptions 155 characters or less | same, checked by `scripts/verify-site.mjs` |
| Share card `public/share-card.png` (1200×630) built by a Playwright script; page photos override it | ported as `scripts/build-share-card.mjs` in SF brand |
| Organization JSON-LD on every page; a LocalBusiness-type block on the contact page with only on-site facts | one `LocalBusiness` block with only the verified SF facts |
| `SITE_NOINDEX` read at request time (`src/lib/staging.ts`); middleware adds `X-Robots-Tag: noindex, nofollow`; `/robots.txt` disallows all | ported; SF also writes `<meta name="robots" content="noindex, nofollow">` while it is on, and it defaults to on |
| `scripts/check-site-url.mjs` gate for `PUBLIC_SITE_URL` | ported |
| 404 page served by the router with status 404 | ported |

## 6. Deploy and backups

| Source | SF |
| --- | --- |
| `db/migrate.sql`: the only place schema lives; idempotent; refuses to run as the app's own user; creates only missing tables; columns added only after an `information_schema` check; prints a report; grant lines at the foot | ported for the five SF tables |
| App DB user has SELECT and INSERT only (plus DELETE on one careers table) and the app never runs DDL | SF user `sf_site`: SELECT and INSERT only, on every table |
| `scripts/prune-backups.sh`: keeps newest 5 build backups, deletes `.env.bak*`, DB dumps and schema snapshots older than 30 days but always keeps the newest of each kind, refuses any folder but the backup folder, `--dry-run`, never follows links | ported for `/srv/sf-backups`, schema snapshots named `sf-schema-*.sql` |
| `scripts/check-db-flows.mjs`: proves each write flow works with the app user's rights, cleans up | ported for SF's flows (text edit, gallery change, project block, lead) |
| `scripts/probe-editor.mjs`, `scripts/check-layout-shift.mjs`, `scripts/check-placeholders.mjs` | ported and adapted |

## 7. Careers and job postings (NOT ported)

Source pieces: `/careers` page, `api/careers.ts` (job postings, append-only
`job_posting_events` with `open_days`), `api/apply.ts` (public application form
with resume upload, honeypot, elapsed-time check, per-IP and daily rate limits),
`lib/applications.ts` (resume storage under `MEDIA_DIR/applications`, 24-month
purge), `lib/job-postings.ts`, `studio/applications.astro`,
`api/applications/delete.ts` and `resume.ts`, `scripts/careers-editor.js`,
`scripts/apply-form.js`, `lib/mailer.ts` (careers inbox).

None of it came across. The SF brief excludes careers and the staff screens
tied to it.

## Cut dependencies

Where a ported feature leaned on something that was not ported:

1. **Project text block styles leaned on the careers card.** The source's
   "Add text" card reused `.nt-jobs-add`, `.nt-jobs-head`, `.nt-jobs-note`,
   `.nt-jobs-error` and `.nt-jobs-submit` from the careers editor. SF gives the
   card its own `.nt-blocks-*` rules in `public/editor-ui.css` and the careers
   rules are gone.
2. **The DB grant model had a DELETE exception for job applications.** SF has
   no table that needs DELETE, so `sf_site` gets SELECT and INSERT only, on
   every table.
3. **`check-db-flows.mjs` tested three careers flows.** Removed; SF tests its
   own four write flows instead.
4. **The mailer was careers-only.** Rewritten as `src/lib/mailer.ts` for
   leads: `SMTP_HOST` empty means email is skipped with one log line ("email
   disabled") and the lead is still saved.
5. **The honeypot, elapsed-time check and rate limiter lived in the careers
   apply route.** The pattern is reused, without resumes, in
   `src/pages/api/contact.ts`.
6. **The gallery baseline was the source's project data** (project details,
   social project pages, plant pages, HSE groups, a library of retired photos,
   split projects). All cut. The SF baseline is `src/data/gallery.ts`: the six
   service groups and the stock photos.
7. **The sitemap endpoint read the source's project data modules.** Replaced
   by `@astrojs/sitemap` over SF's fixed routes.
8. **Nav and footer were driven by the source's homepage data module.** Ported
   as structure and behaviour only (fixed bar, hover / focus drop-down with
   the motion unroll, phone drawer, per-page edit-key prefix); the data is
   SF's own `src/data/site.ts`.
9. **`MEDIA_DIR` also held resumes.** SF only stores gallery uploads there.

## Not ported (other)

- All source copy and data files, images, video, logos, favicons, the share
  card, design tokens and type scale.
- Source pages other than the shell: health and safety, clients, company,
  careers, capabilities, resources, plant pages, privacy, terms, CSR, project
  detail pages.
- Source-specific scripts: client-logo builder, favicon tracer, hero video
  builder, raw media manifest, edit-key checker tied to the source's copy
  modules, font fallback measurer, shift diagnoser.

## Strip

After porting, the whole SF tree is swept case-insensitively for the source's
names, people, clients and places (`npm run check:sweep`,
`scripts/sweep-source.mjs`). The term list lives only in that script, encoded,
so the script does not match itself. The sweep must report zero hits before a
commit.
