import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { addTestUser, TEST_EMAIL, TEST_PASSWORD, TEST_SECRET } from "../auth/auth.test-support.ts";
import { type AuthOptions, createAuth } from "../auth/auth.ts";
import { resolveContentDir } from "../content/content-dir.ts";
import { loadConfig } from "../shared/config.ts";
import { createMemoryUserStore } from "../users/users.store.ts";

const INDEX = '<!doctype html><html lang="en"><body><div id="root"></div></body></html>';

const distDir = mkdtempSync(join(tmpdir(), "web-dist-"));
writeFileSync(join(distDir, "index.html"), INDEX);
writeFileSync(join(distDir, "manifest.webmanifest"), JSON.stringify({ name: "English Course" }));
writeFileSync(join(distDir, "sw.js"), "self.addEventListener('install', () => {});");
mkdirSync(join(distDir, "assets"));
writeFileSync(join(distDir, "assets", "index-abc123.js"), "console.log('app');");

afterAll(() => rmSync(distDir, { recursive: true, force: true }));

const users = createMemoryUserStore();
await addTestUser(users);
const authOptions: AuthOptions = { users, appSecret: TEST_SECRET };
const contentDir = resolveContentDir({});

const prodApp = (auth = createAuth(authOptions)) =>
  createApp({ pingDb: async () => true, contentDir, webDistDir: distDir, auth });

const login = (
  app: ReturnType<typeof prodApp>,
  url: string,
  headers: Record<string, string>,
  env?: object,
) =>
  app.request(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    },
    env,
  );

/** Node server bindings as `getConnInfo` reads them: the TCP peer of the request. */
const peer = (remoteAddress: string) => ({ incoming: { socket: { remoteAddress } } });

describe("web build serving (WEB_DIST_DIR set)", () => {
  const app = prodApp();

  it("serves index.html at / without long-lived caching", async () => {
    const res = await app.request("/");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe(INDEX);
  });

  it("falls back to index.html for client-side routes", async () => {
    for (const path of ["/units", "/units/3", "/reading/history?x=1", "/settings/eval"]) {
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).toBe(INDEX);
    }
  });

  it("serves built files with their content type and caches hashed assets forever", async () => {
    const manifest = await app.request("/manifest.webmanifest");
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("content-type")).toMatch(/application\/manifest\+json/);
    expect(manifest.headers.get("cache-control")).toBe("no-cache");

    const sw = await app.request("/sw.js");
    expect(sw.status).toBe(200);
    expect(sw.headers.get("cache-control")).toBe("no-cache");

    const asset = await app.request("/assets/index-abc123.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("answers 404 for a missing file instead of HTML", async () => {
    const res = await app.request("/assets/index-gone.js");

    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("leaves /api untouched: public, protected and unknown routes keep their answers", async () => {
    const health = await app.request("/api/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok", db: "ok" });

    const protectedRoute = await app.request("/api/units");
    expect(protectedRoute.status).toBe(401);

    const cookie =
      (await login(app, "http://localhost/api/auth/login", {})).headers
        .get("set-cookie")
        ?.split(";")[0] ?? "";
    const unknown = await app.request("/api/does-not-exist", { headers: { cookie } });
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("content-type") ?? "").not.toMatch(/text\/html/);
  });

  it("leaves /content untouched: images served, missing ones 404", async () => {
    const image = await app.request("/content/images/unit_001_sarah.png");
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");

    const missing = await app.request("/content/images/missing.png");
    expect(missing.status).toBe(404);
  });

  it("does not fall back for non-GET requests", async () => {
    const res = await app.request("/units", { method: "POST" });

    expect(res.status).toBe(404);
  });
});

describe("without WEB_DIST_DIR (dev)", () => {
  const app = createApp({ pingDb: async () => true, contentDir });

  it("does not serve the SPA", async () => {
    expect((await app.request("/")).status).toBe(404);
    expect((await app.request("/units")).status).toBe(404);
    expect((await app.request("/api/health")).status).toBe(200);
  });
});

