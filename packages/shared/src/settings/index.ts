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

/** Email is matched case-insensitively (the api lowercases it). */
export const LoginRequest = z.object({
  email: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(512),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const UserRole = z.enum(["admin", "learner"]);
export type UserRole = z.infer<typeof UserRole>;

/** The signed-in account as the web sees it. */
export const SessionUser = z.object({ email: z.string(), role: UserRole });
export type SessionUser = z.infer<typeof SessionUser>;

export const AuthStatus = z.object({
  authenticated: z.boolean(),
  user: SessionUser.optional(),
});
export type AuthStatus = z.infer<typeof AuthStatus>;

// --- AI provider ---

export const AiProviderId = z.enum(["ollama", "openrouter"]);
export type AiProviderId = z.infer<typeof AiProviderId>;

/** The user's active provider and the providers this instance can use. */
export const AiProviderResponse = z.object({
  provider: AiProviderId,
  available: z.array(AiProviderId),
});
export type AiProviderResponse = z.infer<typeof AiProviderResponse>;

export const UpdateAiProviderRequest = z.object({ provider: AiProviderId });
export type UpdateAiProviderRequest = z.infer<typeof UpdateAiProviderRequest>;

// --- provider API keys ---

export const AiKeyStatus = z.object({
  /** True when the user has a stored key that decrypts. Keys are only set from Settings. */
  configured: z.boolean(),
  source: z.enum(["db"]).nullable(),
  last4: z.string().max(4).nullable(),
  /** `undecryptable`: a key is stored but APP_SECRET can no longer decrypt it. */
  error: z.literal("undecryptable").optional(),
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
  /** OpenRouter: human-readable name, context window and price in USD per 1M tokens. */
  displayName: z.string().optional(),
  contextLength: z.number().int().nonnegative().optional(),
  pricing: z
    .object({ inputPerMTok: z.number().nonnegative(), outputPerMTok: z.number().nonnegative() })
    .optional(),
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
export * from "./preferences.ts";
export * from "./time-zone.ts";
