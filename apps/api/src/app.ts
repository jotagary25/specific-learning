import { Hono } from "hono";
import { type Auth, requireSession } from "./auth/auth.ts";
import { contentRoutes } from "./content/content.routes.ts";
import { resolveContentDir } from "./content/content-dir.ts";
import { type HealthDeps, healthRoutes } from "./health/health.routes.ts";
import { settingsRoutes } from "./settings/settings.routes.ts";
import type { Settings } from "./settings/settings.service.ts";
import { unitsRoutes } from "./units/units.routes.ts";
import type { Units } from "./units/units.service.ts";

export type AppDeps = HealthDeps & {
  /** Content root for static assets; defaults to `resolveContentDir()`. */
  contentDir?: string;
  /** Single-user session auth. Without it every protected /api route answers 401. */
  auth?: Auth;
  settings?: Settings;
  units?: Units;
};

export function createApp(deps: AppDeps) {
  // Public routes are registered before the session middleware, so they answer first.
  const api = new Hono().route("/health", healthRoutes(deps));
  if (deps.auth) api.route("/auth", deps.auth.routes);
  api.use("*", requireSession(deps.auth));
  if (deps.settings) api.route("/settings", settingsRoutes(deps.settings));
  if (deps.units) api.route("/units", unitsRoutes(deps.units));

  return new Hono()
    .route("/api", api)
    .route("/content", contentRoutes({ contentDir: deps.contentDir ?? resolveContentDir() }));
}

export type App = ReturnType<typeof createApp>;
