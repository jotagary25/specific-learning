import { and, eq } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import { secret, setting } from "../shared/db/schema/index.ts";
import type { SealedSecret } from "./crypto.ts";

export type StoredSecret = SealedSecret & { last4: string };

/**
 * Persistence port for per-user settings: key/value JSON settings and encrypted secrets.
 * Every read and write is scoped to one user.
 */
export interface SettingsStore {
  getSecret(userId: string, key: string): Promise<StoredSecret | undefined>;
  putSecret(userId: string, key: string, value: StoredSecret): Promise<void>;
  deleteSecret(userId: string, key: string): Promise<void>;
  getSetting(userId: string, key: string): Promise<unknown>;
  putSetting(userId: string, key: string, value: unknown): Promise<void>;
}

export function createDrizzleSettingsStore(db: Db): SettingsStore {
  return {
    async getSecret(userId, key) {
      const [row] = await db
        .select()
        .from(secret)
        .where(and(eq(secret.userId, userId), eq(secret.key, key)))
        .limit(1);
      return row
        ? { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, last4: row.last4 }
        : undefined;
    },
    async putSecret(userId, key, value) {
      const updatedAt = new Date();
      await db
        .insert(secret)
        .values({ userId, key, ...value, updatedAt })
        .onConflictDoUpdate({ target: [secret.userId, secret.key], set: { ...value, updatedAt } });
    },
    async deleteSecret(userId, key) {
      await db.delete(secret).where(and(eq(secret.userId, userId), eq(secret.key, key)));
    },
    async getSetting(userId, key) {
      const [row] = await db
        .select()
        .from(setting)
        .where(and(eq(setting.userId, userId), eq(setting.key, key)))
        .limit(1);
      return row?.value;
    },
    async putSetting(userId, key, value) {
      const updatedAt = new Date();
      await db
        .insert(setting)
        .values({ userId, key, value, updatedAt })
        .onConflictDoUpdate({ target: [setting.userId, setting.key], set: { value, updatedAt } });
    },
  };
}

/** Key of the memory store maps: one entry per user and setting key. */
export const memoryKey = (userId: string, key: string) => `${userId}/${key}`;

export function createMemorySettingsStore(): SettingsStore & {
  secrets: Map<string, StoredSecret>;
  settings: Map<string, unknown>;
} {
  const secrets = new Map<string, StoredSecret>();
  const settings = new Map<string, unknown>();
  return {
    secrets,
    settings,
    getSecret: async (userId, key) => secrets.get(memoryKey(userId, key)),
    putSecret: async (userId, key, value) => void secrets.set(memoryKey(userId, key), value),
    deleteSecret: async (userId, key) => void secrets.delete(memoryKey(userId, key)),
    getSetting: async (userId, key) => settings.get(memoryKey(userId, key)),
    putSetting: async (userId, key, value) =>
      void settings.set(memoryKey(userId, key), structuredClone(value)),
  };
}
