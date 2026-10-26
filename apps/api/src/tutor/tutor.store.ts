import type { TutorContext } from "@english-course/shared";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import { doubt, tutorConversation, tutorMessage } from "../shared/db/schema/index.ts";

export type TutorRole = "user" | "assistant" | "tool";

/**
 * What `tutor_message.tool_calls` holds: on assistant messages the calls the model asked for,
 * on tool messages one entry describing the tool that answered (there is no `tool_name` column).
 */
export type StoredToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
  label?: string;
  ok?: boolean;
};

export type ConversationRecord = { id: string; context: TutorContext; createdAt: Date };

export type MessageRecord = {
  id: string;
  conversationId: string;
  role: TutorRole;
  content: string;
  toolCalls: StoredToolCall[] | null;
  createdAt: Date;
};

export type NewMessage = Omit<MessageRecord, "id" | "createdAt">;

/** Persistence port of the tutor feature. */
export interface TutorStore {
  createConversation(context: TutorContext): Promise<ConversationRecord>;
  getConversation(id: string): Promise<ConversationRecord | undefined>;
  /** Newest first, with the first learner message of each. */
  listConversations(
    limit: number,
  ): Promise<Array<ConversationRecord & { firstUserMessage: string | null }>>;
  /** Oldest first. */
  listMessages(conversationId: string): Promise<MessageRecord[]>;
  insertMessage(message: NewMessage): Promise<MessageRecord>;
  insertDoubt(text: string, context: Record<string, unknown>): Promise<{ id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toConversation = (row: typeof tutorConversation.$inferSelect): ConversationRecord => ({
  id: row.id,
  context: row.context as TutorContext,
  createdAt: row.createdAt,
});

const toMessage = (row: typeof tutorMessage.$inferSelect): MessageRecord => ({
  id: row.id,
  conversationId: row.conversationId,
  role: row.role as TutorRole,
  content: row.content,
  toolCalls: (row.toolCalls as StoredToolCall[] | null) ?? null,
  createdAt: row.createdAt,
});

export function createDrizzleTutorStore(db: Db): TutorStore {
  return {
    async createConversation(context) {
      const [row] = await db.insert(tutorConversation).values({ context }).returning();
      return toConversation(row as typeof tutorConversation.$inferSelect);
    },

    async getConversation(id) {
      if (!UUID.test(id)) return undefined;
      const [row] = await db.select().from(tutorConversation).where(eq(tutorConversation.id, id));
      return row ? toConversation(row) : undefined;
    },

    async listConversations(limit) {
      const rows = await db
        .select()
        .from(tutorConversation)
        .orderBy(desc(tutorConversation.createdAt))
        .limit(limit);
      if (rows.length === 0) return [];
      const firsts = await db
        .selectDistinctOn([tutorMessage.conversationId], {
          conversationId: tutorMessage.conversationId,
          content: tutorMessage.content,
        })
        .from(tutorMessage)
        .where(
          and(
            inArray(
              tutorMessage.conversationId,
              rows.map((r) => r.id),
            ),
            eq(tutorMessage.role, "user"),
          ),
        )
        .orderBy(tutorMessage.conversationId, asc(tutorMessage.createdAt));
      const first = new Map(firsts.map((f) => [f.conversationId, f.content]));
      return rows.map((row) => ({
        ...toConversation(row),
        firstUserMessage: first.get(row.id) ?? null,
      }));
    },

    async listMessages(conversationId) {
      if (!UUID.test(conversationId)) return [];
      const rows = await db
        .select()
        .from(tutorMessage)
        .where(eq(tutorMessage.conversationId, conversationId))
        .orderBy(asc(tutorMessage.createdAt), asc(tutorMessage.id));
      return rows.map(toMessage);
    },

    async insertMessage(message) {
      const [row] = await db
        .insert(tutorMessage)
        .values({
          conversationId: message.conversationId,
          role: message.role,
          content: message.content,
          toolCalls: message.toolCalls as Record<string, unknown>[] | null,
          // Rows of one turn are written within milliseconds: keep their order stable.
          createdAt: sql`clock_timestamp()`,
        })
        .returning();
      return toMessage(row as typeof tutorMessage.$inferSelect);
    },

    async insertDoubt(text, context) {
      const [row] = await db.insert(doubt).values({ text, context }).returning({ id: doubt.id });
      return { id: (row as { id: string }).id };
    },
  };
}
