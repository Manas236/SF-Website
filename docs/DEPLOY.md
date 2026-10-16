# Deploy

## First install

1. Create `/srv/sf-backups/` (owned by the site user, mode 700).
2. As a MySQL administrator: `sudo mysql < db/migrate.sql` (creates the
   database and tables).
3. Create `sf_site` with the grants at the foot of `db/migrate.sql` (SELECT
   and INSERT only), or run `npm run db:setup` with `MYSQL_ADMIN_PASSWORD` set.
4. Write `.env` from `.env.example`: fresh secrets, `MEDIA_DIR` outside the
   repo (and backed up), `DB_PASSWORD` for `sf_site`.
5. `npm ci && npm run build`, then start `node dist/server/entry.mjs` under a
   service manager, behind a reverse proxy.

Proxy: pass `X-Forwarded-For` and `X-Forwarded-Proto`; allow request bodies up
to about 26 MB on `/api/gallery/upload`; rate-limit `/api/edit-session`.

## Every deploy

1. Back up the build: `cp -a dist /srv/sf-backups/dist.bak-$(date +%Y%m%d-%H%M)`.
   Only if that worked: `bash scripts/prune-backups.sh /srv/sf-backups`.
2. `git pull --ff-only` (a server never commits). `npm ci` if the lock changed.
3. Migrate as an administrator: `sudo mysql < db/migrate.sql`. Idempotent;
   never drops or changes a row.
4. `npm run build` (on the real domain: `npm run build:release`).
5. Restart the service.
6. `npm run check:db-flows` against the running site; all must pass.
7. Read the service log since the restart: no "command denied".

The app never runs DDL. Text, photos, projects and leads the client entered
live in the database and `MEDIA_DIR`; no deploy, migration or cleanup may
UPDATE or DELETE them.

## Launch checklist

- `PUBLIC_SITE_URL=https://<real domain>` (build:release refuses without it)
- `SITE_NOINDEX=0`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (and `SMTP_FROM`,
  `LEADS_TO`) so enquiries are emailed; until then they are only in
  `/studio/leads`
- Placeholders replaced (`npm run check:placeholders`)
- Real photos uploaded in `/studio/gallery` to replace stock
- Redirect the old WordPress host to the new site; `/about`, `/services`,
  `/contact-us`, the `/services#` anchors and `/contact` already work
