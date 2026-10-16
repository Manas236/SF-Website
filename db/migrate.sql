-- ============================================================
-- Samruddhi Fire website: database migration
-- ------------------------------------------------------------
-- The ONE place the shape of the database is defined. It creates the
-- database and every table the site uses, and brings an older install
-- up to date.
--
-- THE SITE NEVER CHANGES THE SCHEMA ITSELF. Its database user, sf_site,
-- may only SELECT and INSERT (see the grants at the foot of this file).
-- So this script is run by a database ADMINISTRATOR, BEFORE the app is
-- (re)started, on every deploy:
--
--   sudo mysql < db/migrate.sql            Ubuntu server: MySQL's root
--                                          over the local socket
--   mysql -u <admin> -p < db/migrate.sql   an administrator with a
--                                          password
--
-- Never as sf_site: the first statement below stops the script if it is.
--
-- SAFE TO RUN ANY NUMBER OF TIMES. Tables are created only if missing. A
-- column is added only after information_schema says it is needed.
-- Nothing is ever dropped, renamed or deleted, and no row is touched, so
-- text the client has edited on the site survives every run. Each run
-- ends by printing what it did.
--
-- The database name must match DB_NAME in .env (sf_site). If one install
-- ever differs, change the CREATE DATABASE and USE lines together.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Not as the site's own user.
--
-- Written as a statement that cannot be prepared, so the client stops
-- here with the reason in the error, before anything else runs.
-- ------------------------------------------------------------
SET @sf_step := IF(SUBSTRING_INDEX(CURRENT_USER(), '@', 1) = 'sf_site',
  'SELECT `STOP - run db/migrate.sql as an admin, not as sf_site` FROM DUAL',
  'DO 0');
PREPARE sf_step FROM @sf_step;
EXECUTE sf_step;
DEALLOCATE PREPARE sf_step;

CREATE DATABASE IF NOT EXISTS sf_site
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sf_site;

-- Which tables were here before this run, for the report at the end.
SET @sf_had := (
  SELECT IFNULL(GROUP_CONCAT(table_name), '')
    FROM information_schema.tables
   WHERE table_schema = DATABASE()
);

-- ------------------------------------------------------------
-- 1. The tables, each as it stands today.
-- ------------------------------------------------------------

