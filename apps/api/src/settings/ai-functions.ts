import type {
  AiFunctionId,
  AiFunctionTier,
  ThinkingControls,
  ThinkValue,
} from "@english-course/shared";

/** Default models per tier (Ollama Cloud catalog, Oct 2026); changeable in Settings. */
export const DEFAULT_MODELS: Record<AiFunctionTier, string> = {
  fast: "gemma4:31b",
  quality: "deepseek-v4-pro",
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

export function defaultFor(id: AiFunctionId): AiFunctionSetting {
  const entry = AI_FUNCTIONS[id];
  return { model: DEFAULT_MODELS[entry.tier], think: entry.think };
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
