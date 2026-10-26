import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { REPO_CONTENT_DIR } from "./content-dir.test-support.ts";
import { resolveContentDir } from "./content-dir.ts";

const app = createApp({ pingDb: async () => true, contentDir: REPO_CONTENT_DIR });

describe("GET /content/images/*", () => {
  it("serves a unit image from the content folder", async () => {
    const res = await app.request("/content/images/unit_001_sarah.png");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("returns 404 for a missing image", async () => {
    const res = await app.request("/content/images/missing.png");

    expect(res.status).toBe(404);
  });

  it("does not serve files outside the images folder", async () => {
    const res = await app.request("/content/images/%2e%2e/units/index.json");

    expect(res.status).toBe(404);
  });
});

describe("resolveContentDir", () => {
  it("keeps an absolute CONTENT_DIR", () => {
    expect(resolveContentDir("/srv/content")).toBe("/srv/content");
  });

  it("resolves a relative CONTENT_DIR from the working directory", () => {
    expect(resolveContentDir("content")).toBe(join(process.cwd(), "content"));
  });
});
