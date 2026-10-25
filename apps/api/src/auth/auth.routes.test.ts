import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { type AuthOptions, createAuth } from "./auth.ts";

const PASSWORD = "correct horse";
const baseOptions: AuthOptions = { password: PASSWORD, appSecret: "ab".repeat(32) };

function setup(options: Partial<AuthOptions> = {}) {
  const auth = createAuth({ ...baseOptions, ...options });
  const app = createApp({ pingDb: async () => true, auth });
  return { app };
}

const login = (
  app: ReturnType<typeof setup>["app"],
  password: string,
  url = "http://localhost/api/auth/login",
) =>
  app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });

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

  it("reports the session on /me and clears it on logout", async () => {
    const { app } = setup();
    const cookie = cookieOf(await login(app, PASSWORD));

    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(200);
    expect((await app.request("/api/auth/me")).status).toBe(401);

    const out = await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/ec_session=;.*Max-Age=0/);
  });

  it("expires sessions after the TTL", async () => {
    let clock = 1_800_000_000_000;
    const { app } = setup({ now: () => clock, sessionTtlMs: 1000 });
    const cookie = cookieOf(await login(app, PASSWORD));

    clock += 1000;

    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
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
