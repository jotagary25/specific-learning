import type {
  ItemAnswer,
  ItemCheckResult,
  Segment,
  TheorySection,
  WordBankEntry,
} from "@english-course/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** Unit learning state (spec §3.2). `locked` is reserved; the MVP opens every seeded unit. */
export type UnitStatus = "locked" | "new" | "in_progress" | "completed" | "needs_review";

/** Authored per-unit extras (puzzle, programmer analogy, Spanish pitfalls). Shape refined by T08. */
export type UnitExtras = Record<string, unknown>;

/** Book block (e.g. block 1 "Present and Past", units 1–6). Content: seeded. */
export const block = pgTable("block", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  unitFrom: integer("unit_from").notNull(),
  unitTo: integer("unit_to").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Book unit. Content columns are seeded (id = book unit number); `status`, `priority`,
 * `completed_at` and `extras` belong to the learner/authored side and are never overwritten by the seed.
 */
export const unit = pgTable(
  "unit",
  {
    id: integer("id").primaryKey(),
    blockId: integer("block_id")
      .notNull()
      .references(() => block.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull(),
    theory: jsonb("theory").$type<TheorySection[]>().notNull(),
    extras: jsonb("extras").$type<UnitExtras>().notNull().default({}),
    status: text("status").$type<UnitStatus>().notNull().default("new"),
    priority: integer("priority").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("unit_block_id_idx").on(t.blockId)],
);

/** Book exercise, id = book code ("1.1"). Content: seeded. */
export const exercise = pgTable(
  "exercise",
  {
    id: text("id").primaryKey(),
    unitId: integer("unit_id")
      .notNull()
      .references(() => unit.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    instruction: text("instruction").notNull(),
    evaluation: text("evaluation").$type<"auto" | "ai">().notNull(),
    wordBank: jsonb("word_bank").$type<WordBankEntry[]>(),
    passage: text("passage"),
    answerNote: text("answer_note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("exercise_unit_id_position_idx").on(t.unitId, t.position)],
);

/** Exercise item, id = `<exercise>-<num>` ("1.1-2"). Content: seeded. */
export const exerciseItem = pgTable(
  "exercise_item",
  {
    id: text("id").primaryKey(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercise.id, { onDelete: "cascade" }),
    num: text("num").notNull(),
    position: integer("position").notNull(),
    isExample: boolean("is_example").notNull(),
    /** True when the AI check decides: open-ended answer or a key the importer could not map. */
    isOpen: boolean("is_open").notNull(),
    lines: jsonb("lines").$type<Segment[][]>().notNull(),
    answer: jsonb("answer").$type<ItemAnswer>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("exercise_item_exercise_id_position_idx").on(t.exerciseId, t.position)],
);

/** AI feedback stored with an attempt (Spanish texts from `check_answer`). */
export type AttemptFeedback = { feedbackEs?: string; hintEs?: string };

/**
 * One learner answer to an exercise item. `hint_level` is the highest graduated hint (1–3) the
 * learner saw while this was the item's latest attempt (0 = none); hints asked before the first
 * attempt are not stored.
 */
export const attempt = pgTable(
  "attempt",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    itemId: text("item_id")
      .notNull()
      .references(() => exerciseItem.id, { onDelete: "cascade" }),
    /** Learner input, one entry per blank (a single entry for sentence/open items). */
    answer: jsonb("answer").$type<string[]>().notNull(),
    result: jsonb("result").$type<ItemCheckResult>().notNull(),
    correct: boolean("correct").notNull(),
    score: real("score").notNull(),
    method: text("method").$type<"deterministic" | "ai">().notNull(),
    attemptNo: smallint("attempt_no").notNull(),
    feedback: jsonb("feedback").$type<AttemptFeedback>(),
    hintLevel: smallint("hint_level").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attempt_item_id_created_at_idx").on(t.itemId, t.createdAt)],
);

/** Authored timeline-drag item for tense units. Shape of `expected_shape` refined by T09. */
export const timelineItem = pgTable(
  "timeline_item",
  {
    id: text("id").primaryKey(),
    unitId: integer("unit_id")
      .notNull()
      .references(() => unit.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    sentence: text("sentence").notNull(),
    expectedShape: jsonb("expected_shape").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index("timeline_item_unit_id_idx").on(t.unitId)],
);

/** Authored serial-story chapter, one per unit of a block (spec §3.3). */
export const storyChapter = pgTable(
  "story_chapter",
  {
    id: text("id").primaryKey(),
    blockId: integer("block_id")
      .notNull()
      .references(() => block.id, { onDelete: "cascade" }),
    unitId: integer("unit_id").references(() => unit.id, { onDelete: "set null" }),
    position: integer("position").notNull(),
    /** Title of the serial story the chapter belongs to (authored `story.title`). */
    storyTitle: text("story_title"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    grammarSpans: jsonb("grammar_spans").$type<Record<string, unknown>[]>().notNull().default([]),
    teaser: text("teaser").notNull(),
  },
  (t) => [index("story_chapter_block_id_position_idx").on(t.blockId, t.position)],
);
