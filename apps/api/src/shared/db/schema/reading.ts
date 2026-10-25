import { sql } from "drizzle-orm";
import {
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { writingSubmission } from "./writing.ts";

export type ArticleSource = "theconversation" | "websearch" | "manual";

/**
 * Candidate or selected article. `text` is stored verbatim (CC BY-ND: never rewritten).
 * `selected_for` is the day it was picked as the daily article (one article per day).
 * Annotation shape is refined by T10.
 */
export const article = pgTable(
  "article",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    source: text("source").$type<ArticleSource>().notNull(),
    url: text("url").notNull().unique(),
    title: text("title").notNull(),
    authors: jsonb("authors").$type<string[]>().notNull().default([]),
    outlet: text("outlet"),
    license: text("license"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    text: text("text").notNull(),
    topic: text("topic"),
    estLevel: text("est_level"),
    selectedFor: date("selected_for"),
    annotations: jsonb("annotations").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("article_selected_for_uidx").on(t.selectedFor)],
);

/** The learner's pass through the 6-step reading flow for one article. */
export const readingSession = pgTable(
  "reading_session",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    prediction: text("prediction"),
    answers: jsonb("answers").$type<Record<string, unknown>[]>(),
    spots: jsonb("spots").$type<Record<string, unknown>[]>(),
    /** The retell goes through the writing review flow. */
    retellSubmissionId: uuid("retell_submission_id").references(() => writingSubmission.id, {
      onDelete: "set null",
    }),
    opinion: text("opinion"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("reading_session_article_id_idx").on(t.articleId)],
);
