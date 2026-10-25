import { z } from "zod";

/** Every AI function from the spec catalog (docs/spec.md §4). */
export const AiFunctionId = z.enum([
  "check_answer",
  "hint_exercise",
  "explain_tutor",
  "select_article",
  "annotate_article",
  "gloss_word",
  "grade_comprehension",
  "review_writing",
  "recheck_writing",
  "rewrite_natural",
  "generate_mission",
  "generate_practice",
  "recall_questions",
]);
export type AiFunctionId = z.infer<typeof AiFunctionId>;

export const AiFunctionTier = z.enum(["fast", "quality"]);
export type AiFunctionTier = z.infer<typeof AiFunctionTier>;

/**
 * Ollama `think` value: `true`/`false`, a model-defined level string (e.g. `"high"`),
 * or `null` for the model default. Numbers are not supported by Ollama.
 */
export const ThinkValue = z.union([z.boolean(), z.string().trim().min(1).max(32), z.null()]);
export type ThinkValue = z.infer<typeof ThinkValue>;

export const ApiError = z.object({
  error: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;

// --- auth ---

export const LoginRequest = z.object({ password: z.string().min(1).max(512) });
export type LoginRequest = z.infer<typeof LoginRequest>;

export const AuthStatus = z.object({ authenticated: z.boolean() });
export type AuthStatus = z.infer<typeof AuthStatus>;

// --- Ollama API key ---

export const AiKeyStatus = z.object({
  configured: z.boolean(),
  source: z.enum(["db", "env"]).nullable(),
  last4: z.string().max(4).nullable(),
});
export type AiKeyStatus = z.infer<typeof AiKeyStatus>;

export const PutAiKeyRequest = z.object({
  apiKey: z
    .string()
    .trim()
    .min(8, "The API key looks too short")
    .max(512)
    .regex(/^\S+$/, "The API key must not contain spaces"),
});
export type PutAiKeyRequest = z.infer<typeof PutAiKeyRequest>;

export const AiKeyTestResult = z.object({
  ok: z.boolean(),
  modelCount: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});
export type AiKeyTestResult = z.infer<typeof AiKeyTestResult>;

// --- models ---

export const ModelSummary = z.object({
  name: z.string(),
  modifiedAt: z.string().optional(),
  size: z.number().optional(),
});
export type ModelSummary = z.infer<typeof ModelSummary>;

export const ModelsResponse = z.object({ models: z.array(ModelSummary) });
export type ModelsResponse = z.infer<typeof ModelsResponse>;

export const ThinkingControls = z.object({
  values: z.array(z.union([z.boolean(), z.string()])),
  default: z.union([z.boolean(), z.string()]),
});
export type ThinkingControls = z.infer<typeof ThinkingControls>;

export const ModelCapabilities = z.object({
  model: z.string(),
  capabilities: z.array(z.string()),
  /** `null` when the model advertises no thinking metadata. */
  thinking: ThinkingControls.nullable(),
});
export type ModelCapabilities = z.infer<typeof ModelCapabilities>;

// --- per-function config ---

export const AiFunctionConfig = z.object({
  id: AiFunctionId,
  tier: AiFunctionTier,
  model: z.string(),
  think: ThinkValue,
  defaultModel: z.string(),
  defaultThink: ThinkValue,
  /** True when no override is stored and the code defaults apply. */
  isDefault: z.boolean(),
});
export type AiFunctionConfig = z.infer<typeof AiFunctionConfig>;

export const AiFunctionsResponse = z.object({ functions: z.array(AiFunctionConfig) });
export type AiFunctionsResponse = z.infer<typeof AiFunctionsResponse>;

export const UpdateAiFunctionRequest = z.object({
  model: z.string().trim().min(1).max(200),
  think: ThinkValue,
});
export type UpdateAiFunctionRequest = z.infer<typeof UpdateAiFunctionRequest>;
