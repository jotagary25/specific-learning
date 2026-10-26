import { describe, expect, it } from "vitest";
import { hashPassword, normalizeEmail, verifyPassword } from "./password.ts";
import { createLoginRateLimiter } from "./rate-limit.ts";
import { deriveSessionKey, readSession, signSession } from "./session.ts";

const SECRET = "ab".repeat(32);
const key = deriveSessionKey(SECRET);
const now = 1_800_000_000_000;
const USER = "0190a0b0-0000-7000-8000-000000000001";
const claims = { userId: USER, epoch: 0, expiresAt: now + 1000 };

describe("session token", () => {
  it("reads back the claims of a token it signed until it expires", () => {
    const token = signSession(key, claims);

    expect(readSession(key, token, now)).toEqual(claims);
    expect(readSession(key, token, now + 999)).toEqual(claims);
    expect(readSession(key, token, now + 1000)).toBeUndefined();
  });

  it("rejects tampered user, epoch, expiry, signature and garbage", () => {
    const token = signSession(key, { ...claims, epoch: 3 });
    const [, , , signature] = token.split(".");
    const other = "0190a0b0-0000-7000-8000-000000000002";

    expect(readSession(key, `${other}.3.${now + 1000}.${signature}`, now)).toBeUndefined();
    expect(readSession(key, `${USER}.4.${now + 1000}.${signature}`, now)).toBeUndefined();
    expect(readSession(key, `${USER}.3.${now + 99_999}.${signature}`, now)).toBeUndefined();
    expect(readSession(key, `${token.slice(0, -2)}xx`, now)).toBeUndefined();
    expect(readSession(key, "garbage", now)).toBeUndefined();
    expect(readSession(key, "", now)).toBeUndefined();
  });

  it("rejects tokens signed with another secret", () => {
    const token = signSession(key, claims);
    expect(readSession(deriveSessionKey("cd".repeat(32)), token, now)).toBeUndefined();
  });
});

describe("password hashing", () => {
  const FAST = { N: 16, r: 1, p: 1 };

  it("salts every hash and verifies only the right password", async () => {
    const a = await hashPassword("hunter2-hunter2", FAST);
    const b = await hashPassword("hunter2-hunter2", FAST);

    expect(a).not.toBe(b);
    expect(await verifyPassword("hunter2-hunter2", a)).toBe(true);
    expect(await verifyPassword("hunter3-hunter3", a)).toBe(false);
    expect(await verifyPassword("", a)).toBe(false);
  });

  it("never matches a malformed or out-of-bounds hash", async () => {
    const good = await hashPassword("pw", FAST);
    const parts = good.split("$");

    expect(await verifyPassword("pw", "")).toBe(false);
    expect(await verifyPassword("pw", "plain-text")).toBe(false);
    expect(await verifyPassword("pw", ["scrypt", 2 ** 30, ...parts.slice(2)].join("$"))).toBe(
      false,
    );
    expect(await verifyPassword("pw", [...parts.slice(0, 5), "AAAA"].join("$"))).toBe(false);
  });

  it("normalizes emails to trimmed lowercase", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
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
