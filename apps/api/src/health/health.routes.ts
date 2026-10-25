import type { HealthResponse } from "@english-course/shared";
import { Hono } from "hono";

export type HealthDeps = {
  /** Resolves when the database answers; rejects or resolves false when it does not. */
  pingDb: () => Promise<boolean>;
};

export function healthRoutes({ pingDb }: HealthDeps) {
  return new Hono().get("/", async (c) => {
    const dbUp = await pingDb().catch(() => false);
    const body: HealthResponse = { status: "ok", db: dbUp ? "ok" : "down" };
    return c.json(body);
  });
}
