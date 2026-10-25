import { describe, expect, it } from "vitest";
import { passwordMatches } from "./password.ts";
import { createLoginRateLimiter } from "./rate-limit.ts";
import { deriveSessionKey, signSession, verifySession } from "./session.ts";

const SECRET = "ab".repeat(32);
const key = deriveSessionKey(SECRET, "hunter2");
const now = 1_800_000_000_000;

describe("session token", () => {
  it("verifies a token it signed until it expires", () => {
    const token = signSession(key, now + 1000);

    expect(verifySession(key, token, now)).toBe(true);
    expect(verifySession(key, token, now + 999)).toBe(true);
    expect(verifySession(key, token, now + 1000)).toBe(false);
  });

  it("rejects tampered expiry, signature and garbage", () => {
    const token = signSession(key, now + 1000);
    const [, signature] = token.split(".");

    expect(verifySession(key, `${now + 99_999}.${signature}`, now)).toBe(false);
    expect(verifySession(key, `${token.slice(0, -2)}xx`, now)).toBe(false);
    expect(verifySession(key, "garbage", now)).toBe(false);
    expect(verifySession(key, "", now)).toBe(false);
  });

  it("rejects tokens signed with another secret or another password", () => {
    const token = signSession(key, now + 1000);

    expect(verifySession(deriveSessionKey("cd".repeat(32), "hunter2"), token, now)).toBe(false);
    expect(verifySession(deriveSessionKey(SECRET, "changed"), token, now)).toBe(false);
  });
});

describe("passwordMatches", () => {
  it("compares in constant time regardless of length", () => {
    expect(passwordMatches("hunter2", "hunter2")).toBe(true);
    expect(passwordMatches("hunter3", "hunter2")).toBe(false);
    expect(passwordMatches("", "hunter2")).toBe(false);
    expect(passwordMatches("hunter2-and-more", "hunter2")).toBe(false);
  });
});

describe("login rate limiter", () => {
  it("blocks after the maximum failures inside the window and frees up afterwards", () => {
    let clock = now;
    const limiter = createLoginRateLimiter({ maxFailures: 3, windowMs: 60_000, now: () => clock });

    for (let i = 0; i < 3; i++) {
      expect(limiter.check("ip").allowed).toBe(true);
      limiter.fail("ip");
    }
    expect(limiter.check("ip")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(limiter.check("other").allowed).toBe(true);

    clock += 60_000;
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("clears failures after a success", () => {
    const limiter = createLoginRateLimiter({ maxFailures: 2, windowMs: 60_000, now: () => now });
    limiter.fail("ip");
    limiter.reset("ip");
    limiter.fail("ip");
    expect(limiter.check("ip").allowed).toBe(true);
  });
});
