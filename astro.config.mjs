// @ts-check
import { defineConfig } from "astro/config";
import { loadEnv } from "vite";

import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

/* Config-time env, read with Vite's loader because it runs before the config
   object exists. The "" prefix means no filter, so PORT is visible too. */
const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");

/* 4321 and 4322 are used by other projects on this machine. */
const PORT = Number(env.PORT) || 4323;

/* Canonical URLs, og:image, JSON-LD and the sitemap all need an absolute
   origin. Locally it falls back to the dev origin; on the real domain
   PUBLIC_SITE_URL must be set (`npm run build:release` refuses otherwise). */
const SITE = env.PUBLIC_SITE_URL || `http://localhost:${PORT}`;

/* Never in the sitemap: the editor's screens, the error page, and the old
   /contact address, which only redirects. */
const NOT_IN_SITEMAP = /\/(studio|404|contact)(\/|$)/;

export default defineConfig({
  site: SITE,

  /* Server-rendered: the editor's saved text, the live gallery and the
     project lists are read from MySQL on every request. */
  output: "server",

  /* Off on purpose. The compressor removes whitespace between tags, and
     some lines put an editable span beside generated text (the footer's
     year), where that whitespace is a word gap. The in-page editor trims
     every value it reads, so a space inside the span would not survive. */
  compressHTML: false,

  adapter: node({
    mode: "standalone",
  }),

  /* The old WordPress site linked /contact in places; /contact-us is the
     real page. Permanent, so search engines move the link over. */
  redirects: {
    "/contact": { status: 301, destination: "/contact-us" },
  },

  integrations: [
    sitemap({
      filter: (page) => !NOT_IN_SITEMAP.test(new URL(page).pathname),
    }),
  ],

  server: {
    port: PORT,
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
