import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.ts";
import { REPO_CONTENT_DIR } from "../content/content-dir.test-support.ts";
import { createMemoryUserStore, type UserStore } from "../users/users.store.ts";
import { addTestUser, TEST_EMAIL, TEST_PASSWORD, TEST_SECRET } from "./auth.test-support.ts";
import { type AuthOptions, createAuth } from "./auth.ts";
import { verifyPassword } from "./password.ts";

const PASSWORD = TEST_PASSWORD;
const EMAIL = TEST_EMAIL;
const OTHER_EMAIL = "second@example.com";
const OTHER_PASSWORD = "another long passphrase";

async function setup(options: Partial<AuthOptions> = {}) {
  const users = createMemoryUserStore();
  const user = await addTestUser(users);
  const other = await addTestUser(users, OTHER_EMAIL, OTHER_PASSWORD, "learner");
  const auth = createAuth({ users, appSecret: TEST_SECRET, ...options });
  const app = createApp({ contentDir: REPO_CONTENT_DIR, pingDb: async () => true, auth });
  return { app, users, user, other };
}

/** Node server bindings as `getConnInfo` reads them: the TCP peer of the request. */
const peer = (remoteAddress: string) => ({ incoming: { socket: { remoteAddress } } });

type TestApp = Awaited<ReturnType<typeof setup>>["app"];

const login = (
  app: TestApp,
  password: string,
  url = "http://localhost/api/auth/login",
  {
    headers = {},
    env,
    email = EMAIL,
  }: { headers?: Record<string, string>; env?: object; email?: string } = {},
) =>
  app.request(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ email, password }),
    },
    env,
  );

const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";

