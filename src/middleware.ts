/* Noindex switch: keep this deployment out of every search index while
   SITE_NOINDEX=1. See src/lib/staging.ts. */
import { defineMiddleware } from "astro:middleware";
import { isNoindexDeployment } from "./lib/staging";

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  if (!isNoindexDeployment()) return response;
  try {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  } catch {
    // Some responses (a redirect built by Response.redirect) have
    // immutable headers: copy it and set the header on the copy.
    const copy = new Response(response.body, response);
    copy.headers.set("X-Robots-Tag", "noindex, nofollow");
    return copy;
  }
});
