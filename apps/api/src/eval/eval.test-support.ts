// Test helpers for the eval module: a scripted LLM client (no network) and tiny fixtures.
import { z } from "zod";
import { runChatJson } from "../shared/llm/chat-json.ts";
import type { ChatRequest, LlmClient } from "../shared/llm/types.ts";
import type { EvalCase, EvalFixtures } from "./fixtures.ts";

export type Reply = (
  req: ChatRequest & { format?: Record<string, unknown> },
) => string | Promise<string>;

/** LlmClient whose `chatJson` attempts are answered by `reply`; records in-flight calls. */
export function scriptedLlm(reply: Reply) {
  const stats = { calls: 0, inFlight: 0, maxInFlight: 0 };
  const client: LlmClient = {
    async *chat() {
      yield { type: "done" };
    },
    chatJson: (req, schema) =>
      runChatJson(
        async (attempt) => {
          stats.calls += 1;
          stats.inFlight += 1;
          stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
          try {
            const content = await reply(attempt);
            return { content, toolCalls: [], usage: { promptTokens: 10, completionTokens: 5 } };
          } finally {
            stats.inFlight -= 1;
          }
        },
        req,
        schema,
      ),
    listModels: async () => [],
    modelCapabilities: async (model) => ({
      model,
      capabilities: ["completion", "thinking"],
      thinking: { values: ["low", "medium", "high"], default: "medium" },
    }),
  };
  return { client, stats };
}

const Simple = z.object({ score: z.number().min(0).max(1) });

const simpleCase = (sampleId: string): EvalCase => ({
  functionId: "review_writing",
  sampleId,
  label: sampleId,
  messages: [{ role: "user", content: sampleId }],
  schema: Simple,
  score: (output) => ({ metrics: { recall: (output as z.infer<typeof Simple>).score } }),
});

/** Three review cases scored by the reply's `score`; other functions have one case each. */
export function simpleFixtures(): EvalFixtures {
  return {
    review_writing: [simpleCase("a"), simpleCase("b"), simpleCase("c")],
    rewrite_natural: [{ ...simpleCase("r"), functionId: "rewrite_natural" }],
    hint_exercise: [{ ...simpleCase("h"), functionId: "hint_exercise" }],
  };
}

/** Resolves after pending microtasks and timers queued so far. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
