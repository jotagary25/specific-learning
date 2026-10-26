// Scripted LLM and SSE helpers for the tutor tests.
import { TutorStreamEvent } from "@english-course/shared";
import type { ChatDelta, ChatRequest, LlmClient } from "../shared/llm/types.ts";

/** One model round: a list of deltas, or a generator that can wait, fail or watch the signal. */
export type Round = ChatDelta[] | ((req: ChatRequest) => AsyncIterable<ChatDelta>);

export type ScriptedLlm = LlmClient & { requests: ChatRequest[] };

/** `chat` plays the rounds in order; a missing round answers an empty `done`. */
export function scriptedLlm(rounds: Round[]): ScriptedLlm {
  const queue = [...rounds];
  const requests: ChatRequest[] = [];
  return {
    requests,
    async *chat(req) {
      requests.push({ ...req, messages: [...req.messages] });
      const round = queue.shift() ?? [{ type: "done" }];
      if (typeof round === "function") {
        yield* round(req);
        return;
      }
      for (const delta of round) yield delta;
    },
    chatJson: () => Promise.reject(new Error("chatJson is not scripted")),
    listModels: async () => [],
    modelCapabilities: (model) => Promise.reject(new Error(`no capabilities for ${model}`)),
  };
}

export const toolCall = (name: string, args: Record<string, unknown>): ChatDelta => ({
  type: "tool_call",
  call: { name, arguments: args },
});

export const text = (...parts: string[]): ChatDelta[] => [
  ...parts.map((part): ChatDelta => ({ type: "content", text: part })),
  { type: "done" },
];

/** Parses an SSE body into tutor events (one JSON event per `data:` line). */
export function parseSse(body: string): TutorStreamEvent[] {
  return body
    .split("\n\n")
    .flatMap((frame) => frame.split("\n").filter((line) => line.startsWith("data: ")))
    .map((line) => TutorStreamEvent.parse(JSON.parse(line.slice("data: ".length))));
}
