import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

export type ContentDeps = {
  /** Content root; images live in `<contentDir>/images`. */
  contentDir: string;
};

/** Static content assets referenced by unit theory HTML (`/content/images/<file>`). */
export function contentRoutes({ contentDir }: ContentDeps) {
  return new Hono().use(
    "/images/*",
    serveStatic({
      root: join(contentDir, "images"),
      rewriteRequestPath: (path) => path.replace(/^\/content\/images/, ""),
    }),
  );
}