describe("auth routes", () => {
  it("logs in with email and password and sets a hardened session cookie", async () => {
    const { app } = await setup();

    const res = await login(app, PASSWORD);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      authenticated: true,
      user: { email: EMAIL, role: "admin" },
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^ec_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Max-Age=2592000/);
    expect(setCookie).not.toMatch(/Secure/i);
  });

  it("matches the email case-insensitively and ignores surrounding spaces", async () => {
    const { app } = await setup();

    const res = await login(app, PASSWORD, undefined, { email: "  Learner@EXAMPLE.com " });

    expect(res.status).toBe(200);
  });

  it("marks the cookie Secure when not served from localhost", async () => {
    const { app } = await setup();
    const res = await login(app, PASSWORD, "https://english.example.com/api/auth/login");
    expect(res.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("decides Secure by the request protocol, not the host name", async () => {
    const { app } = await setup();

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

  it("answers a wrong password and an unknown email the same way, without a cookie", async () => {
    const { app } = await setup();

    const wrongPassword = await login(app, "nope");
    const unknownEmail = await login(app, PASSWORD, undefined, { email: "ghost@example.com" });
    const malformed = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: PASSWORD }),
    });

    for (const res of [wrongPassword, unknownEmail, malformed]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: "invalid_credentials",
        message: "Wrong email or password",
      });
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("does not log in one user with another user's password", async () => {
    const { app } = await setup();
    expect((await login(app, OTHER_PASSWORD)).status).toBe(401);
    expect((await login(app, OTHER_PASSWORD, undefined, { email: OTHER_EMAIL })).status).toBe(200);
  });

  it("rate limits repeated failed logins for one account and client", async () => {
    const { app } = await setup();
    for (let i = 0; i < 5; i++) expect((await login(app, "nope")).status).toBe(401);

    const blocked = await login(app, PASSWORD);

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("900");
    // Another account from the same client has its own bucket.
    expect((await login(app, OTHER_PASSWORD, undefined, { email: OTHER_EMAIL })).status).toBe(200);
  });

  it("keys the limit on the normalized email, so case changes do not reset it", async () => {
    const { app } = await setup();
    for (let i = 0; i < 5; i++) {
      const email = i % 2 === 0 ? EMAIL.toUpperCase() : ` ${EMAIL}`;
      expect((await login(app, "nope", undefined, { email })).status).toBe(401);
    }
    expect((await login(app, PASSWORD)).status).toBe(429);
  });

  it("caps parallel guesses for one email before password verification", async () => {
    let verified = 0;
    const { app } = await setup({
      verifyPassword: async (password, hash) => {
        verified += 1;
        return verifyPassword(password, hash);
      },
    });

    const results = await Promise.all(Array.from({ length: 20 }, () => login(app, "nope")));
    const statuses = results.map((res) => res.status);

    expect(verified).toBeLessThanOrEqual(5);
    expect(statuses.filter((status) => status !== 429).length).toBeLessThanOrEqual(5);
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThanOrEqual(15);
  });

  it("frees the attempt after a successful login", async () => {
    const { app } = await setup();
    for (let i = 0; i < 4; i++) expect((await login(app, "nope")).status).toBe(401);
    expect((await login(app, PASSWORD)).status).toBe(200);

    for (let i = 0; i < 4; i++) expect((await login(app, "nope")).status).toBe(401);
    expect((await login(app, PASSWORD)).status).toBe(200);
  });

  it("reports the signed-in user on /me and clears the session on logout", async () => {
    const { app } = await setup();
    const cookie = cookieOf(await login(app, PASSWORD));

    const me = await app.request("/api/auth/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ authenticated: true, user: { email: EMAIL, role: "admin" } });
    expect((await app.request("/api/auth/me")).status).toBe(401);

    const out = await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });
    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ authenticated: false, revoked: true });
    expect(out.headers.get("set-cookie")).toMatch(/ec_session=;.*Max-Age=0/);
  });

  it("revokes every session of the user on logout, and only that user's", async () => {
    const { app, users, user } = await setup();
    const first = cookieOf(await login(app, PASSWORD));
    const second = cookieOf(await login(app, PASSWORD));
    const otherUser = cookieOf(await login(app, OTHER_PASSWORD, undefined, { email: OTHER_EMAIL }));

    await app.request("/api/auth/logout", { method: "POST", headers: { cookie: first } });

    expect((await app.request("/api/auth/me", { headers: { cookie: first } })).status).toBe(401);
    expect((await app.request("/api/auth/me", { headers: { cookie: second } })).status).toBe(401);
    expect((await app.request("/api/auth/me", { headers: { cookie: otherUser } })).status).toBe(
      200,
    );
    expect(users.users.get(user.id)?.sessionEpoch).toBe(1);
    const fresh = cookieOf(await login(app, PASSWORD));
    expect((await app.request("/api/auth/me", { headers: { cookie: fresh } })).status).toBe(200);
  });

  it("keeps revoked sessions revoked after a restart (the epoch lives in the user row)", async () => {
    const { app: before, users } = await setup();
    const cookie = cookieOf(await login(before, PASSWORD));
    await before.request("/api/auth/logout", { method: "POST", headers: { cookie } });

    const after = createApp({
      contentDir: REPO_CONTENT_DIR,
      pingDb: async () => true,
      auth: createAuth({ users, appSecret: TEST_SECRET }),
    });
    expect((await after.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
    const fresh = cookieOf(await login(after, PASSWORD));
    expect((await after.request("/api/auth/me", { headers: { cookie: fresh } })).status).toBe(200);
  });

  it("ends sessions when the user's epoch is bumped elsewhere (password change)", async () => {
    const { app, users, user } = await setup();
    const cookie = cookieOf(await login(app, PASSWORD));

    await users.update(user.id, { revokeSessions: true });

    expect((await app.request("/api/anything", { headers: { cookie } })).status).toBe(401);
  });

  it("rejects the session of a user that no longer exists", async () => {
    const { app, users, user } = await setup();
    const cookie = cookieOf(await login(app, PASSWORD));

    users.users.delete(user.id);

    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
  });

  it("does not revoke sessions on a logout without a valid session", async () => {
    const { app, users, user } = await setup();
    const cookie = cookieOf(await login(app, PASSWORD));

    const out = await app.request("/api/auth/logout", { method: "POST" });

    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ authenticated: false, revoked: false });
    expect(users.users.get(user.id)?.sessionEpoch).toBe(0);
    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(200);
  });

  it("expires sessions after the TTL", async () => {
    let clock = 1_800_000_000_000;
    const { app } = await setup({ now: () => clock, sessionTtlMs: 1000 });
    const cookie = cookieOf(await login(app, PASSWORD));

    clock += 1000;

    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
  });
});

