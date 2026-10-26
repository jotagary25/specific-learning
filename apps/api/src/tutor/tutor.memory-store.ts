// In-memory TutorStore for tests.
import {
  type ConversationRecord,
  type MessageRecord,
  type TutorStore,
  toolNameOf,
} from "./tutor.store.ts";

export type MemoryTutorStore = TutorStore & {
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  doubts: Array<{
    id: string;
    text: string;
    context: Record<string, unknown>;
    explanation: string | null;
  }>;
};

export function createMemoryTutorStore(): MemoryTutorStore {
  let seq = 0;
  const nextId = () => `00000000-0000-7000-8000-${String(++seq).padStart(12, "0")}`;
  const tick = () => new Date(Date.UTC(2026, 9, 25, 9, 0, 0, seq));
  const store: MemoryTutorStore = {
    conversations: [],
    messages: [],
    doubts: [],
    async createConversation(context) {
      const record = { id: nextId(), context, createdAt: tick() };
      store.conversations.push(record);
      return record;
    },
    async getConversation(id) {
      return store.conversations.find((c) => c.id === id);
    },
    async listConversations(limit) {
      return [...store.conversations]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map((c) => ({
          ...c,
          firstUserMessage:
            store.messages.find((m) => m.conversationId === c.id && m.role === "user")?.content ??
            null,
        }));
    },
    async listMessages(conversationId) {
      return store.messages.filter((m) => m.conversationId === conversationId);
    },
    async insertMessage(message) {
      const record = { ...message, toolName: toolNameOf(message), id: nextId(), createdAt: tick() };
      store.messages.push(record);
      return record;
    },
    async insertDoubt(text, context, explanation) {
      const record = { id: nextId(), text, context, explanation: explanation ?? null };
      store.doubts.push(record);
      return { id: record.id };
    },
  };
  return store;
}
