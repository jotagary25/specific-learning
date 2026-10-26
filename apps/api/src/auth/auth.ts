import { LoginRequest } from "@english-course/shared";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { passwordMatches } from "./password.ts";
import { createLoginRateLimiter, type LoginRateLimiter } from "./rate-limit.ts";
import { deriveSessionKey, signSession, verifySession } from "./session.ts";

export const SESSION_COOKIE = "ec_session";
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthOptions = {
  password: string;
  /** APP_SECRET (64 hex chars). */
  appSecret: string;
  /** `auto` (default): Secure unless the request host is local. */
  cookieSecure?: "auto" | boolean;
  /**
   * Behind a trusted TLS-terminating proxy, `auto` follows `X-Forwarded-Proto` instead of
   * the request host. Leave off when clients can reach the api directly (the header is spoofable).
   */
  trustProxy?: boolean;
  sessionTtlMs?: number;
  now?: () => number;
  rateLimiter?: LoginRateLimiter;
  /** Rate-limit bucket for a request (e.g. the client IP). Defaults to one global bucket. */
  clientKey?: (c: Context) => string;
};

export type Auth = {
  routes: Hono;
  isAuthenticated: (c: Context) => boolean;
};

/**
 * Local hosts get a non-Secure cookie so plain-http dev works: loopback names, `*.localhost`
 * and single-label hosts (e.g. the `api` compose service behind the Vite proxy).
 */
function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host.startsWith("127.") ||
    (!host.includes(".") && !host.includes(":"))
  );
}

const unauthorized = (c: Context) =>
  c.json({ error: "unauthorized", message: "Log in first" }, 401);

export function createAuth(options: AuthOptions): Auth {
  const key = deriveSessionKey(options.appSecret, options.password);
  const now = options.now ?? Date.now;
  const ttlMs = options.sessionTtlMs ?? DEFAULT_TTL_MS;
  const limiter = options.rateLimiter ?? createLoginRateLimiter({ now });
  const clientKey = options.clientKey ?? (() => "global");

  const secureFor = (c: Context) => {
    const setting = options.cookieSecure ?? "auto";
    if (setting !== "auto") return setting;
    const forwardedProto = options.trustProxy
      ? c.req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase()
      : undefined;
    if (forwardedProto) return forwardedProto === "https";
    return !isLocalHost(new URL(c.req.url).hostname);
  };

  const isAuthenticated = (c: Context) => {
    const token = getCookie(c, SESSION_COOKIE);
    return token !== undefined && verifySession(key, token, now());
  };

  const routes = new Hono()
    .post("/login", async (c) => {
      const bucket = clientKey(c);
      const gate = limiter.check(bucket);
      if (!gate.allowed) {
        c.header("Retry-After", String(gate.retryAfterSeconds));
        return c.json(
          { error: "rate_limited", message: "Too many attempts, try again later" },
          429,
        );
      }
      const parsed = LoginRequest.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success || !passwordMatches(parsed.data.password, options.password)) {
        limiter.fail(bucket);
        return c.json({ error: "invalid_credentials", message: "Wrong password" }, 401);
      }
      limiter.reset(bucket);
      setCookie(c, SESSION_COOKIE, signSession(key, now() + ttlMs), {
        httpOnly: true,
        sameSite: "Strict",
        secure: secureFor(c),
        path: "/",
        maxAge: Math.floor(ttlMs / 1000),
      });
      return c.json({ authenticated: true });
    })
    .post("/logout", (c) => {
      deleteCookie(c, SESSION_COOKIE, {
        path: "/",
        secure: secureFor(c),
        httpOnly: true,
        sameSite: "Strict",
      });
      return c.json({ authenticated: false });
    })
    .get("/me", (c) => (isAuthenticated(c) ? c.json({ authenticated: true }) : unauthorized(c)));

  return { routes, isAuthenticated };
}

/** Protects every route it wraps; without an auth config it fails closed. */
export function requireSession(auth: Auth | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!auth?.isAuthenticated(c)) return unauthorized(c);
    await next();
  };
}
