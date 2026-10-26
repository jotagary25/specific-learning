import { Hono } from "hono";
import { type AppEnv, type Auth, requireSession } from "./auth/auth.ts";
import { contentRoutes } from "./content/content.routes.ts";
import { resolveContentDir } from "./content/content-dir.ts";
import { evalRoutes } from "./eval/eval.routes.ts";
import type { Eval } from "./eval/eval.service.ts";
import { type HealthDeps, healthRoutes } from "./health/health.routes.ts";
import { progressRoutes } from "./progress/progress.routes.ts";
import type { Progress } from "./progress/progress.service.ts";
import { readingRoutes } from "./reading/reading.routes.ts";
import type { Reading } from "./reading/reading.service.ts";
import {
  type PreferencesService,
  preferencesRoutes,
  timeZoneScope,
} from "./settings/preferences.ts";
import { settingsRoutes } from "./settings/settings.routes.ts";
import type { Settings } from "./settings/settings.service.ts";
import { webRoutes } from "./static/web.routes.ts";
import { todayRoutes } from "./today/today.routes.ts";
import type { Today } from "./today/today.service.ts";
import { tutorRoutes } from "./tutor/tutor.routes.ts";
import type { Tutor } from "./tutor/tutor.service.ts";
import { unitsRoutes } from "./units/units.routes.ts";
import type { Units } from "./units/units.service.ts";
import { vocabularyRoutes } from "./vocabulary/vocabulary.routes.ts";
import type { Vocabulary } from "./vocabulary/vocabulary.service.ts";
import { writingRoutes } from "./writing/writing.routes.ts";
import type { Writing } from "./writing/writing.service.ts";

export type AppDeps = HealthDeps & {
  /** Content root for static assets; defaults to `resolveContentDir()`. */
  contentDir?: string;
  /** Built web app to serve with SPA fallback (production); unset in dev, where Vite serves it. */
  webDistDir?: string;
  /** Per-user session auth. Without it every protected /api route answers 401. */
  auth?: Auth;
  settings?: Settings;
  preferences?: PreferencesService;
  units?: Units;
  reading?: Reading;
  vocabulary?: Vocabulary;
  writing?: Writing;
  today?: Today;
  progress?: Progress;
  tutor?: Tutor;
  evals?: Eval;
};

export function createApp(deps: AppDeps) {
  // Public routes are registered before the session middleware, so they answer first.
  const api = new Hono<AppEnv>().route("/health", healthRoutes(deps));
  if (deps.auth) api.route("/auth", deps.auth.routes);
  api.use("*", requireSession(deps.auth));
  // One time-zone lookup per request, shared by every module that computes local days.
  api.use("*", timeZoneScope());
  if (deps.preferences) api.route("/settings/preferences", preferencesRoutes(deps.preferences));
  if (deps.settings) api.route("/settings", settingsRoutes(deps.settings));
  if (deps.units) api.route("/units", unitsRoutes(deps.units));
  if (deps.reading) api.route("/reading", readingRoutes(deps.reading));
  if (deps.vocabulary) api.route("/vocabulary", vocabularyRoutes(deps.vocabulary));
  if (deps.writing) api.route("/writing", writingRoutes(deps.writing));
  if (deps.today) api.route("/today", todayRoutes(deps.today));
  if (deps.progress) api.route("/progress", progressRoutes(deps.progress));
  if (deps.tutor) api.route("/tutor", tutorRoutes(deps.tutor));
  if (deps.evals) api.route("/eval", evalRoutes(deps.evals));

  const app = new Hono()
    .route("/api", api)
    .route("/content", contentRoutes({ contentDir: deps.contentDir ?? resolveContentDir() }));
  // Registered last: it only answers what /api and /content did not.
  if (deps.webDistDir) app.route("/", webRoutes({ distDir: deps.webDistDir }));
  return app;
}

export type App = ReturnType<typeof createApp>;
