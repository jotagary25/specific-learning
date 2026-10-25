import { Hono } from "hono";
import { type HealthDeps, healthRoutes } from "./health/health.routes.ts";

export type AppDeps = HealthDeps;

export function createApp(deps: AppDeps) {
  return new Hono().basePath("/api").route("/health", healthRoutes(deps));
}

export type App = ReturnType<typeof createApp>;
