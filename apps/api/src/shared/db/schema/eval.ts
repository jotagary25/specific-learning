import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** One model-eval run of `review_writing` over the fixture set. Results shape owned by T16. */
export const evalRun = pgTable(
  "eval_run",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    model: text("model").notNull(),
    effort: text("effort"),
    results: jsonb("results").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eval_run_created_at_idx").on(t.createdAt)],
);
