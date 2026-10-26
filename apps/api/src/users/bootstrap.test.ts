import { describe, expect, it } from "vitest";
import { verifyPassword } from "../auth/password.ts";
import { bootstrapAdmin } from "./bootstrap.ts";
import { createMemoryUserStore } from "./users.store.ts";

const FAST = { N: 16, r: 1, p: 1 };
const env = { email: "Admin@Example.com", password: "correct horse battery" };

describe("bootstrapAdmin", () => {
  it("creates the .env user as admin with a lowercased email and a scrypt hash", async () => {
    const store = createMemoryUserStore();

    const result = await bootstrapAdmin(store, env, FAST);

    expect(result.action).toBe("created");
    const [user] = store.users.values();
    expect(user).toMatchObject({ email: "admin@example.com", role: "admin", sessionEpoch: 0 });
    expect(user?.passwordHash).toMatch(/^scrypt\$/);
    expect(user?.passwordHash).not.toContain(env.password);
    expect(await verifyPassword(env.password, user?.passwordHash ?? "")).toBe(true);
  });

  it("is idempotent across restarts", async () => {
    const store = createMemoryUserStore();
    await bootstrapAdmin(store, env, FAST);
    const before = [...store.users.values()].map((u) => ({ ...u }));

    const result = await bootstrapAdmin(store, env, FAST);

    expect(result.action).toBe("unchanged");
    expect([...store.users.values()]).toEqual(before);
  });

  it("updates the hash and bumps the session epoch when the password changes", async () => {
    const store = createMemoryUserStore();
    await bootstrapAdmin(store, env, FAST);

    const result = await bootstrapAdmin(
      store,
      { ...env, password: "a brand new passphrase" },
      FAST,
    );

    expect(result.action).toBe("updated");
    const [user] = store.users.values();
    expect(store.users.size).toBe(1);
    expect(user?.sessionEpoch).toBe(1);
    expect(await verifyPassword("a brand new passphrase", user?.passwordHash ?? "")).toBe(true);
    expect(await verifyPassword(env.password, user?.passwordHash ?? "")).toBe(false);
  });

  it("moves the existing admin to a new email instead of creating a second admin", async () => {
    const store = createMemoryUserStore();
    const created = await bootstrapAdmin(store, env, FAST);

    const result = await bootstrapAdmin(store, { ...env, email: "new@example.com" }, FAST);

    expect(result.action).toBe("updated");
    expect(store.users.size).toBe(1);
    expect(result.user).toMatchObject({
      id: created.user.id,
      email: "new@example.com",
      role: "admin",
    });
    expect(result.user.sessionEpoch).toBe(1);
  });

  it("promotes an existing user with the .env email to admin", async () => {
    const store = createMemoryUserStore();
    await store.insert({ email: "admin@example.com", passwordHash: "x", role: "learner" });

    const result = await bootstrapAdmin(store, env, FAST);

    expect(store.users.size).toBe(1);
    expect(result.user).toMatchObject({ email: "admin@example.com", role: "admin" });
  });
});
