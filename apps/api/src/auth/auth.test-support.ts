import type { Hono } from "hono";
import type { UserRole } from "../shared/db/schema/index.ts";
import { createMemoryUserStore, type UserRecord } from "../users/users.store.ts";
import { type AuthOptions, createAuth } from "./auth.ts";
import { hashPassword } from "./password.ts";

export const TEST_SECRET = "ab".repeat(32);
export const TEST_EMAIL = "learner@example.com";
export const TEST_PASSWORD = "correct horse battery";
/** Cheap scrypt cost for tests only. */
export const FAST_SCRYPT = { N: 16, r: 1, p: 1 };

/** Adds a user with a cheap hash to a memory store. */
export async function addTestUser(
  users: ReturnType<typeof createMemoryUserStore>,
  email = TEST_EMAIL,
  password = TEST_PASSWORD,
  role: UserRole = "admin",
): Promise<UserRecord> {
  return users.insert({ email, passwordHash: await hashPassword(password, FAST_SCRYPT), role });
}

/** Auth over a memory user store holding one admin (TEST_EMAIL / TEST_PASSWORD). */
export async function createTestAuth(options: Partial<AuthOptions> = {}) {
  const users = createMemoryUserStore();
  const user = await addTestUser(users);
  const auth = createAuth({ users, appSecret: TEST_SECRET, ...options });
  return { auth, users, user };
}

type RequestApp = Pick<Hono, "request">;

/** Logs in and returns the `ec_session=…` cookie pair. */
export async function loginCookie(
  app: RequestApp,
  email = TEST_EMAIL,
  password = TEST_PASSWORD,
): Promise<string> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`test login failed with ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}