describe("Secure session cookie behind a reverse proxy", () => {
  // The proxy talks to the container over plain http on a single-label host, from the
  // docker network (a private address).
  const upstream = "http://app:3000/api/auth/login";
  const proxy = peer("172.18.0.1");

  it("follows X-Forwarded-Proto from a private proxy when TRUST_PROXY is on", async () => {
    const app = prodApp(createAuth({ ...authOptions, trustProxy: true }));

    const https = await login(app, upstream, { "x-forwarded-proto": "https" }, proxy);
    expect(https.headers.get("set-cookie")).toMatch(/Secure/i);

    const http = await login(app, upstream, { "x-forwarded-proto": "http" }, proxy);
    expect(http.headers.get("set-cookie")).not.toMatch(/Secure/i);

    const chained = await login(app, upstream, { "x-forwarded-proto": "https, http" }, proxy);
    expect(chained.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("ignores X-Forwarded-Proto from a public peer even when TRUST_PROXY is on", async () => {
    const app = prodApp(createAuth({ ...authOptions, trustProxy: true }));
    const direct = peer("203.0.113.9");

    const spoofedHttps = await login(app, upstream, { "x-forwarded-proto": "https" }, direct);
    expect(spoofedHttps.headers.get("set-cookie")).not.toMatch(/Secure/i);

    const spoofedHttp = await login(
      app,
      "https://english.example.com/api/auth/login",
      { "x-forwarded-proto": "http" },
      direct,
    );
    expect(spoofedHttp.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("ignores X-Forwarded-Proto when TRUST_PROXY is off", async () => {
    const app = prodApp();

    const res = await login(app, upstream, { "x-forwarded-proto": "https" });
    expect(res.headers.get("set-cookie")).not.toMatch(/Secure/i);
  });

  it("fails closed (Secure) when a trusted proxy sends no X-Forwarded-Proto", async () => {
    const app = prodApp(createAuth({ ...authOptions, trustProxy: true }));

    const local = await login(app, upstream, {}, proxy);
    expect(local.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("keeps an explicit COOKIE_SECURE=false even when the proxy says https", async () => {
    const app = prodApp(createAuth({ ...authOptions, trustProxy: true, cookieSecure: false }));

    const res = await login(app, upstream, { "x-forwarded-proto": "https" }, proxy);
    expect(res.headers.get("set-cookie")).not.toMatch(/Secure/i);
  });
});

describe("deployment config", () => {
  const base = {
    DATABASE_URL: "postgres://u:p@localhost:5432/db",
    APP_USER_EMAIL: "admin@example.com",
    APP_USER_PASSWORD: "a long enough passphrase",
    APP_SECRET: "ab".repeat(32),
  };

  it("defaults TRUST_PROXY to false and WEB_DIST_DIR to unset", () => {
    const config = loadConfig(base);
    expect(config.TRUST_PROXY).toBe(false);
    expect(config.WEB_DIST_DIR).toBeUndefined();
  });

  it("parses TRUST_PROXY and WEB_DIST_DIR", () => {
    const config = loadConfig({ ...base, TRUST_PROXY: "true", WEB_DIST_DIR: "/app/web" });
    expect(config.TRUST_PROXY).toBe(true);
    expect(config.WEB_DIST_DIR).toBe("/app/web");
  });

  it("rejects an invalid TRUST_PROXY value", () => {
    expect(() => loadConfig({ ...base, TRUST_PROXY: "yes" })).toThrow(/TRUST_PROXY/);
  });

  it("requires the admin email and a password of at least 12 characters", () => {
    const { APP_USER_EMAIL: _email, ...noEmail } = base;
    const { APP_USER_PASSWORD: _password, ...noPassword } = base;

    expect(() => loadConfig(noEmail)).toThrow(/APP_USER_EMAIL/);
    expect(() => loadConfig(noPassword)).toThrow(/APP_USER_PASSWORD/);
    expect(() => loadConfig({ ...base, APP_USER_EMAIL: "not-an-email" })).toThrow(/APP_USER_EMAIL/);
    expect(() => loadConfig({ ...base, APP_USER_PASSWORD: "elevenchars" })).toThrow(
      /at least 12 characters/,
    );
  });

  it("no longer accepts APP_PASSWORD in place of the admin credentials", () => {
    const { APP_USER_EMAIL: _e, APP_USER_PASSWORD: _p, ...rest } = base;
    expect(() => loadConfig({ ...rest, APP_PASSWORD: "a long enough passphrase" })).toThrow(
      /APP_USER_EMAIL/,
    );
  });
});
