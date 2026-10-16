# Samruddhi Fire website

Astro 7 (server output, `@astrojs/node` standalone) + Tailwind 4 + MySQL
(`mysql2`). Public site for Samruddhi Fire, a fire protection contractor in
Navi Mumbai. Read `docs/DESIGN-SYSTEM.md` before touching any page, and
`docs/PORT-MAP.md` for where the editor, gallery studio and motion system came
from.

## Development

- `npm run dev` (port 4323; 4321 and 4322 belong to other projects).
- `npm run build`, then `npm start` to run the built server.
- Checks: `npm run check:site` (routes, anchors, em dashes, titles,
  descriptions, layout at 360/390/1280, motion guards), `check:editor`,
  `check:db-flows`, `check:cls`, `check:placeholders`, `check:sweep`.
- `.env` holds every secret and is git-ignored. `.env.example` lists them.

## Facts and content

- `src/data/site.ts` is the only place a fact about the business lives.
  Nothing goes in that the client has not confirmed.
- Hard bans in visitor copy: no figures of any kind (years, clients,
  projects, staff, reviews, ratings), no testimonials, no claims of
  accreditation, certification, licences, ISO or 24-hour service, no named
  clients or projects.
- Anything the client must still supply is a placeholder in ONE format,
  `ph("...")` from `src/data/placeholder.ts`, which renders
  `[Client to supply: ...]`. Never invent the missing fact instead.
- Copy is plain Indian English, short sentences.

## No em dashes in anything a visitor or a search engine can see

Titles, meta descriptions, og and JSON-LD, page copy, alt text, captions,
button labels, form and error messages, the 404, email subjects, and any
comment that ships in HTML (an HTML comment in a template, a comment in an
`is:inline` script). Rewrite with a comma, colon, full stop or "and", never a
spaced hyphen. `npm run check:site` fails on an em dash in any served page.
Titles: `<Page> | Samruddhi Fire`, homepage `Samruddhi Fire`. Meta
descriptions 155 characters or less.

## Text the client has edited is never overwritten

The in-page editor stores every edit in `content_edits` (append-only) under a
declared key (`data-edit="page.section.field"`), and the head script paints it
over the built copy on every load. Therefore:

- Never rename, renumber or reuse an edit key; the client's text is filed
  under it. A retired key is retired for good.
- Changing the built copy under a key does not change what the client wrote,
  and must not try to. No script, migration, cleanup or deploy may UPDATE or
  DELETE rows in `content_edits`, `gallery_events`, `gallery_uploads`,
  `project_text_events`, `leads` or `lead_emails`.
- Studio uploads live in `MEDIA_DIR`, outside the repo and `dist/`; a deploy
  never touches them.

## The app never runs DDL

The schema is `db/migrate.sql`, run by a database administrator on every
deploy before the app restarts (`docs/DEPLOY.md`). The app's user `sf_site`
has SELECT and INSERT only.

- A new table or column goes into `db/migrate.sql`: idempotent, created only
  if missing, a column added only after an `information_schema` check.
- A new table also gets its grant line at the foot of that file and in
  `scripts/db-setup.mjs`.
- A new kind of write must need nothing beyond SELECT and INSERT. If it
  seems to, stop and ask; do not widen `sf_site`'s grants.

## Motion stays light, and is off when it should be

All timing is `src/styles/motion.css` section 0 (`--sf-motion-*`;
`--sf-motion-pace` scales everything). Only opacity and transform move, never
layout. Every rule keeps the gates: `:root.sf-motion:not([data-nt-mode])`
inside `@media screen and (prefers-reduced-motion: no-preference)`, hover
rules also inside `(hover: hover)`. So motion is off under reduced motion,
with no JavaScript, in edit mode, on `/studio` and in print. Nothing may be
hidden by CSS alone: only `src/scripts/reveal.js` hides blocks, and only below
the fold. The homepage hero copy fades from 35% opacity, never 0 (LCP).

## Brand

All colours, radii, shadows and the font come from the Samruddhi Fire QMS
(`C:\Users\infra\dev\Demo_Works`, `branding.py` and `chrome.py`) and live only
in `src/styles/tokens.css`. No raw hex in pages or components.

## Editor sign-in

`/studio/<EDIT_LOGIN_SLUG>` (from `.env`) with `EDIT_PASSPHRASE`. Never print
or commit either. From there: the in-page editor, `/studio/gallery` (photos
and page images) and `/studio/leads` (contact-form enquiries).
