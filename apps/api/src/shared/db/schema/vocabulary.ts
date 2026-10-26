import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export type SrsCardSource = "word" | "own_error" | "unit_item";

/** Serialized ts-fsrs card state (see `vocabulary/srs.ts`). */
export type FsrsCardState = Record<string, unknown>;

/**
 * SRS card. `ref` points back to its origin (article + sentence, writing error, exercise item).
 * `due` mirrors the FSRS state's due date so the review queue is an indexed range scan.
 */
export const srsCard = pgTable(
  "srs_card",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    source: text("source").$type<SrsCardSource>().notNull(),
    front: text("front").notNull(),
    back: text("back").notNull(),
    ref: jsonb("ref").$type<Record<string, unknown>>().notNull().default({}),
    /** FSRS state; `null` = new, never reviewed (legacy rows may still hold `{}`). */
    state: jsonb("state").$type<FsrsCardState>(),
    suspended: boolean("suspended").notNull().default(false),
    due: timestamp("due", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("srs_card_due_idx").on(t.due)],
);

/** One review of a card. Rating follows FSRS: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export const srsReview = pgTable(
  "srs_review",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    cardId: uuid("card_id")
      .notNull()
      .references(() => srsCard.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    /** What the learner typed on production cards; null for recognition cards. */
    answer: text("answer"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("srs_review_card_id_reviewed_at_idx").on(t.cardId, t.reviewedAt)],
);
