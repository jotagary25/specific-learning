import { z } from "zod";

/** Where the tutor was opened from (spec §3.9). */
export const TutorContextKind = z.enum([
  "unit",
  "exercise",
  "article",
  "writing",
  "vocabulary",
  "free",
]);
export type TutorContextKind = z.infer<typeof TutorContextKind>;

/**
 * The screen the learner left to ask. `ref` identifies it by kind: unit → unit number (optionally
 * `3#theory` with the step), exercise → item id (`1.1-2`), article → article id, writing → mission
 * id or `current`, vocabulary → card id or `cards`, free → a route or empty.
 * `snippet` is what the learner was looking at; the api treats it as untrusted data.
 */
export const TutorContext = z.object({
  kind: TutorContextKind,
  ref: z.string().trim().max(120).default(""),
  snippet: z.string().trim().max(2000).optional(),
});
export type TutorContext = z.infer<typeof TutorContext>;
export type TutorContextInput = z.input<typeof TutorContext>;

export const CreateConversationRequest = z.object({ context: TutorContext });
export type CreateConversationRequest = z.input<typeof CreateConversationRequest>;

export const CreateConversationResponse = z.object({ id: z.string() });
export type CreateConversationResponse = z.infer<typeof CreateConversationResponse>;

export const ConversationSummary = z.object({
  id: z.string(),
  context: TutorContext,
  /** The first learner message, shortened; `null` before the first message. */
  preview: z.string().nullable(),
  createdAt: z.string(),
});
export type ConversationSummary = z.infer<typeof ConversationSummary>;

export const ConversationsListResponse = z.object({ conversations: z.array(ConversationSummary) });
export type ConversationsListResponse = z.infer<typeof ConversationsListResponse>;

/** One tool the tutor used, as shown to the learner ("looked up Unit 3 theory"). */
export const TutorToolUse = z.object({
  name: z.string(),
  label: z.string(),
  ok: z.boolean(),
});
export type TutorToolUse = z.infer<typeof TutorToolUse>;

export const TutorMessageView = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "tool"]),
  content: z.string(),
  /** Tool messages: the tool that answered. */
  tool: TutorToolUse.nullable(),
  createdAt: z.string(),
});
export type TutorMessageView = z.infer<typeof TutorMessageView>;

export const ConversationDetail = z.object({
  id: z.string(),
  context: TutorContext,
  createdAt: z.string(),
  messages: z.array(TutorMessageView),
});
export type ConversationDetail = z.infer<typeof ConversationDetail>;

export const PostMessageRequest = z.object({ content: z.string().trim().min(1).max(2000) });
export type PostMessageRequest = z.infer<typeof PostMessageRequest>;

/** Server-sent events of one tutor turn; each SSE `data` line is one JSON event. */
export const TutorStreamEvent = z.discriminatedUnion("type", [
  /** The model is reasoning (sent once per round, before its text). */
  z.object({ type: z.literal("thinking") }),
  /** A piece of the answer, to append. */
  z.object({ type: z.literal("text"), text: z.string() }),
  /** The tutor used a tool. */
  z.object({ type: z.literal("tool"), tool: TutorToolUse }),
  /** The turn finished; `messageId` is the final assistant message. */
  z.object({ type: z.literal("done"), messageId: z.string().nullable() }),
  /** The turn failed; any partial text was kept. */
  z.object({ type: z.literal("error"), error: z.string(), message: z.string() }),
]);
export type TutorStreamEvent = z.infer<typeof TutorStreamEvent>;
