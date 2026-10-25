import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { resolveContentDir } from "./content-dir.ts";

const app = createApp({ pingDb: async () => true, contentDir: resolveContentDir({}) });

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
  it("prefers CONTENT_DIR when set", () => {
    expect(resolveContentDir({ CONTENT_DIR: "/srv/content" })).toBe("/srv/content");
  });

  it("defaults to the repo content folder", () => {
    expect(resolveContentDir({})).toMatch(/[/\\]content$/);
  });
});
