import { z } from "zod";
import { AiFunctionId, ThinkValue } from "../settings/index.ts";

/**
 * Model evaluation (docs/spec.md §3.10): runs AI functions over fixed fixtures with one model
 * config and scores the outputs deterministically, so model choice rests on evidence.
 */

export const EvalFunctionId = z.enum(["review_writing", "rewrite_natural", "hint_exercise"]);
export type EvalFunctionId = z.infer<typeof EvalFunctionId>;

export const EvalModelConfig = z.object({
  model: z.string().trim().min(1).max(200),
  think: ThinkValue,
});
export type EvalModelConfig = z.infer<typeof EvalModelConfig>;

export const MAX_EVAL_MODELS = 8;

export const StartEvalRequest = z.object({
  models: z.array(EvalModelConfig).min(1).max(MAX_EVAL_MODELS),
  functions: z
    .array(EvalFunctionId)
    .min(1)
    .transform((ids) => [...new Set(ids)])
    .default(["review_writing"]),
});
export type StartEvalRequest = z.input<typeof StartEvalRequest>;

export const StartEvalResponse = z.object({ runIds: z.array(z.string()) });
export type StartEvalResponse = z.infer<typeof StartEvalResponse>;

export const EvalFixturesResponse = z.object({
  /** Number of fixtures (= LLM calls per model) for each function. */
  counts: z.record(EvalFunctionId, z.number().int().nonnegative()),
});
export type EvalFixturesResponse = z.infer<typeof EvalFixturesResponse>;

export const EvalRunStatus = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export type EvalRunStatus = z.infer<typeof EvalRunStatus>;

/**
 * Metrics, each 0–1 (higher is better). `null` = not measurable for that sample or run.
 * - recall: expected errors found (overlapping span) / min(expected, 3) — the prompt allows 3.
 * - precision: (matched + 0.5 × unmatched) / reported; unmatched findings are flagged
 *   "possible real error" for manual review instead of counting as a hard false positive.
 * - unitAccuracy: matched findings whose unitId equals the expected one (an expected unit that
 *   is outside the eval catalog counts as `null`).
 * - hintLeakFree: 1 − share of matched hints that contain the expected correction.
 * - spanishHints: share of hints that read as Spanish (≥ 2 Spanish stop-words).
 * - errorLimit: the reply reports at most 3 errors.
 * - rewriteQuality: mean of 2–3 distinct registers, meaning kept (≥ 50% content words), and
 *   length within ±40%.
 * - exerciseHintLeakFree: the exercise hint does not contain any accepted answer.
 * - jsonValidity: 1 − share of calls that never produced schema-valid JSON.
 */
export const EvalMetricId = z.enum([
  "recall",
  "hintLeakFree",
  "precision",
  "unitAccuracy",
  "spanishHints",
  "errorLimit",
  "jsonValidity",
  "rewriteQuality",
  "exerciseHintLeakFree",
]);
export type EvalMetricId = z.infer<typeof EvalMetricId>;

/** Weights of the overall score; recall and hint leaks weigh most. Sum = 1. */
export const EVAL_WEIGHTS: Record<EvalMetricId, number> = {
  recall: 0.3,
  hintLeakFree: 0.25,
  precision: 0.1,
  unitAccuracy: 0.1,
  spanishHints: 0.05,
  errorLimit: 0.05,
  jsonValidity: 0.05,
  rewriteQuality: 0.05,
  exerciseHintLeakFree: 0.05,
};

export const EvalMetrics = z.partialRecord(EvalMetricId, z.number().min(0).max(1).nullable());
export type EvalMetrics = z.infer<typeof EvalMetrics>;

export const EvalExpectedError = z.object({
  span: z.string(),
  type: z.string(),
  unitId: z.number().int().nullable(),
  correction: z.string(),
  /** Id of the reported error that found it, or null when missed. */
  foundBy: z.string().nullable(),
});
export type EvalExpectedError = z.infer<typeof EvalExpectedError>;

export const EvalReportedError = z.object({
  id: z.string(),
  span: z.string(),
  type: z.string(),
  unitId: z.number().int().nullable(),
  hintEs: z.string(),
  /** Indexes of the expected errors this finding overlaps. */
  matches: z.array(z.number().int().nonnegative()),
  verdict: z.enum(["match", "possible_real_error"]),
  unitCorrect: z.boolean().nullable(),
  leak: z.boolean().nullable(),
});
export type EvalReportedError = z.infer<typeof EvalReportedError>;

export const EvalSampleResult = z.object({
  functionId: EvalFunctionId,
  sampleId: z.string(),
  label: z.string(),
  ok: z.boolean(),
  latencyMs: z.number().nonnegative(),
  /** chatJson attempts: 1, or 2 when the JSON retry was needed; 0 when the call failed. */
  attempts: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
  metrics: EvalMetrics,
  /** Sub-checks behind a composite metric (e.g. rewrite registers/meaning/length), 0–1. */
  checks: z.record(z.string(), z.number()).optional(),
  review: z
    .object({ expected: z.array(EvalExpectedError), reported: z.array(EvalReportedError) })
    .optional(),
  /** Parsed model output, kept for manual review. */
  output: z.unknown().optional(),
});
export type EvalSampleResult = z.infer<typeof EvalSampleResult>;

export const EvalAggregate = z.object({
  metrics: EvalMetrics,
  /** Weighted 0–100 over the measurable metrics (weights renormalized). */
  overall: z.number().min(0).max(100).nullable(),
  calls: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  jsonFailureRate: z.number().min(0).max(1).nullable(),
  retryRate: z.number().min(0).max(1).nullable(),
  latencyMeanMs: z.number().nonnegative().nullable(),
  latencyP95Ms: z.number().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative(),
});
export type EvalAggregate = z.infer<typeof EvalAggregate>;

/** Everything stored in `eval_run.results` (model and effort have their own columns). */
export const EvalRunState = z.object({
  version: z.literal(1),
  think: ThinkValue,
  functions: z.array(EvalFunctionId).min(1),
  status: EvalRunStatus,
  progress: z.object({
    done: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
  samples: z.array(EvalSampleResult),
  aggregate: EvalAggregate.nullable(),
});
export type EvalRunState = z.infer<typeof EvalRunState>;

export const EvalRun = EvalRunState.omit({ version: true }).extend({
  id: z.string(),
  model: z.string(),
  createdAt: z.string(),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalRunSummary = EvalRun.omit({ samples: true });
export type EvalRunSummary = z.infer<typeof EvalRunSummary>;

export const EvalRunsResponse = z.object({ runs: z.array(EvalRunSummary) });
export type EvalRunsResponse = z.infer<typeof EvalRunsResponse>;

export const ApplyEvalRequest = z.object({ functionId: AiFunctionId });
export type ApplyEvalRequest = z.infer<typeof ApplyEvalRequest>;
