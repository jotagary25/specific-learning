import { LoginRequest } from "@english-course/shared";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { passwordMatches } from "./password.ts";
import { createLoginRateLimiter, type LoginRateLimiter } from "./rate-limit.ts";
import { deriveSessionKey, signSession, verifySession } from "./session.ts";
import { isTrustedProxyPeer, socketAddress } from "./trusted-proxy.ts";

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
   * Behind a TLS-terminating reverse proxy: `X-Forwarded-Proto` decides `auto` (Secure when it
   * is missing) and the last `X-Forwarded-For` entry keys the login rate limit. Both headers
   * are honored only when the socket peer is loopback or private (the proxy); any other peer
   * falls back to its own address and the request protocol.
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
};

/** `unavailable`: the session epoch could not be read, so the cookie cannot be judged. */
export type SessionCheck = "valid" | "invalid" | "unavailable";

export type Auth = {
  routes: Hono;
  checkSession: (c: Context) => Promise<SessionCheck>;
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

/** 503, not 401: the web shows "Server unavailable" instead of sending the user to login. */
const sessionStoreUnavailable = (c: Context) =>
  c.json(
    { error: "session-store-unavailable", message: "Session store unavailable, try again later" },
    503,
  );

const logStoreFailure = (action: string, error: unknown) =>
  console.error(
    `auth: session store unavailable during ${action}: ${error instanceof Error ? error.message : String(error)}`,
  );

export function createAuth(options: AuthOptions): Auth {
  const key = deriveSessionKey(options.appSecret, options.password);
  const now = options.now ?? Date.now;
  const ttlMs = options.sessionTtlMs ?? DEFAULT_TTL_MS;
  const limiter = options.rateLimiter ?? createLoginRateLimiter({ now });
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

  /** Forwarded headers count only with TRUST_PROXY and a loopback/private socket peer. */
  const fromTrustedProxy = (c: Context) =>
    options.trustProxy === true && isTrustedProxyPeer(socketAddress(c));

  /** Login rate-limit bucket: the client the proxy vouches for, else the socket peer. */
  const clientKey = (c: Context) => {
    // The proxy appends the address it saw, so the last entry is the one it vouches for.
    const forwarded = fromTrustedProxy(c)
      ? c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim()
      : undefined;
    return forwarded || (socketAddress(c) ?? "unknown");
  };

  const secureFor = (c: Context) => {
    const setting = options.cookieSecure ?? "auto";
    if (setting !== "auto") return setting;
    if (fromTrustedProxy(c)) {
      const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
      // A trusted proxy must say how the client connected; without it, fail closed.
      return forwardedProto ? forwardedProto.toLowerCase() === "https" : true;
    }
    const url = new URL(c.req.url);
    return url.protocol === "https:" || !isLocalHost(url.hostname);
  };

  const checkSession = async (c: Context): Promise<SessionCheck> => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token === undefined) return "invalid";
    let epoch: number;
    try {
      epoch = await currentEpoch();
    } catch (error) {
      logStoreFailure("session check", error);
      return "unavailable";
    }
    return verifySession(key, token, now(), epoch) ? "valid" : "invalid";
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
      let revoked = false;
      if ((await checkSession(c)) === "valid") {
        try {
          await revokeAllSessions();
          revoked = true;
        } catch (error) {
          logStoreFailure("logout", error);
        }
      }
      // This browser is logged out either way, even when the revocation could not be saved.
      deleteCookie(c, SESSION_COOKIE, {
        path: "/",
        secure: secureFor(c),
        httpOnly: true,
        sameSite: "Strict",
      });
      return c.json({ authenticated: false, revoked });
    })
    .get("/me", async (c) => {
      const session = await checkSession(c);
      if (session === "unavailable") return sessionStoreUnavailable(c);
      return session === "valid" ? c.json({ authenticated: true }) : unauthorized(c);
    });

  return { routes, checkSession };
}

/** Protects every route it wraps; without an auth config it fails closed. */
export function requireSession(auth: Auth | undefined): MiddlewareHandler {
  return async (c, next) => {
    const session = auth ? await auth.checkSession(c) : "invalid";
    if (session === "unavailable") return sessionStoreUnavailable(c);
    if (session !== "valid") return unauthorized(c);
    await next();
  };
}
