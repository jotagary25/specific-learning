import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { userIdColumn } from "./users.ts";

/** Who wrote a can-do entry: the learner, a suggested descriptor, or the monthly mirror. */
export type CanDoSource = "learner" | "suggested" | "mirror";

/** "Now I can…" entry: written by the learner or a checked suggested descriptor. */
export const canDo = pgTable(
  "can_do",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: userIdColumn(),
    text: text("text").notNull(),
    source: text("source").$type<CanDoSource>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("can_do_user_id_created_at_idx").on(t.userId, t.createdAt)],
);

/** Append-only learning event; the progress timeline renders from these. */
export const event = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: userIdColumn(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("event_user_id_created_at_idx").on(t.userId, t.createdAt),
    index("event_user_id_type_created_at_idx").on(t.userId, t.type, t.createdAt),
  ],
);
