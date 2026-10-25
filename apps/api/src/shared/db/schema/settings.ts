import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Key/value settings (AI function configs, caps, schedule). Value shapes are owned by T06. */
export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Secret encrypted at rest with AES-256-GCM (base64 fields). Only `last4` ever leaves the api. */
export const secret = pgTable("secret", {
  key: text("key").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  tag: text("tag").notNull(),
  last4: text("last4").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
