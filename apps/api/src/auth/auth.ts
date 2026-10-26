import { LoginRequest, type SessionUser } from "@english-course/shared";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { UserRecord, UserStore } from "../users/users.store.ts";
import { DEFAULT_SCRYPT, hashPassword, normalizeEmail, verifyPassword } from "./password.ts";
import { createLoginRateLimiter, type LoginRateLimiter } from "./rate-limit.ts";
import { deriveSessionKey, readSession, signSession } from "./session.ts";
import { isTrustedProxyPeer, socketAddress } from "./trusted-proxy.ts";

export const SESSION_COOKIE = "ec_session";
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The authenticated account, as handlers read it with `c.get("user")`. */
export type AuthUser = { id: string } & SessionUser;

/** Hono env of every route behind `requireSession`. */
export type AppEnv = { Variables: { user: AuthUser } };

/** What auth needs from the user store. */
export type AuthUserStore = Pick<UserStore, "findByEmail" | "findById" | "bumpSessionEpoch">;

export type AuthOptions = {
  users: AuthUserStore;
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
  sessionTtlMs?: number;
  now?: () => number;
  rateLimiter?: LoginRateLimiter;
  /** Password check (tests count calls through it); defaults to scrypt verification. */
  verifyPassword?: (password: string, hash: string) => Promise<boolean>;
};

/** `unavailable`: the user store could not be read, so the cookie cannot be judged. */
export type SessionCheck =
  | { state: "valid"; user: AuthUser }
  | { state: "invalid" }
  | { state: "unavailable" };

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

const invalidCredentials = (c: Context) =>
  c.json({ error: "invalid_credentials", message: "Wrong email or password" }, 401);

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

const toAuthUser = ({ id, email, role }: UserRecord): AuthUser => ({ id, email, role });

/**
 * Hash checked when the email matches no user, so an unknown email costs the same scrypt work
 * as a wrong password (no account enumeration by timing). Created once, lazily.
 */
let decoyHash: Promise<string> | undefined;
const decoy = () => {
  decoyHash ??= hashPassword("decoy password that matches nothing", DEFAULT_SCRYPT);
  return decoyHash;
};

export function createAuth(options: AuthOptions): Auth {
  const { users } = options;
  const key = deriveSessionKey(options.appSecret);
  const now = options.now ?? Date.now;
  const ttlMs = options.sessionTtlMs ?? DEFAULT_TTL_MS;
  const limiter = options.rateLimiter ?? createLoginRateLimiter({ now });
  const checkPassword = options.verifyPassword ?? verifyPassword;

  /** Forwarded headers count only with TRUST_PROXY and a loopback/private socket peer. */
  const fromTrustedProxy = (c: Context) =>
    options.trustProxy === true && isTrustedProxyPeer(socketAddress(c));

  /** The client the proxy vouches for, else the socket peer. */
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
    const claims = token === undefined ? undefined : readSession(key, token, now());
    if (!claims) return { state: "invalid" };
    let user: UserRecord | undefined;
    try {
      user = await users.findById(claims.userId);
    } catch (error) {
      logStoreFailure("session check", error);
      return { state: "unavailable" };
    }
    return user && user.sessionEpoch === claims.epoch
      ? { state: "valid", user: toAuthUser(user) }
      : { state: "invalid" };
  };

  const routes = new Hono()
    .post("/login", async (c) => {
      const parsed = LoginRequest.safeParse(await c.req.json().catch(() => null));
      const email = parsed.success ? normalizeEmail(parsed.data.email) : "";
      // Bucket = account + client. Reserved synchronously before the user lookup and the
      // password check, so parallel guesses cannot share one check.
      const bucket = `${email}\n${clientKey(c)}`;
      const gate = limiter.consume(bucket);
      if (!gate.allowed) {
        c.header("Retry-After", String(gate.retryAfterSeconds));
        return c.json(
          { error: "rate_limited", message: "Too many attempts, try again later" },
          429,
        );
      }
      if (!parsed.success) return invalidCredentials(c);

      let user: UserRecord | undefined;
      try {
        user = await users.findByEmail(email);
      } catch (error) {
        logStoreFailure("login", error);
        return sessionStoreUnavailable(c);
      }
      const matches = await checkPassword(
        parsed.data.password,
        user?.passwordHash ?? (await decoy()),
      );
      if (!user || !matches) return invalidCredentials(c);

      limiter.reset(bucket);
      const token = signSession(key, {
        userId: user.id,
        epoch: user.sessionEpoch,
        expiresAt: now() + ttlMs,
      });
      setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "Strict",
        secure: secureFor(c),
        path: "/",
        maxAge: Math.floor(ttlMs / 1000),
      });
      return c.json({ authenticated: true, user: { email: user.email, role: user.role } });
    })
    .post("/logout", async (c) => {
      // Only a valid session may revoke, so anonymous requests cannot log anyone out.
      let revoked = false;
      const session = await checkSession(c);
      if (session.state === "valid") {
        try {
          await users.bumpSessionEpoch(session.user.id);
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
      if (session.state === "unavailable") return sessionStoreUnavailable(c);
      if (session.state === "invalid") return unauthorized(c);
      const { email, role } = session.user;
      return c.json({ authenticated: true, user: { email, role } });
    });

  return { routes, checkSession };
}

/**
 * Protects every route it wraps and exposes the account as `c.get("user")`; without an auth
 * config it fails closed.
 */
export function requireSession(auth: Auth | undefined): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session: SessionCheck = auth ? await auth.checkSession(c) : { state: "invalid" };
    if (session.state === "unavailable") return sessionStoreUnavailable(c);
    if (session.state === "invalid") return unauthorized(c);
    c.set("user", session.user);
    await next();
  };
}
