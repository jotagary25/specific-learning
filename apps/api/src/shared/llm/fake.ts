// In-memory LlmClient for tests: scripted replies, recorded calls, no network.
import type { ModelCapabilities, ModelSummary } from "@english-course/shared";
import { runChatJson } from "./chat-json.ts";
import { LlmError } from "./errors.ts";
import type { ChatCompletion, ChatDelta, ChatRequest, LlmClient } from "./types.ts";

export type FakeLlmOptions = {
  models?: ModelSummary[];
  capabilities?: Record<string, Omit<ModelCapabilities, "model">>;
  /** Raw replies returned in order by `chatJson` attempts. */
  jsonReplies?: string[];
  /** Deltas streamed by each `chat` call, in order. */
  streams?: ChatDelta[][];
  /** When set, every call fails with this error. */
  failWith?: LlmError;
};

export type FakeLlm = LlmClient & {
  calls: Array<{ method: string; req?: ChatRequest & { format?: unknown }; model?: string }>;
};

export function createFakeLlm(options: FakeLlmOptions = {}): FakeLlm {
  const jsonReplies = [...(options.jsonReplies ?? [])];
  const streams = [...(options.streams ?? [])];
  const calls: FakeLlm["calls"] = [];

  const guard = () => {
    if (options.failWith) throw options.failWith;
  };

  return {
    calls,
    async *chat(req) {
      calls.push({ method: "chat", req });
      guard();
      for (const delta of streams.shift() ?? [{ type: "done" } as const]) yield delta;
    },
    chatJson(req, schema) {
      return runChatJson(
        async (attempt): Promise<ChatCompletion> => {
          calls.push({ method: "chatJson", req: attempt });
          guard();
          const content = jsonReplies.shift();
          if (content === undefined) throw new LlmError("upstream", "Fake LLM: no reply scripted");
          return { content, toolCalls: [] };
        },
        req,
        schema,
      );
    },
    async listModels() {
      calls.push({ method: "listModels" });
      guard();
      return options.models ?? [];
    },
    async modelCapabilities(model) {
      calls.push({ method: "modelCapabilities", model });
      guard();
      const found = options.capabilities?.[model];
      if (!found) throw new LlmError("not_found", `model "${model}" not found`, { status: 404 });
      return { model, ...found };
    },
  };
}
