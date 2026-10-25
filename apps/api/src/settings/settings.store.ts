import { eq } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import { secret, setting } from "../shared/db/schema/index.ts";
import type { SealedSecret } from "./crypto.ts";

export type StoredSecret = SealedSecret & { last4: string };

/** Persistence port for settings: key/value JSON settings and encrypted secrets. */
export interface SettingsStore {
  getSecret(key: string): Promise<StoredSecret | undefined>;
  putSecret(key: string, value: StoredSecret): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  getSetting(key: string): Promise<unknown>;
  putSetting(key: string, value: unknown): Promise<void>;
}

export function createDrizzleSettingsStore(db: Db): SettingsStore {
  return {
    async getSecret(key) {
      const [row] = await db.select().from(secret).where(eq(secret.key, key)).limit(1);
      return row
        ? { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, last4: row.last4 }
        : undefined;
    },
    async putSecret(key, value) {
      const updatedAt = new Date();
      await db
        .insert(secret)
        .values({ key, ...value, updatedAt })
        .onConflictDoUpdate({ target: secret.key, set: { ...value, updatedAt } });
    },
    async deleteSecret(key) {
      await db.delete(secret).where(eq(secret.key, key));
    },
    async getSetting(key) {
      const [row] = await db.select().from(setting).where(eq(setting.key, key)).limit(1);
      return row?.value;
    },
    async putSetting(key, value) {
      const updatedAt = new Date();
      await db
        .insert(setting)
        .values({ key, value, updatedAt })
        .onConflictDoUpdate({ target: setting.key, set: { value, updatedAt } });
    },
  };
}

export function createMemorySettingsStore(): SettingsStore & {
  secrets: Map<string, StoredSecret>;
  settings: Map<string, unknown>;
} {
  const secrets = new Map<string, StoredSecret>();
  const settings = new Map<string, unknown>();
  return {
    secrets,
    settings,
    getSecret: async (key) => secrets.get(key),
    putSecret: async (key, value) => void secrets.set(key, value),
    deleteSecret: async (key) => void secrets.delete(key),
    getSetting: async (key) => settings.get(key),
    putSetting: async (key, value) => void settings.set(key, structuredClone(value)),
  };
}
