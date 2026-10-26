import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

export type WebDeps = {
  /** Built web app (`apps/web/dist`): index.html, hashed assets, service worker, manifest. */
  distDir: string;
};

/** Paths owned by other route groups; the SPA fallback must never answer them. */
const RESERVED = /^\/(api|content)(\/|$)/;
/** Last path segment with an extension, e.g. `/assets/index-abc.js`. */
const FILE_LIKE = /\/[^/]+\.[a-z0-9]+$/i;

/** Hashed build output never changes for a given URL; everything else must revalidate. */
function cacheControlFor(path: string): string {
  return path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
}

/**
 * Serves the production web build: static files first, then `index.html` for any other
 * GET/HEAD navigation so client-side routes (e.g. `/units/3`) survive a reload.
 */
export function webRoutes(deps: WebDeps) {
  const distDir = resolve(deps.distDir);
  let indexHtml: Promise<string> | undefined;
  const loadIndex = () => {
    indexHtml ??= readFile(join(distDir, "index.html"), "utf8").catch((error: unknown) => {
      indexHtml = undefined;
      throw error;
    });
    return indexHtml;
  };

  return new Hono()
    .use("*", async (c, next) => {
      if (RESERVED.test(c.req.path)) return c.notFound();
      await next();
    })
    .use("*", async (c, next) => {
      await next();
      if (c.res.ok) c.res.headers.set("Cache-Control", cacheControlFor(c.req.path));
    })
    .use("*", serveStatic({ root: distDir }))
    .on(["GET", "HEAD"], "*", async (c) => {
      // A missing file (e.g. a stale hashed chunk) is a 404, never HTML posing as JS/CSS.
      if (FILE_LIKE.test(c.req.path)) return c.notFound();
      return c.html(await loadIndex());
    });
}
