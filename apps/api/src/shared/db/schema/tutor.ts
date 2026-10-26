import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { userIdColumn } from "./users.ts";

/** Where the tutor was opened from (screen, unit, item, article span, writing error). */
export type TutorContext = Record<string, unknown>;

/** A doubt the learner (or the tutor's `add_doubt` tool) parked for later. */
export const doubt = pgTable(
  "doubt",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: userIdColumn(),
    context: jsonb("context").$type<TutorContext>().notNull().default({}),
    text: text("text").notNull(),
    /** Tutor explanation shown for the doubt, when there was one. */
    explanation: text("explanation"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("doubt_user_id_created_at_idx").on(t.userId, t.createdAt)],
);

export const tutorConversation = pgTable(
  "tutor_conversation",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: userIdColumn(),
    context: jsonb("context").$type<TutorContext>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tutor_conversation_user_id_created_at_idx").on(t.userId, t.createdAt)],
);

export const tutorMessage = pgTable(
  "tutor_message",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: userIdColumn(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => tutorConversation.id, { onDelete: "cascade" }),
    role: text("role").$type<"system" | "user" | "assistant" | "tool">().notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls").$type<Record<string, unknown>[]>(),
    /** Tool that produced a `tool` message; null for other roles. */
    toolName: text("tool_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tutor_message_conversation_id_created_at_idx").on(t.conversationId, t.createdAt),
    index("tutor_message_user_id_idx").on(t.userId),
  ],
);
