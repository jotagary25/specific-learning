import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { unit } from "./units.ts";
import { userIdColumn } from "./users.ts";

/** Mission formats per level (spec §3.6). */
export type WritingFormat = "tweet" | "thread" | "linkedin" | "article";
export type WritingMissionStatus = "pending" | "draft" | "submitted" | "done";

/** Writing mission: a goal with topic, target grammar and format. */
export const writingMission = pgTable(
  "writing_mission",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: userIdColumn(),
    level: smallint("level").notNull(),
    format: text("format").$type<WritingFormat>().notNull(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    targetUnitId: integer("target_unit_id").references(() => unit.id, { onDelete: "set null" }),
    status: text("status").$type<WritingMissionStatus>().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Last learner work on the mission (draft saved, text submitted, status change). */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("writing_mission_user_id_created_at_idx").on(t.userId, t.createdAt)],
);

/**
 * A reviewed text. `mission_id` is null for texts written outside a mission
 * (e.g. the reading retell). Score and rewrite shapes are refined by T12.
 */
export const writingSubmission = pgTable(
  "writing_submission",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: userIdColumn(),
    missionId: uuid("mission_id").references(() => writingMission.id, { onDelete: "cascade" }),
    textOriginal: text("text_original").notNull(),
    textFixed: text("text_fixed"),
    scores: jsonb("scores").$type<Record<string, number>>(),
    rewrites: jsonb("rewrites").$type<Record<string, unknown>[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("writing_submission_mission_id_idx").on(t.missionId),
    index("writing_submission_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
);

/** One error found in a submission; feeds own-error SRS cards and unit priority. */
export const writingError = pgTable(
  "writing_error",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: userIdColumn(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => writingSubmission.id, { onDelete: "cascade" }),
    /** Location of the error in the original text, e.g. { start, end, text }. */
    span: jsonb("span").$type<Record<string, unknown>>().notNull(),
    type: text("type").notNull(),
    unitId: integer("unit_id").references(() => unit.id, { onDelete: "set null" }),
    hint: text("hint").notNull(),
    fixed: boolean("fixed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("writing_error_submission_id_idx").on(t.submissionId),
    index("writing_error_unit_id_idx").on(t.unitId),
    index("writing_error_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
);
