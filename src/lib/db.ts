/* ============================================================
   MySQL connection pool
   ------------------------------------------------------------
   One shared pool for the whole app. Credentials come from .env (see
   .env.example); never hard-code a password here.

   The site's database user may only SELECT and INSERT. Nothing in the
   app runs CREATE, ALTER or DROP: the schema is db/migrate.sql, run by
   an administrator on every deploy.
   ============================================================ */
import mysql from "mysql2/promise";
import "dotenv/config"; // loads .env into process.env

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "sf_site",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "sf_site",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
