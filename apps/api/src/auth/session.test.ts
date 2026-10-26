import { describe, expect, it } from "vitest";
import { passwordMatches } from "./password.ts";
import { createLoginRateLimiter } from "./rate-limit.ts";
import { deriveSessionKey, signSession, verifySession } from "./session.ts";

const SECRET = "ab".repeat(32);
const key = deriveSessionKey(SECRET, "hunter2");
const now = 1_800_000_000_000;

describe("session token", () => {
  it("verifies a token it signed until it expires", () => {
    const token = signSession(key, now + 1000, 0);

    expect(verifySession(key, token, now, 0)).toBe(true);
    expect(verifySession(key, token, now + 999, 0)).toBe(true);
    expect(verifySession(key, token, now + 1000, 0)).toBe(false);
  });

  it("rejects tampered expiry, signature and garbage", () => {
    const token = signSession(key, now + 1000, 0);
    const [, , signature] = token.split(".");

    expect(verifySession(key, `0.${now + 99_999}.${signature}`, now, 0)).toBe(false);
    expect(verifySession(key, `${token.slice(0, -2)}xx`, now, 0)).toBe(false);
    expect(verifySession(key, "garbage", now, 0)).toBe(false);
    expect(verifySession(key, "", now, 0)).toBe(false);
  });

  it("rejects tokens signed with another secret or another password", () => {
    const token = signSession(key, now + 1000, 0);

    expect(verifySession(deriveSessionKey("cd".repeat(32), "hunter2"), token, now, 0)).toBe(false);
    expect(verifySession(deriveSessionKey(SECRET, "changed"), token, now, 0)).toBe(false);
  });

  it("rejects tokens from an older or tampered session epoch", () => {
    const token = signSession(key, now + 1000, 3);
    const [, expiresAt, signature] = token.split(".");

    expect(verifySession(key, token, now, 3)).toBe(true);
    expect(verifySession(key, token, now, 4)).toBe(false);
    expect(verifySession(key, `4.${expiresAt}.${signature}`, now, 4)).toBe(false);
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
  it("reserves attempts up to the maximum inside the window and frees up afterwards", () => {
    let clock = now;
    const limiter = createLoginRateLimiter({ maxFailures: 3, windowMs: 60_000, now: () => clock });

    for (let i = 0; i < 3; i++) expect(limiter.consume("ip").allowed).toBe(true);
    expect(limiter.consume("ip")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(limiter.consume("other").allowed).toBe(true);

    clock += 60_000;
    expect(limiter.consume("ip").allowed).toBe(true);
  });

  it("clears reserved attempts after a success", () => {
    const limiter = createLoginRateLimiter({ maxFailures: 2, windowMs: 60_000, now: () => now });
    limiter.consume("ip");
    limiter.consume("ip");
    limiter.reset("ip");
    expect(limiter.consume("ip").allowed).toBe(true);
  });

  it("evicts expired buckets so memory stays bounded", () => {
    let clock = now;
    const limiter = createLoginRateLimiter({ windowMs: 60_000, now: () => clock });
    for (let i = 0; i < 100; i++) limiter.consume(`ip-${i}`);
    expect(limiter.size()).toBe(100);

    clock += 60_000;
    limiter.consume("late");

    expect(limiter.size()).toBe(1);
  });

  it("caps the number of buckets by dropping the oldest", () => {
    const limiter = createLoginRateLimiter({ maxBuckets: 3, now: () => now });
    for (const ip of ["a", "b", "c", "d"]) limiter.consume(ip);

    expect(limiter.size()).toBe(3);
  });
});
