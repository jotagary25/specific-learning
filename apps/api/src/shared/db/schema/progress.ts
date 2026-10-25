import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** "Now I can…" entry: written by the learner or a checked suggested descriptor. */
export const canDo = pgTable("can_do", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  text: text("text").notNull(),
  source: text("source").$type<"learner" | "suggested">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only learning event; the progress timeline renders from these. */
export const event = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("event_created_at_idx").on(t.createdAt),
    index("event_type_created_at_idx").on(t.type, t.createdAt),
  ],
);
