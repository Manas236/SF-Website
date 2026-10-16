/* ============================================================
   Admin tool: set up the database for a local or first install
   ------------------------------------------------------------
   Runs, AS A DATABASE ADMINISTRATOR:
     1. db/migrate.sql (creates the database and every table, safe to
        repeat; never drops or touches a row)
     2. creates the site's own user `sf_site` if missing, sets its
        password to DB_PASSWORD from .env, and gives it exactly the
        grants listed at the foot of db/migrate.sql (SELECT, INSERT)
     3. connects as sf_site and checks it can read every table and
        cannot create one

   This is NOT part of the app. The app never runs a schema statement;
   it connects as sf_site, which cannot.

   The admin credentials come from the environment, never from .env:
     MYSQL_ADMIN_USER      (default root)
     MYSQL_ADMIN_PASSWORD
   No password is printed.

   Usage:  MYSQL_ADMIN_PASSWORD=... node scripts/db-setup.mjs
   ============================================================ */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
dotenv.config({ path: ROOT + ".env", quiet: true });

const TABLES = ["content_edits", "gallery_events", "gallery_uploads", "project_text_events", "leads", "lead_emails"];

const host = process.env.DB_HOST || "localhost";
const port = Number(process.env.DB_PORT || 3306);
const dbName = process.env.DB_NAME || "sf_site";
const appUser = process.env.DB_USER || "sf_site";
const appPass = process.env.DB_PASSWORD || "";

if (dbName !== "sf_site") {
  console.error(`DB_NAME is "${dbName}", but db/migrate.sql creates sf_site. Change both together.`);
  process.exit(2);
}
if (!appPass) {
  console.error("DB_PASSWORD is empty in .env. Generate one first; the site user needs a password.");
  process.exit(2);
}

const admin = await mysql
  .createConnection({
    host,
    port,
    user: process.env.MYSQL_ADMIN_USER || "root",
    password: process.env.MYSQL_ADMIN_PASSWORD || "",
    multipleStatements: true,
  })
  .catch((err) => {
    console.error(`Could not sign in to MySQL as the administrator: ${err.code || err.message}`);
    process.exit(1);
  });

try {
  const sql = readFileSync(ROOT + "db/migrate.sql", "utf8");
  const [results] = await admin.query(sql);
  for (const r of [].concat(results)) {
    if (Array.isArray(r)) for (const row of r) console.log("  " + Object.values(row).join("  "));
  }

  await admin.query("CREATE USER IF NOT EXISTS ?@'localhost' IDENTIFIED BY ?", [appUser, appPass]);
  await admin.query("ALTER USER ?@'localhost' IDENTIFIED BY ?", [appUser, appPass]);
  for (const t of TABLES) {
    await admin.query(`GRANT SELECT, INSERT ON \`sf_site\`.\`${t}\` TO ?@'localhost'`, [appUser]);
  }
  const [grants] = await admin.query("SHOW GRANTS FOR ?@'localhost'", [appUser]);
  console.log(`\nGrants for ${appUser}@localhost:`);
  for (const g of grants) console.log("  " + Object.values(g)[0].replace(/IDENTIFIED BY .*/, ""));
} finally {
  await admin.end();
}

/* The proof: the app's own user can read every table and cannot create one. */
const app = await mysql.createConnection({ host, port, user: appUser, password: appPass, database: dbName });
let ok = true;
for (const t of TABLES) {
  try {
    await app.query(`SELECT COUNT(*) FROM \`${t}\``);
  } catch (err) {
    ok = false;
    console.log(`FAIL  ${appUser} cannot read ${t}: ${err.code}`);
  }
}
try {
  await app.query("CREATE TABLE should_not_exist (id INT)");
  ok = false;
  console.log(`FAIL  ${appUser} was able to CREATE a table; its grants are too wide`);
  await app.query("DROP TABLE should_not_exist").catch(() => {});
} catch {
  console.log(`PASS  ${appUser} cannot run CREATE (as intended)`);
}
await app.end();
console.log(ok ? `PASS  ${appUser} can read all ${TABLES.length} tables` : "Setup has problems; see above.");
process.exit(ok ? 0 : 1);
