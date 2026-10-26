import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.ts";
import { createMemorySettingsStore } from "../settings/settings.store.ts";
import {
  type AuthOptions,
  createAuth,
  SESSION_EPOCH_SETTING,
  type SessionEpochStore,
} from "./auth.ts";

const PASSWORD = "correct horse";
const baseOptions: AuthOptions = { password: PASSWORD, appSecret: "ab".repeat(32) };

function setup(options: Partial<AuthOptions> = {}) {
  const auth = createAuth({ ...baseOptions, ...options });
  const app = createApp({ pingDb: async () => true, auth });
  return { app };
}

/** Node server bindings as `getConnInfo` reads them: the TCP peer of the request. */
const peer = (remoteAddress: string) => ({ incoming: { socket: { remoteAddress } } });

const login = (
  app: ReturnType<typeof setup>["app"],
  password: string,
  url = "http://localhost/api/auth/login",
  { headers = {}, env }: { headers?: Record<string, string>; env?: object } = {},
) =>
  app.request(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ password }),
    },
    env,
  );

const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";

describe("auth routes", () => {
  it("logs in with the right password and sets a hardened session cookie", async () => {
    const { app } = setup();

    const res = await login(app, PASSWORD);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: true });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^ec_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Max-Age=2592000/);
    expect(setCookie).not.toMatch(/Secure/i);
  });

  it("marks the cookie Secure when not served from localhost", async () => {
    const { app } = setup();
    const res = await login(app, PASSWORD, "https://english.example.com/api/auth/login");
    expect(res.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("decides Secure by the request protocol, not the host name", async () => {
    const { app } = setup();

    const httpsLocal = await login(app, PASSWORD, "https://localhost/api/auth/login");
    expect(httpsLocal.headers.get("set-cookie")).toMatch(/Secure/i);

    // Plain http on a public host fails closed: only local dev hosts get a non-Secure cookie.
    const httpPublic = await login(app, PASSWORD, "http://english.example.com/api/auth/login");
    expect(httpPublic.headers.get("set-cookie")).toMatch(/Secure/i);

    for (const host of ["127.0.0.1", "app.localhost", "api:3000", "[::1]"]) {
      const res = await login(app, PASSWORD, `http://${host}/api/auth/login`);
      expect(res.headers.get("set-cookie"), host).not.toMatch(/Secure/i);
    }
  });

  it("honors an explicit cookieSecure override", async () => {
    const { app } = setup({ cookieSecure: true });
    const res = await login(app, PASSWORD);
    expect(res.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("rejects a wrong password without a cookie", async () => {
    const { app } = setup();

    const res = await login(app, "nope");

    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rate limits repeated failed logins", async () => {
    const { app } = setup();
    for (let i = 0; i < 5; i++) expect((await login(app, "nope")).status).toBe(401);

    const blocked = await login(app, PASSWORD);

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("900");
  });

  it("reserves an attempt before reading the body, so parallel guesses are capped", async () => {
    const { app } = setup();

    const results = await Promise.all(Array.from({ length: 20 }, () => login(app, "nope")));
    const statuses = results.map((res) => res.status);

    // Every request that passes the limiter reaches the password check and answers 401.
    expect(statuses.filter((status) => status !== 429).length).toBeLessThanOrEqual(5);
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThanOrEqual(15);
  });

  it("frees the attempt after a successful login", async () => {
    const { app } = setup();
    for (let i = 0; i < 4; i++) expect((await login(app, "nope")).status).toBe(401);
    expect((await login(app, PASSWORD)).status).toBe(200);

    for (let i = 0; i < 4; i++) expect((await login(app, "nope")).status).toBe(401);
    expect((await login(app, PASSWORD)).status).toBe(200);
  });

  it("reports the session on /me and clears it on logout", async () => {
    const { app } = setup();
    const cookie = cookieOf(await login(app, PASSWORD));

    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(200);
    expect((await app.request("/api/auth/me")).status).toBe(401);

    const out = await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });
    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ authenticated: false, revoked: true });
    expect(out.headers.get("set-cookie")).toMatch(/ec_session=;.*Max-Age=0/);
  });

  it("revokes every issued session on logout", async () => {
    const { app } = setup();
    const first = cookieOf(await login(app, PASSWORD));
    const second = cookieOf(await login(app, PASSWORD));

    await app.request("/api/auth/logout", { method: "POST", headers: { cookie: first } });

    expect((await app.request("/api/auth/me", { headers: { cookie: first } })).status).toBe(401);
    expect((await app.request("/api/auth/me", { headers: { cookie: second } })).status).toBe(401);
    const fresh = cookieOf(await login(app, PASSWORD));
    expect((await app.request("/api/auth/me", { headers: { cookie: fresh } })).status).toBe(200);
  });

  it("persists the session epoch so revoked sessions stay revoked after a restart", async () => {
    const store = createMemorySettingsStore();
    const before = setup({ epochStore: store }).app;
    const cookie = cookieOf(await login(before, PASSWORD));
    await before.request("/api/auth/logout", { method: "POST", headers: { cookie } });

    expect(store.settings.get(SESSION_EPOCH_SETTING)).toBe(1);
    const after = setup({ epochStore: store }).app;
    expect((await after.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
    const fresh = cookieOf(await login(after, PASSWORD));
    expect((await after.request("/api/auth/me", { headers: { cookie: fresh } })).status).toBe(200);
  });

  it("does not revoke sessions on a logout without a valid session", async () => {
    const store = createMemorySettingsStore();
    const { app } = setup({ epochStore: store });
    const cookie = cookieOf(await login(app, PASSWORD));

    const out = await app.request("/api/auth/logout", { method: "POST" });

    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ authenticated: false, revoked: false });
    expect(store.settings.has(SESSION_EPOCH_SETTING)).toBe(false);
    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(200);
  });

  it("expires sessions after the TTL", async () => {
    let clock = 1_800_000_000_000;
    const { app } = setup({ now: () => clock, sessionTtlMs: 1000 });
    const cookie = cookieOf(await login(app, PASSWORD));

    clock += 1000;

    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
  });
});

