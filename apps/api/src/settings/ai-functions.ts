import type {
  AiFunctionId,
  AiFunctionTier,
  AiProviderId,
  ThinkingControls,
  ThinkValue,
} from "@english-course/shared";

/**
 * Default models per provider and tier (catalogs checked Oct 2026); changeable in Settings.
 * OpenRouter mirrors the Ollama picks (same model families, so prompts and evals carry over):
 * both support `tools` and `structured_outputs` and are cheap — gemma-4-31b-it $0.20/$0.40 and
 * deepseek-v4-pro $0.78/$1.55 per 1M input/output tokens.
 */
export const DEFAULT_MODELS: Record<AiProviderId, Record<AiFunctionTier, string>> = {
  ollama: { fast: "gemma4:31b", quality: "deepseek-v4-pro" },
  openrouter: { fast: "google/gemma-4-31b-it", quality: "deepseek/deepseek-v4-pro" },
};

type CatalogEntry = { tier: AiFunctionTier; think: ThinkValue };

/** Tier and default effort per AI function (docs/spec.md §4). */
export const AI_FUNCTIONS: Record<AiFunctionId, CatalogEntry> = {
  check_answer: { tier: "fast", think: "low" },
  hint_exercise: { tier: "fast", think: "low" },
  explain_tutor: { tier: "quality", think: "medium" },
  select_article: { tier: "fast", think: "medium" },
  annotate_article: { tier: "quality", think: "medium" },
  gloss_word: { tier: "fast", think: "low" },
  grade_comprehension: { tier: "fast", think: "low" },
  review_writing: { tier: "quality", think: "high" },
  recheck_writing: { tier: "fast", think: "low" },
  rewrite_natural: { tier: "quality", think: "medium" },
  generate_mission: { tier: "quality", think: "medium" },
  generate_practice: { tier: "quality", think: "medium" },
  recall_questions: { tier: "fast", think: "low" },
};

export type AiFunctionSetting = { model: string; think: ThinkValue };

export function defaultFor(id: AiFunctionId, provider: AiProviderId = "ollama"): AiFunctionSetting {
  const entry = AI_FUNCTIONS[id];
  return { model: DEFAULT_MODELS[provider][entry.tier], think: entry.think };
}

/**
 * Whether `think` is acceptable for a model whose controls are known. `null` (model default)
 * is always fine; without thinking metadata only booleans are accepted.
 */
export function isThinkSupported(think: ThinkValue, thinking: ThinkingControls | null): boolean {
  if (think === null) return true;
  if (!thinking) return typeof think === "boolean";
  return thinking.values.includes(think);
}

/**
 * Maps a stored effort onto what the model supports, so a level chosen for one model never
 * breaks another: levels become on/off for boolean-only models ("low" → off when allowed),
 * anything else unsupported falls back to the model default (`null`).
 */
export function normalizeThink(think: ThinkValue, thinking: ThinkingControls | null): ThinkValue {
  if (think === null || isThinkSupported(think, thinking)) return think;
  if (!thinking) return null;
  const booleansOnly = thinking.values.every((value) => typeof value === "boolean");
  if (typeof think === "string" && booleansOnly) {
    if (think === "low" && thinking.values.includes(false)) return false;
    if (thinking.values.includes(true)) return true;
  }
  return null;
}
