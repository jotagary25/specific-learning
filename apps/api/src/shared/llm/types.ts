import type { ModelCapabilities, ModelSummary, ThinkValue } from "@english-course/shared";
import type { z } from "zod";

export type { ModelCapabilities, ModelSummary, ThinkValue };

export type ToolCall = {
  /** Provider call id (OpenAI-style APIs); adapters synthesize one when it is missing. */
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; content: string; toolName: string; toolCallId?: string };

export type ToolDefinition = {
  name: string;
  description?: string;
  /** JSON schema object describing the arguments (e.g. from `z.toJSONSchema`). */
  parameters: Record<string, unknown>;
};

export type GenerationOptions = {
  temperature?: number;
  topP?: number;
  seed?: number;
  numCtx?: number;
  numPredict?: number;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  /** Omitted or `null` → model default. */
  think?: ThinkValue;
  tools?: ToolDefinition[];
  options?: GenerationOptions;
  signal?: AbortSignal;
};

export type Usage = {
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  /** Real cost in USD reported by the provider (OpenRouter `usage.cost`). */
  costUsd?: number;
};

export type ChatDelta =
  | { type: "thinking"; text: string }
  | { type: "content"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "done"; doneReason?: string; usage?: Usage };

/** Non-streaming chat result, used by `chatJson`. */
export type ChatCompletion = {
  content: string;
  thinking?: string;
  toolCalls: ToolCall[];
  doneReason?: string;
  usage?: Usage;
};

export type ChatJsonRequest = Omit<ChatRequest, "tools">;

export type ChatJsonResult<T> = {
  data: T;
  /** 1 when the first reply was valid, 2 when the retry was needed. */
  attempts: number;
  usage?: Usage;
};

export interface LlmClient {
  /** Streams deltas (thinking, content, tool calls) and ends with a `done` delta. */
  chat(req: ChatRequest): AsyncIterable<ChatDelta>;
  /** Structured output validated with zod; one retry with the validation error appended. */
  chatJson<S extends z.ZodType>(
    req: ChatJsonRequest,
    schema: S,
  ): Promise<ChatJsonResult<z.output<S>>>;
  listModels(opts?: { signal?: AbortSignal }): Promise<ModelSummary[]>;
  modelCapabilities(model: string, opts?: { signal?: AbortSignal }): Promise<ModelCapabilities>;
  /** Checks the key itself when listing models does not need one (OpenRouter). */
  verifyKey?(opts?: { signal?: AbortSignal }): Promise<void>;
}
