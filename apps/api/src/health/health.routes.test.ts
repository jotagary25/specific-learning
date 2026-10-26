import { HealthResponse } from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { REPO_CONTENT_DIR } from "../content/content-dir.test-support.ts";

describe("GET /api/health", () => {
  it("reports db ok when the database ping succeeds", async () => {
    const app = createApp({ contentDir: REPO_CONTENT_DIR, pingDb: async () => true });

    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    expect(HealthResponse.parse(await res.json())).toEqual({ status: "ok", db: "ok" });
  });

  it("reports db down when the database ping fails", async () => {
    const app = createApp({
      contentDir: REPO_CONTENT_DIR,
      pingDb: async () => {
        throw new Error("connection refused");
      },
    });

    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "down" });
  });
});
