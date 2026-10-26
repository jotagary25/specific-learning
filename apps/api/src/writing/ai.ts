import type { z } from "zod";
import type { PromptDefinition } from "../prompts/index.ts";
import type { Settings } from "../settings/settings.service.ts";
import { isLlmError } from "../shared/llm/errors.ts";

export type WritingAi = Pick<Settings, "getLlmForFunction">;

/**
 * Runs one prompt with its AI function's model and effort. Any LLM failure (no key, offline,
 * invalid output) → undefined so the flow can degrade gracefully; other errors propagate.
 */
export async function runWritingAi<Input, Schema extends z.ZodType>(
  ai: WritingAi | undefined,
  userId: string,
  prompt: PromptDefinition<Input, Schema>,
  input: Input,
): Promise<z.output<Schema> | undefined> {
  if (!ai) return undefined;
  try {
    const { client, model, think } = await ai.getLlmForFunction(userId, prompt.id);
    const { data } = await client.chatJson(
      { model, think, messages: prompt.build(input) },
      prompt.schema,
    );
    return data;
  } catch (error) {
    if (!isLlmError(error)) throw error;
    console.warn(`writing: ${prompt.id} unavailable (${error.code})`);
    return undefined;
  }
}
