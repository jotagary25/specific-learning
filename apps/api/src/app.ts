import { Hono } from "hono";
import { contentRoutes } from "./content/content.routes.ts";
import { resolveContentDir } from "./content/content-dir.ts";
import { type HealthDeps, healthRoutes } from "./health/health.routes.ts";

export type AppDeps = HealthDeps & {
  /** Content root for static assets; defaults to `resolveContentDir()`. */
  contentDir?: string;
};

export function createApp(deps: AppDeps) {
  const api = new Hono().route("/health", healthRoutes(deps));
  return new Hono()
    .route("/api", api)
    .route("/content", contentRoutes({ contentDir: deps.contentDir ?? resolveContentDir() }));
}

export type App = ReturnType<typeof createApp>;
