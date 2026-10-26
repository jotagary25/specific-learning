// The tutor's agent loop: stream a reply, run the tools the model asks for, repeat, then answer.
import type { TutorStreamEvent } from "@english-course/shared";
import { isLlmError } from "../shared/llm/errors.ts";
import type { ChatMessage, LlmClient, ThinkValue, ToolCall } from "../shared/llm/types.ts";
import type { ToolRunContext, TutorTools } from "./tools.ts";
import { FORCE_ANSWER } from "./tutor.prompt.ts";
import type { MessageRecord, NewMessage } from "./tutor.store.ts";

/** Tool rounds per turn; after them the model must answer without tools. */
export const MAX_TOOL_ROUNDS = 4;

export type AgentOptions = {
  llm: LlmClient;
  model: string;
  think?: ThinkValue;
  /** System prompt, earlier turns and the new learner message. */
  messages: ChatMessage[];
  tools: TutorTools;
  ctx: ToolRunContext;
  signal: AbortSignal;
  persist: (message: Omit<NewMessage, "conversationId">) => Promise<MessageRecord>;
};

function describeError(error: unknown): { error: string; message: string } {
  if (isLlmError(error)) {
    const unavailable = error.code === "not_configured" || error.code === "invalid_key";
    return {
      error: unavailable ? "ai-unavailable" : error.code,
      message: unavailable
        ? "The AI tutor is unavailable (check the Ollama API key in Settings)."
        : `The tutor stopped: ${error.message}`,
    };
  }
  console.error("tutor: turn failed", error);
  return { error: "internal", message: "The tutor stopped because of an unexpected error." };
}

/**
 * Runs one learner turn and yields stream events. Every assistant round and tool result is
 * persisted; on failure the partial text is kept and an `error` event closes the turn. When the
 * signal aborts (client gone) the partial text is kept and the loop ends silently.
 */
export async function* runTutorTurn(options: AgentOptions): AsyncGenerator<TutorStreamEvent> {
  const { llm, model, think, tools, ctx, signal, persist } = options;
  const messages = [...options.messages];

  for (let round = 0; ; round += 1) {
    const forced = round >= MAX_TOOL_ROUNDS;
    let content = "";
    const calls: ToolCall[] = [];
    let thinkingSent = false;

    try {
      const stream = llm.chat({
        model,
        think,
        messages: forced ? [...messages, { role: "system", content: FORCE_ANSWER }] : messages,
        tools: forced || tools.definitions.length === 0 ? undefined : tools.definitions,
        signal,
      });
      for await (const delta of stream) {
        if (signal.aborted) break;
        if (delta.type === "thinking" && !thinkingSent && !content) {
          thinkingSent = true;
          yield { type: "thinking" };
        } else if (delta.type === "content" && delta.text) {
          content += delta.text;
          yield { type: "text", text: delta.text };
        } else if (delta.type === "tool_call" && !forced) {
          calls.push(delta.call);
        }
      }
      if (signal.aborted) throw signal.reason ?? new Error("aborted");
    } catch (error) {
      if (content.trim()) await persist({ role: "assistant", content, toolCalls: null });
      if (signal.aborted) return;
      yield { type: "error", ...describeError(error) };
      return;
    }

    const assistant = await persist({
      role: "assistant",
      content,
      toolCalls:
        calls.length > 0 ? calls.map((c) => ({ name: c.name, arguments: c.arguments })) : null,
    });
    messages.push({
      role: "assistant",
      content,
      ...(calls.length > 0 ? { toolCalls: calls } : {}),
    });
    if (calls.length === 0) {
      yield { type: "done", messageId: assistant.id };
      return;
    }

    for (const call of calls) {
      if (signal.aborted) return;
      const outcome = await tools.run(call.name, call.arguments, ctx);
      await persist({
        role: "tool",
        content: outcome.content,
        toolName: call.name,
        toolCalls: [
          {
            name: call.name,
            arguments: outcome.arguments,
            label: outcome.tool.label,
            ok: outcome.tool.ok,
          },
        ],
      });
      messages.push({ role: "tool", content: outcome.content, toolName: call.name });
      yield { type: "tool", tool: outcome.tool };
    }
  }
}