describe("login rate limit buckets", () => {
  const rotate = (i: number) => ({ "x-forwarded-for": `198.51.100.${i}` });

  it("ignores X-Forwarded-For from a public peer even with TRUST_PROXY on", async () => {
    const { app } = await setup({ trustProxy: true });
    const env = peer("203.0.113.9");
    for (let i = 0; i < 5; i++) {
      expect((await login(app, "nope", undefined, { headers: rotate(i), env })).status).toBe(401);
    }

    const rotated = await login(app, PASSWORD, undefined, { headers: rotate(99), env });

    expect(rotated.status).toBe(429);
  });

  it("keys on the last X-Forwarded-For entry from a private or loopback proxy", async () => {
    const { app } = await setup({ trustProxy: true });
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
    const { app } = await setup();
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

  /** A user store whose reads and epoch bumps can be made to reject. */
  async function flakyStore() {
    const inner = createMemoryUserStore();
    await addTestUser(inner);
    const state = { failGet: false, failPut: false };
    const fail = () => {
      throw new Error("connection refused");
    };
    const store: UserStore = {
      ...inner,
      findById: async (id) => (state.failGet ? fail() : inner.findById(id)),
      findByEmail: async (email) => (state.failGet ? fail() : inner.findByEmail(email)),
      bumpSessionEpoch: async (id) => (state.failPut ? fail() : inner.bumpSessionEpoch(id)),
    };
    return { store, state };
  }

  async function flakyApp() {
    const { store, state } = await flakyStore();
    const app = createApp({
      contentDir: REPO_CONTENT_DIR,
      pingDb: async () => true,
      auth: createAuth({ users: store, appSecret: TEST_SECRET }),
    });
    return { app, state };
  }

  it("answers 503 on protected routes and /me when the user cannot be read, without caching it", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, state } = await flakyApp();
    const cookie = cookieOf(await login(app, PASSWORD));
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

  it("answers 503 on login when the user cannot be read", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, state } = await flakyApp();
    state.failGet = true;

    const res = await login(app, PASSWORD);

    expect(res.status).toBe(503);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("still answers 401 without a cookie, since no user read is needed", async () => {
    const { app, state } = await flakyApp();
    state.failGet = true;

    expect((await app.request("/api/anything")).status).toBe(401);
    expect((await app.request("/api/auth/me")).status).toBe(401);
  });

  it("clears the cookie on logout when the user cannot be read", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, state } = await flakyApp();
    const cookie = cookieOf(await login(app, PASSWORD));
    state.failGet = true;

    const out = await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });

    expect(out.status).toBe(200);
    expect(await out.json()).toEqual({ authenticated: false, revoked: false });
    expect(out.headers.get("set-cookie")).toMatch(/ec_session=;.*Max-Age=0/);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("clears the cookie on logout when the epoch bump cannot be saved", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, state } = await flakyApp();
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
    const { app } = await setup();

    expect((await app.request("/api/health")).status).toBe(200);
    const blocked = await app.request("/api/anything");
    expect(blocked.status).toBe(401);
    expect(await blocked.json()).toEqual({ error: "unauthorized", message: "Log in first" });
  });

  it("lets an authenticated request through", async () => {
    const { app } = await setup();
    const cookie = cookieOf(await login(app, PASSWORD));

    const res = await app.request("/api/anything", { headers: { cookie } });

    expect(res.status).toBe(404);
  });

  it("fails closed when the app is built without auth", async () => {
    const app = createApp({ contentDir: REPO_CONTENT_DIR, pingDb: async () => true });
    expect((await app.request("/api/anything")).status).toBe(401);
    expect((await app.request("/api/health")).status).toBe(200);
  });
});
