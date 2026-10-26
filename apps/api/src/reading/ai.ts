import type { z } from "zod";
import { prompts } from "../prompts/index.ts";
import type { Settings } from "../settings/settings.service.ts";
import { isLlmError } from "../shared/llm/errors.ts";

export type ReadingAi = Pick<Settings, "getLlmForFunction">;

export type ReadingAiFunction =
  | "select_article"
  | "annotate_article"
  | "gloss_word"
  | "grade_comprehension"
  | "recall_questions";

type Output<K extends ReadingAiFunction> = z.output<(typeof prompts)[K]["schema"]>;
type Input<K extends ReadingAiFunction> = Parameters<(typeof prompts)[K]["build"]>[0];

/**
 * Runs one AI function. Any LLM failure (no key, offline, invalid output) → undefined, so every
 * caller can degrade gracefully; other errors propagate.
 */
export async function runReadingAi<K extends ReadingAiFunction>(
  ai: ReadingAi | undefined,
  id: K,
  input: Input<K>,
): Promise<Output<K> | undefined> {
  if (!ai) return undefined;
  try {
    const { client, model, think } = await ai.getLlmForFunction(id);
    const prompt = prompts[id];
    const messages = (prompt.build as (value: Input<K>) => ReturnType<typeof prompt.build>)(input);
    const { data } = await client.chatJson({ model, think, messages }, prompt.schema);
    return data as Output<K>;
  } catch (error) {
    if (!isLlmError(error)) throw error;
    console.warn(`reading: ${id} unavailable (${error.code})`);
    return undefined;
  }
}
