import type {
  ConversationDetail,
  ConversationSummary,
  ConversationsListResponse,
  CreateConversationResponse,
  TutorContext,
  TutorMessageView,
  TutorStreamEvent,
} from "@english-course/shared";
import type { Settings } from "../settings/settings.service.ts";
import type { ChatMessage } from "../shared/llm/types.ts";
import { createTutorTools, type TutorToolDeps } from "./tools.ts";
import { runTutorTurn } from "./tutor.agent.ts";
import { buildSystemMessage } from "./tutor.prompt.ts";
import type { ConversationRecord, MessageRecord, TutorStore } from "./tutor.store.ts";

export type TutorDeps = Omit<TutorToolDeps, "saveDoubt"> & {
  store: TutorStore;
  /** Model resolution and key status; without it every turn answers "ai-unavailable". */
  ai?: Pick<Settings, "getLlmForFunction" | "keyStatus">;
};

export class TutorError extends Error {
  override readonly name = "TutorError";
  readonly code: "not_found" | "ai-unavailable";

  constructor(code: TutorError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** Earlier messages sent back to the model with each turn. */
export const HISTORY_LIMIT = 24;
const LIST_LIMIT = 30;
const PREVIEW_CHARS = 120;

const preview = (text: string | null) =>
  text === null
    ? null
    : text.length > PREVIEW_CHARS
      ? `${text.slice(0, PREVIEW_CHARS - 1)}…`
      : text;

function messageView(m: MessageRecord): TutorMessageView {
  const call = m.role === "tool" ? m.toolCalls?.[0] : undefined;
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    tool: call ? { name: call.name, label: call.label ?? call.name, ok: call.ok ?? true } : null,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Rebuilds model messages from stored ones; the window always starts at a learner message. */
export function historyMessages(records: MessageRecord[], limit = HISTORY_LIMIT): ChatMessage[] {
  const recent = records.slice(-limit);
  const start = recent.findIndex((m) => m.role === "user");
  if (start < 0) return [];
  return recent.slice(start).map((m): ChatMessage => {
    if (m.role === "tool") {
      return { role: "tool", content: m.content, toolName: m.toolCalls?.[0]?.name ?? "unknown" };
    }
    if (m.role === "assistant") {
      const calls = (m.toolCalls ?? []).map((c) => ({
        name: c.name,
        arguments: c.arguments ?? {},
      }));
      return {
        role: "assistant",
        content: m.content,
        ...(calls.length > 0 ? { toolCalls: calls } : {}),
      };
    }
    return { role: "user", content: m.content };
  });
}

export function createTutor(deps: TutorDeps) {
  const { store } = deps;
  const tools = createTutorTools({
    ...deps,
    saveDoubt: (text, context) => store.insertDoubt(text, context),
  });

  async function conversationOr404(id: string): Promise<ConversationRecord> {
    const found = await store.getConversation(id);
    if (!found) throw new TutorError("not_found", "Conversation not found");
    return found;
  }

  return {
    toolNames: tools.names,

    async create(context: TutorContext): Promise<CreateConversationResponse> {
      return { id: (await store.createConversation(context)).id };
    },

    async list(): Promise<ConversationsListResponse> {
      const rows = await store.listConversations(LIST_LIMIT);
      return {
        conversations: rows.map(
          (row): ConversationSummary => ({
            id: row.id,
            context: row.context,
            preview: preview(row.firstUserMessage),
            createdAt: row.createdAt.toISOString(),
          }),
        ),
      };
    },

    async get(id: string): Promise<ConversationDetail> {
      const conversation = await conversationOr404(id);
      const messages = await store.listMessages(id);
      return {
        id: conversation.id,
        context: conversation.context,
        createdAt: conversation.createdAt.toISOString(),
        messages: messages.map(messageView),
      };
    },

    /**
     * Validates the turn (conversation exists, AI configured) before any stream opens, stores
     * the learner message, and returns the event stream of the reply.
     */
    async startTurn(
      id: string,
      content: string,
    ): Promise<(signal: AbortSignal) => AsyncGenerator<TutorStreamEvent>> {
      const conversation = await conversationOr404(id);
      if (!deps.ai || !(await deps.ai.keyStatus()).configured) {
        throw new TutorError(
          "ai-unavailable",
          "The AI tutor is unavailable right now (add an Ollama API key in Settings)",
        );
      }
      const { client, model, think } = await deps.ai.getLlmForFunction("explain_tutor");
      const earlier = await store.listMessages(id);
      await store.insertMessage({ conversationId: id, role: "user", content, toolCalls: null });
      const messages: ChatMessage[] = [
        buildSystemMessage(conversation.context),
        ...historyMessages(earlier),
        { role: "user", content },
      ];
      return (signal) =>
        runTutorTurn({
          llm: client,
          model,
          think,
          messages,
          tools,
          ctx: { conversationId: id, context: conversation.context },
          signal,
          persist: (message) => store.insertMessage({ ...message, conversationId: id }),
        });
    },
  };
}

export type Tutor = ReturnType<typeof createTutor>;