-- content_edits: in-page text edits made through the site itself.
--
-- `edit_key` is a DECLARED NAMED SLOT: the literal string an author
-- wrote into a `data-edit` attribute, mirroring the copy object's path
-- (`home.hero.headline`). It survives the markup around it changing,
-- because nothing computes it (src/lib/editable.ts).
--
-- APPEND-ONLY. Nothing is ever UPDATEd or DELETEd; every save is a new
-- row, so the table is the full history of a piece of copy.
--
--   current value for a key = the row with the highest id
--   revert                  = INSERT a new row carrying an older new_text
--
-- A utf8mb4 index key is capped at 767 bytes, so the composite index
-- takes a 191-character prefix of edit_key.
--
-- client_ip / user_agent are audit columns. Writes sit behind one shared
-- passphrase, so these are the only record of where a change came from.
-- They are NEVER returned to the browser. NULL when the address cannot
-- be trusted.
CREATE TABLE IF NOT EXISTS content_edits (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  page_path     VARCHAR(255)  NOT NULL,
  edit_key      VARCHAR(512)  NOT NULL,
  original_text TEXT          NOT NULL,
  new_text      TEXT          NOT NULL,
  client_ip     VARCHAR(45)   NULL,
  user_agent    VARCHAR(255)  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_page (page_path),
  INDEX idx_page_key (page_path, edit_key(191))
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- gallery_events: changes made in the studio gallery manager
-- (/studio/gallery): which photos show, in which service group, in what
-- order, under what caption, and which photo fills each page image slot.
--
-- src/data/gallery.ts is the BASELINE and src/data/image-slots.ts the
-- baseline slot photos. The live gallery is the baseline with these
-- events replayed in id order (src/lib/gallery-live.ts). If this table
-- cannot be read, the site shows the baseline.
--
-- APPEND-ONLY:
--   hide     file                       take a photo off the site
--   show     file                       put it back
--   move     file, target_group, position   move it (or reorder within
--                                       its group); position NULL = end
--   caption  file, caption              new caption, everywhere
--   add      file, target_group, caption    a studio upload
--                                       (gallery_uploads holds details)
--   slot     file, target_group         use this photo for the page
--                                       image slot named in target_group
--   undo     ref_id                     cancel event ref_id; undoing an
--                                       undo puts the change back
CREATE TABLE IF NOT EXISTS gallery_events (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  action        ENUM('hide', 'show', 'move', 'caption', 'undo', 'add', 'slot') NOT NULL,
  file          VARCHAR(120)  NULL,
  target_group  VARCHAR(160)  NULL,
  position      INT           NULL,
  caption       VARCHAR(300)  NULL,
  ref_id        INT           NULL,
  client_ip     VARCHAR(45)   NULL,
  user_agent    VARCHAR(255)  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ref (ref_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- gallery_uploads: photos uploaded through the studio.
--
-- One row per upload. The files are on disk under MEDIA_DIR
-- (src/lib/gallery-media.ts), NOT in the repo and NOT in dist/, so a
-- deploy never touches them, and so they need their own backup. `file`
-- is the name every other table and page uses (up-YYYYMMDD-<8 hex>.jpg);
-- `hash` is its dHash (src/lib/dhash.ts). original_name is what the
-- editor's computer called it, for the audit trail only. APPEND-ONLY: an
-- upload is taken off the site with a `hide` event, never by deleting.
CREATE TABLE IF NOT EXISTS gallery_uploads (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  file           VARCHAR(120)  NOT NULL,
  width          INT           NOT NULL,
  height         INT           NOT NULL,
  bytes          INT           NOT NULL,
  hash           CHAR(16)      NOT NULL,
  original_name  VARCHAR(255)  NULL,
  client_ip      VARCHAR(45)   NULL,
  user_agent     VARCHAR(255)  NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_file (file)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- project_text_events: entries on the /projects lists ("ongoing",
-- "completed" in page_slug), added in edit mode
-- (src/lib/project-blocks.ts).
--
-- APPEND-ONLY:
--   add     page_slug, kind, text; its own id IS the block id
--   remove  block_id
--   move    block_id, position = its new index in the list
-- A block's later wording edits are ordinary content_edits rows under
-- the key projects.blocks.<id>.
CREATE TABLE IF NOT EXISTS project_text_events (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  action        ENUM('add', 'remove', 'move') NOT NULL,
  page_slug     VARCHAR(160)  NOT NULL,
  block_id      INT           NULL,
  kind          ENUM('heading', 'paragraph') NULL,
  text          TEXT          NULL,
  position      INT           NULL,
  client_ip     VARCHAR(45)   NULL,
  user_agent    VARCHAR(255)  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_slug (page_slug)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- leads: every enquiry sent from the contact form
-- (src/pages/api/contact.ts). One row per enquiry, saved BEFORE any
-- email is attempted, so a lead is never lost to a mail failure.
-- APPEND-ONLY. email is optional on the form.
CREATE TABLE IF NOT EXISTS leads (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  phone         VARCHAR(30)   NOT NULL,
  email         VARCHAR(254)  NULL,
  service       VARCHAR(80)   NOT NULL,
  message       TEXT          NOT NULL,
  page          VARCHAR(255)  NULL,
  client_ip     VARCHAR(45)   NULL,
  user_agent    VARCHAR(255)  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- lead_emails: what happened to the email copy of each lead.
-- APPEND-ONLY, so the app needs no UPDATE on leads:
--   disabled  SMTP_HOST is empty; the lead is in the database only
--   sent      the mail server accepted it
--   failed    the mail server refused it or could not be reached
CREATE TABLE IF NOT EXISTS lead_emails (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  lead_id       INT           NOT NULL,
  outcome       ENUM('disabled', 'sent', 'failed') NOT NULL,
  detail        VARCHAR(255)  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lead (lead_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. Columns that tables created before a given date lack.
--
-- None yet. The pattern, for the next change: look in
-- information_schema, then ALTER only if needed, prepared, because plain
-- SQL has no IF outside a routine:
--
--   SET @sf_need := (SELECT COUNT(*) = 0 FROM information_schema.columns
--                     WHERE table_schema = DATABASE()
--                       AND table_name = 'leads' AND column_name = 'x');
--   SET @sf_step := IF(@sf_need, 'ALTER TABLE leads ADD COLUMN x ...', 'DO 0');
--   PREPARE sf_step FROM @sf_step; EXECUTE sf_step; DEALLOCATE PREPARE sf_step;
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. What this run did.
-- ------------------------------------------------------------
SELECT name AS `table`,
       IF(FIND_IN_SET(name, @sf_had), 'already there', 'created') AS result
  FROM (
    SELECT 'content_edits' AS name
    UNION ALL SELECT 'gallery_events'
    UNION ALL SELECT 'gallery_uploads'
    UNION ALL SELECT 'project_text_events'
    UNION ALL SELECT 'leads'
    UNION ALL SELECT 'lead_emails'
  ) AS wanted;

SELECT CONCAT('Migration complete on ', DATABASE(), ' as ', CURRENT_USER(), '.') AS done;

-- ============================================================
-- The site's own user: NOT created by this script.
--
-- sf_site is created once per server by an administrator, with the
-- password that goes into DB_PASSWORD in .env, and needs exactly these
-- rights and no others. Every table is append-only, so SELECT and INSERT
-- are all the app uses. No UPDATE, no DELETE, no CREATE, no ALTER.
--
--   CREATE USER IF NOT EXISTS 'sf_site'@'localhost' IDENTIFIED BY '<password>';
--   GRANT SELECT, INSERT ON sf_site.content_edits       TO 'sf_site'@'localhost';
--   GRANT SELECT, INSERT ON sf_site.gallery_events      TO 'sf_site'@'localhost';
--   GRANT SELECT, INSERT ON sf_site.gallery_uploads     TO 'sf_site'@'localhost';
--   GRANT SELECT, INSERT ON sf_site.project_text_events TO 'sf_site'@'localhost';
--   GRANT SELECT, INSERT ON sf_site.leads               TO 'sf_site'@'localhost';
--   GRANT SELECT, INSERT ON sf_site.lead_emails         TO 'sf_site'@'localhost';
--
-- A table-level grant needs the table to exist, so run this file first.
-- A table added later needs its own GRANT line here, run on every server.
-- For a local install, scripts/db-setup.mjs runs this file and then these
-- lines as an administrator, with the password taken from .env (it is
-- never printed). It is an admin tool, never imported by the app.
-- ============================================================
