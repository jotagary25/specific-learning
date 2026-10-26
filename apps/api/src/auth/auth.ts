import { LoginRequest } from "@english-course/shared";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { passwordMatches } from "./password.ts";
import { createLoginRateLimiter, type LoginRateLimiter } from "./rate-limit.ts";
import { deriveSessionKey, signSession, verifySession } from "./session.ts";

export const SESSION_COOKIE = "ec_session";
/** `setting` row holding the session epoch (integer): bumping it revokes every session. */
export const SESSION_EPOCH_SETTING = "auth.sessionEpoch";
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Key/value persistence for the session epoch (the settings store satisfies it). */
export type SessionEpochStore = {
  getSetting(key: string): Promise<unknown>;
  putSetting(key: string, value: unknown): Promise<void>;
};

function createMemoryEpochStore(): SessionEpochStore {
  const values = new Map<string, unknown>();
  return {
    getSetting: async (key) => values.get(key),
    putSetting: async (key, value) => void values.set(key, value),
  };
}

export type AuthOptions = {
  password: string;
  /** APP_SECRET (64 hex chars). */
  appSecret: string;
  /**
   * `auto` (default): Secure for https requests; plain http gets a non-Secure cookie only on a
   * local host (loopback, `*.localhost`, single-label) so http dev works.
   */
  cookieSecure?: "auto" | boolean;
  /**
   * Behind a trusted TLS-terminating proxy, `auto` follows `X-Forwarded-Proto` alone (Secure
   * when it is missing). Leave off when clients can reach the api directly (the header is spoofable).
   */
  trustProxy?: boolean;
  /**
   * Where the session epoch lives (the `setting` table in production). Logout bumps it, which
   * revokes every session: fine for this single-user app. Defaults to process memory.
   */
  epochStore?: SessionEpochStore;
  sessionTtlMs?: number;
  now?: () => number;
  rateLimiter?: LoginRateLimiter;
  /** Rate-limit bucket for a request (e.g. the client IP). Defaults to one global bucket. */
  clientKey?: (c: Context) => string;
};

export type Auth = {
  routes: Hono;
  isAuthenticated: (c: Context) => Promise<boolean>;
};

/**
 * Hosts allowed a non-Secure cookie over plain http in dev: loopback names, `*.localhost`
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
  const epochStore = options.epochStore ?? createMemoryEpochStore();

  // Write-through cache: read once per process, updated after every successful persist.
  let epochCache: Promise<number> | undefined;
  const currentEpoch = () => {
    epochCache ??= epochStore.getSetting(SESSION_EPOCH_SETTING).then(
      (value) => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : 0),
      (error: unknown) => {
        epochCache = undefined;
        throw error;
      },
    );
    return epochCache;
  };
  const revokeAllSessions = async () => {
    const next = (await currentEpoch()) + 1;
    await epochStore.putSetting(SESSION_EPOCH_SETTING, next);
    epochCache = Promise.resolve(next);
  };

  const secureFor = (c: Context) => {
    const setting = options.cookieSecure ?? "auto";
    if (setting !== "auto") return setting;
    if (options.trustProxy) {
      const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
      // A trusted proxy must say how the client connected; without it, fail closed.
      return forwardedProto ? forwardedProto.toLowerCase() === "https" : true;
    }
    const url = new URL(c.req.url);
    return url.protocol === "https:" || !isLocalHost(url.hostname);
  };

  const isAuthenticated = async (c: Context) => {
    const token = getCookie(c, SESSION_COOKIE);
    return token !== undefined && verifySession(key, token, now(), await currentEpoch());
  };

  const routes = new Hono()
    .post("/login", async (c) => {
      const bucket = clientKey(c);
      // Reserve the attempt before any await, so parallel requests cannot share one check.
      const gate = limiter.consume(bucket);
      if (!gate.allowed) {
        c.header("Retry-After", String(gate.retryAfterSeconds));
        return c.json(
          { error: "rate_limited", message: "Too many attempts, try again later" },
          429,
        );
      }
      const parsed = LoginRequest.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success || !passwordMatches(parsed.data.password, options.password)) {
        return c.json({ error: "invalid_credentials", message: "Wrong password" }, 401);
      }
      limiter.reset(bucket);
      setCookie(c, SESSION_COOKIE, signSession(key, now() + ttlMs, await currentEpoch()), {
        httpOnly: true,
        sameSite: "Strict",
        secure: secureFor(c),
        path: "/",
        maxAge: Math.floor(ttlMs / 1000),
      });
      return c.json({ authenticated: true });
    })
    .post("/logout", async (c) => {
      // Only a valid session may revoke, so anonymous requests cannot log the user out.
      if (await isAuthenticated(c)) await revokeAllSessions();
      deleteCookie(c, SESSION_COOKIE, {
        path: "/",
        secure: secureFor(c),
        httpOnly: true,
        sameSite: "Strict",
      });
      return c.json({ authenticated: false });
    })
    .get("/me", async (c) =>
      (await isAuthenticated(c)) ? c.json({ authenticated: true }) : unauthorized(c),
    );

  return { routes, isAuthenticated };
}

/** Protects every route it wraps; without an auth config it fails closed. */
export function requireSession(auth: Auth | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!(await auth?.isAuthenticated(c))) return unauthorized(c);
    await next();
  };
}
