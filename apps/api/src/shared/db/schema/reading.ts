import { sql } from "drizzle-orm";
import {
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { userIdColumn } from "./users.ts";
import { writingSubmission } from "./writing.ts";

export type ArticleSource = "theconversation" | "websearch" | "manual";

/**
 * Shared article pool (candidates and picked articles). `text` is stored verbatim (CC BY-ND:
 * never rewritten). Which article a learner reads on a day lives in `daily_article`.
 * Annotation shape is refined by T10.
 */
export const article = pgTable("article", {
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
  annotations: jsonb("annotations").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The article a learner gets on one local day (one per user and day). */
export const dailyArticle = pgTable(
  "daily_article",
  {
    userId: userIdColumn(),
    date: date("date").notNull(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.date] }),
    index("daily_article_article_id_idx").on(t.articleId),
  ],
);

/** The learner's pass through the 6-step reading flow for one article. */
export const readingSession = pgTable(
  "reading_session",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: userIdColumn(),
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
  (t) => [
    index("reading_session_user_id_article_id_idx").on(t.userId, t.articleId),
    index("reading_session_article_id_idx").on(t.articleId),
  ],
);
