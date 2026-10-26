import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { appUser } from "./users.ts";

/** Owner of a setting or secret; `null` = instance-level (reserved for future defaults). */
const ownerColumn = () => uuid("user_id").references(() => appUser.id, { onDelete: "cascade" });

/**
 * Key/value settings (AI function configs, preferences), one value per user and key. Value
 * shapes are owned by the settings module.
 */
export const setting = pgTable(
  "setting",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: ownerColumn(),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("setting_user_id_key_unique").on(t.userId, t.key).nullsNotDistinct()],
);

/**
 * Secret encrypted at rest with AES-256-GCM (base64 fields), one per user and key. Only
 * `last4` ever leaves the api.
 */
export const secret = pgTable(
  "secret",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: ownerColumn(),
    key: text("key").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    last4: text("last4").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("secret_user_id_key_unique").on(t.userId, t.key).nullsNotDistinct()],
);
