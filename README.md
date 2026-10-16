# Samruddhi Fire website

Public website for Samruddhi Fire, a fire protection contractor in
Koparkhairane, Navi Mumbai. Astro 7 (server output, `@astrojs/node`
standalone), Tailwind 4, MySQL (`mysql2`).

The client edits the site themselves: in-page text, photos and page images,
project lists, and a list of contact-form enquiries. Every change is stored in
append-only tables, so nothing is lost and everything can be undone.

## Run locally

```sh
npm install
cp .env.example .env                         # fill in values (see .env.example)
MYSQL_ADMIN_PASSWORD=... npm run db:setup    # once: database, tables, sf_site user
npm run dev                                  # http://localhost:4323
```

Production-style: `npm run build`, then `npm start`.

## Editing

Sign in at `/studio/<EDIT_LOGIN_SLUG>` with `EDIT_PASSPHRASE` (both in `.env`).

- **Text:** any page, **Edit text** (bottom corner), click text, type, Enter.
- **Photos and page images:** `/studio/gallery` (upload with caption, hide,
  move, reorder, recaption, "Site images", History with Undo).
- **Projects:** `/projects` in edit mode, "Add to this list".
- **Enquiries:** `/studio/leads`.

Placeholders read `[Client to supply: ...]` on an amber highlight.

## Checks

`check:site` (routes, 301/404, titles, descriptions, em dashes, noindex,
JSON-LD, anchors, widths, nav, CLS, motion) · `check:editor` · `check:gallery`
· `check:contact` · `check:db-flows` · `check:cls` · `check:placeholders` ·
`check:sweep`. Browser checks need Chrome and a running site.

## Docs

`CLAUDE.md` (house rules) · `docs/DESIGN-SYSTEM.md` · `docs/DEPLOY.md` ·
`docs/IMAGE-CREDITS.md` · `docs/OPEN-QUESTIONS.md` · `docs/PORT-MAP.md`