describe("login rate limit buckets", () => {
  const rotate = (i: number) => ({ "x-forwarded-for": `198.51.100.${i}` });

  it("ignores X-Forwarded-For from a public peer even with TRUST_PROXY on", async () => {
    const { app } = setup({ trustProxy: true });
    const env = peer("203.0.113.9");
    for (let i = 0; i < 5; i++) {
      expect((await login(app, "nope", undefined, { headers: rotate(i), env })).status).toBe(401);
    }

    const rotated = await login(app, PASSWORD, undefined, { headers: rotate(99), env });

    expect(rotated.status).toBe(429);
  });

  it("keys on the last X-Forwarded-For entry from a private or loopback proxy", async () => {
    const { app } = setup({ trustProxy: true });
    for (const proxy of ["172.18.0.1", "::ffff:127.0.0.1"]) {
      const env = peer(proxy);
      const client = { "x-forwarded-for": `spoofed, 198.51.100.${proxy.length}` };
      for (let i = 0; i < 5; i++) {
        expect((await login(app, "nope", undefined, { headers: client, env })).status).toBe(401);
      }
      expect((await login(app, PASSWORD, undefined, { headers: client, env })).status).toBe(429);
      const other = await login(app, PASSWORD, undefined, { headers: rotate(7), env });
      expect(other.status, proxy).toBe(200);
    }
  });

  it("keys on the socket address when TRUST_PROXY is off", async () => {
    const { app } = setup();
    const headers = { "x-forwarded-for": "198.51.100.1" };
    for (let i = 0; i < 5; i++) {
      expect((await login(app, "nope", undefined, { headers, env: peer("10.0.0.2") })).status).toBe(
        401,
      );
    }

    expect((await login(app, PASSWORD, undefined, { headers, env: peer("10.0.0.2") })).status).toBe(
      429,
    );
    expect((await login(app, PASSWORD, undefined, { headers, env: peer("10.0.0.3") })).status).toBe(
      200,
    );
  });
});

describe("session store failures", () => {
  afterEach(() => vi.restoreAllMocks());

  /** A settings store whose reads and writes can be made to reject. */
  function flakyStore() {
    const inner = createMemorySettingsStore();
    const state = { failGet: false, failPut: false };
    const store: SessionEpochStore = {
      getSetting: async (key) => {
        if (state.failGet) throw new Error("connection refused");
        return inner.getSetting(key);
      },
      putSetting: async (key, value) => {
        if (state.failPut) throw new Error("connection refused");
        await inner.putSetting(key, value);
      },
    };
    return { store, state };
  }

  /** A cookie signed by another process, so the app under test must read the epoch itself. */
  async function issuedCookie() {
    return cookieOf(await login(setup().app, PASSWORD));
  }

  it("answers 503 on protected routes and /me when the epoch cannot be read, without caching it", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const cookie = await issuedCookie();
    const { store, state } = flakyStore();
    const { app } = setup({ epochStore: store });
    state.failGet = true;

    const blocked = await app.request("/api/anything", { headers: { cookie } });
    expect(blocked.status).toBe(503);
    expect(await blocked.json()).toMatchObject({ error: "session-store-unavailable" });
    const me = await app.request("/api/auth/me", { headers: { cookie } });
    expect(me.status).toBe(503);
    expect(await me.json()).toMatchObject({ error: "session-store-unavailable" });
    expect(errors).toHaveBeenCalledTimes(2);

    state.failGet = false;
    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(200);
  });

  it("still answers 401 without a cookie, since no epoch read is needed", async () => {
    const { store, state } = flakyStore();
    const { app } = setup({ epochStore: store });
    state.failGet = true;

    expect((await app.request("/api/anything")).status).toBe(401);
    expect((await app.request("/api/auth/me")).status).toBe(401);
  });

  it("clears the cookie on logout when the epoch cannot be read", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const cookie = await issuedCookie();
    const { store, state } = flakyStore();
    const { app } = setup({ epochStore: store });
    state.failGet = true;

    const out = await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });

    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ authenticated: false, revoked: false });
    expect(out.headers.get("set-cookie")).toMatch(/ec_session=;.*Max-Age=0/);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("clears the cookie on logout when the epoch bump cannot be saved", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { store, state } = flakyStore();
    const { app } = setup({ epochStore: store });
    const cookie = cookieOf(await login(app, PASSWORD));
    state.failPut = true;

    const out = await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });

    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ authenticated: false, revoked: false });
    expect(out.headers.get("set-cookie")).toMatch(/ec_session=;.*Max-Age=0/);
    expect(errors).toHaveBeenCalledTimes(1);
  });
});

describe("auth middleware", () => {
  it("leaves health public and blocks other /api routes without a session", async () => {
    const { app } = setup();

    expect((await app.request("/api/health")).status).toBe(200);
    const blocked = await app.request("/api/anything");
    expect(blocked.status).toBe(401);
    expect(await blocked.json()).toEqual({ error: "unauthorized", message: "Log in first" });
  });

  it("lets an authenticated request through", async () => {
    const { app } = setup();
    const cookie = cookieOf(await login(app, PASSWORD));

    const res = await app.request("/api/anything", { headers: { cookie } });

    expect(res.status).toBe(404);
  });

  it("fails closed when the app is built without auth", async () => {
    const app = createApp({ pingDb: async () => true });
    expect((await app.request("/api/anything")).status).toBe(401);
    expect((await app.request("/api/health")).status).toBe(200);
  });
});
