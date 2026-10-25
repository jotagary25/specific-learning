import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export type StudySessionMode = "standard" | "minimum";

/**
 * A Today study session (spec §3.1). Named `study_session` (spec: `session`) to keep the
 * name free from login sessions. Plan shape is refined by T13.
 */
export const studySession = pgTable(
  "study_session",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    mode: text("mode").$type<StudySessionMode>().notNull(),
    budgetMin: integer("budget_min").notNull(),
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    bonusMin: integer("bonus_min").notNull().default(0),
  },
  (t) => [index("study_session_started_at_idx").on(t.startedAt)],
);

/** "Something caught my interest" note, shown outside sessions. */
export const parkingItem = pgTable("parking_item", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  text: text("text").notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
