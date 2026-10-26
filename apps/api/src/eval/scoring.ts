import {
  EVAL_WEIGHTS,
  type EvalAggregate,
  type EvalExpectedError,
  type EvalFunctionId,
  EvalMetricId,
  type EvalMetrics,
  type EvalReportedError,
  type EvalSampleResult,
  type HintExerciseOutput,
  type ReviewWritingOutput,
  type RewriteNaturalOutput,
} from "@english-course/shared";
import { leaksAnswer } from "../units/hint-guard.ts";

// Deterministic scoring of model outputs against the eval fixtures (docs/spec.md §3.10).
// The metric definitions and weights are documented on `EvalMetricId` / `EVAL_WEIGHTS`.

/** Max errors the review prompt allows; recall is measured against min(expected, this). */
export const MAX_REPORTED_ERRORS = 3;
/** Each reported error that overlaps no expected error costs this much precision. */
export const UNMATCHED_PENALTY = 0.5;

/** Lowercase, straight apostrophes, punctuation → spaces, single spaces. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whole-word, normalized containment. */
export function containsPhrase(haystack: string, needle: string): boolean {
  const n = normalizeText(needle);
  return n.length > 0 && ` ${normalizeText(haystack)} `.includes(` ${n} `);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Character range of `span` in `text`, case- and whitespace-insensitive (first occurrence). */
function locate(text: string, span: string): [number, number] | null {
  const trimmed = span.trim();
  if (!trimmed) return null;
  const pattern = trimmed.split(/\s+/).map(escapeRegExp).join("\\s+");
  const match = new RegExp(pattern, "iu").exec(text);
  return match ? [match.index, match.index + match[0].length] : null;
}

/**
 * True when two spans of `text` overlap. When a span cannot be located (the model paraphrased
 * it), falls back to normalized containment either way.
 */
export function spansOverlap(text: string, a: string, b: string): boolean {
  const ra = locate(text, a);
  const rb = locate(text, b);
  if (ra && rb) return ra[0] < rb[1] && rb[0] < ra[1];
  const na = normalizeText(a);
  const nb = normalizeText(b);
  return na.length > 0 && nb.length > 0 && (na.includes(nb) || nb.includes(na));
}

const SPANISH_STOP_WORDS = new Set(
  "el la los las del que en una es por para con se lo al como pero este esta estos estas su sus muy más qué cómo cuál aquí porque también sujeto verbo frase tiempo palabra usa fíjate revisa".split(
    " ",
  ),
);

/** Simple heuristic: at least two distinct Spanish stop-words. */
export function looksSpanish(text: string): boolean {
  const hits = new Set(
    normalizeText(text)
      .split(" ")
      .filter((w) => SPANISH_STOP_WORDS.has(w)),
  );
  return hits.size >= 2;
}

const mean = (values: readonly number[]) =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

const share = (flags: readonly boolean[]) => mean(flags.map((f) => (f ? 1 : 0)));

export type ExpectedError = {
  span: string;
  type: string;
  unitId: number | null;
  correction: string;
};

export type ReviewCase = {
  text: string;
  expected: ExpectedError[];
  /** Units the model could link to; an expected unit outside it should be reported as null. */
  catalogUnitIds: ReadonlySet<number>;
};

export function scoreReview(
  input: ReviewCase,
  output: ReviewWritingOutput,
): {
  metrics: EvalMetrics;
  review: { expected: EvalExpectedError[]; reported: EvalReportedError[] };
} {
  const expected: EvalExpectedError[] = input.expected.map((e) => ({ ...e, foundBy: null }));
  const linkTarget = (e: ExpectedError) =>
    e.unitId !== null && input.catalogUnitIds.has(e.unitId) ? e.unitId : null;
  // A correction already contained in the erroneous span (e.g. "the people" → "people") cannot
  // be told apart from quoting the learner, so it is not checked for leaks.
  const leakCheckable = (e: ExpectedError) => !containsPhrase(e.span, e.correction);

  const reported: EvalReportedError[] = output.errors.map((finding) => {
    const matches = input.expected.flatMap((e, index) =>
      spansOverlap(input.text, finding.span, e.span) ? [index] : [],
    );
    for (const index of matches) {
      const target = expected[index];
      if (target && target.foundBy === null) target.foundBy = finding.id;
    }
    const matched = matches.map((index) => input.expected[index] as ExpectedError);
    const checkable = matched.filter(leakCheckable);
    return {
      id: finding.id,
      span: finding.span,
      type: finding.type,
      unitId: finding.unitId,
      hintEs: finding.hintEs,
      matches,
      verdict: matches.length > 0 ? "match" : "possible_real_error",
      unitCorrect:
        matches.length > 0 ? matched.some((e) => linkTarget(e) === finding.unitId) : null,
      leak:
        checkable.length > 0
          ? checkable.some((e) => containsPhrase(finding.hintEs, e.correction))
          : null,
    };
  });

  const found = expected.filter((e) => e.foundBy !== null).length;
  const recallBase = Math.min(expected.length, MAX_REPORTED_ERRORS);
  const matchedReported = reported.filter((r) => r.verdict === "match");
  const unmatched = reported.length - matchedReported.length;
  const leaks = reported.flatMap((r) => (r.leak === null ? [] : [r.leak]));
  const units = reported.flatMap((r) => (r.unitCorrect === null ? [] : [r.unitCorrect]));
  const leakShare = share(leaks);

  return {
    metrics: {
      recall: recallBase === 0 ? null : Math.min(1, found / recallBase),
      precision:
        reported.length === 0
          ? null
          : (matchedReported.length + UNMATCHED_PENALTY * unmatched) / reported.length,
      unitAccuracy: share(units),
      hintLeakFree: leakShare === null ? null : 1 - leakShare,
      spanishHints: share(output.errors.map((e) => looksSpanish(e.hintEs))),
      errorLimit: output.errors.length <= MAX_REPORTED_ERRORS ? 1 : 0,
    },
    review: { expected, reported },
  };
}

const ENGLISH_STOP_WORDS = new Set(
  "the a an and or but to of in on at for with by from is are was were be been being am you he she it we they this that these those my your his her its our their me him us them very really just so not do does did have has had will would can could should about into than then there here what which who when where how all some any more most much many also as if up out now get got".split(
    " ",
  ),
);

const words = (text: string) => normalizeText(text).split(" ").filter(Boolean);

const stem = (word: string) =>
  word.length > 4 ? word.replace(/(ing|ed|es|s)$/, "").replace(/'s$/, "") : word;

/** Content words: ≥ 3 letters, not a stop-word, lightly stemmed. */
function contentWords(text: string): Set<string> {
  return new Set(
    words(text)
      .filter((w) => w.length >= 3 && !ENGLISH_STOP_WORDS.has(w))
      .map(stem),
  );
}

export const MEANING_MIN_OVERLAP = 0.5;
export const LENGTH_TOLERANCE = 0.4;

export function scoreRewrite(
  input: string,
  output: RewriteNaturalOutput,
): { metrics: EvalMetrics; checks: Record<string, number> } {
  const registers = new Set(output.versions.map((v) => v.register)).size;
  const sourceWords = contentWords(input);
  const sourceLength = words(input).length;
  const keepsMeaning = (text: string) => {
    if (sourceWords.size === 0) return true;
    const own = contentWords(text);
    const shared = [...sourceWords].filter((w) => own.has(w)).length;
    return shared / sourceWords.size >= MEANING_MIN_OVERLAP;
  };
  const lengthOk = (text: string) =>
    Math.abs(words(text).length - sourceLength) <= LENGTH_TOLERANCE * sourceLength;

  const checks = {
    registers: registers === output.versions.length && registers >= 2 && registers <= 3 ? 1 : 0,
    meaning: share(output.versions.map((v) => keepsMeaning(v.text))) ?? 0,
    length: share(output.versions.map((v) => lengthOk(v.text))) ?? 0,
  };
  return {
    metrics: { rewriteQuality: (checks.registers + checks.meaning + checks.length) / 3 },
    checks,
  };
}

export function scoreExerciseHint(
  output: HintExerciseOutput,
  keyBlanks: readonly (readonly string[])[],
): EvalMetrics {
  return { exerciseHintLeakFree: leaksAnswer(output.hintEs, keyBlanks) ? 0 : 1 };
}

/**
 * Metrics of a failed call: 0 on recall and rewrite quality (the learner gets nothing); leak
 * metrics ignore it, since no text cannot leak. Reliability shows in jsonValidity/failures.
 */
export function failedMetrics(functionId: EvalFunctionId): EvalMetrics {
  if (functionId === "review_writing") return { recall: 0 };
  if (functionId === "rewrite_natural") return { rewriteQuality: 0 };
  return {};
}

/** Weighted 0–100 over the measurable (non-null) metrics, weights renormalized. */
export function overallScore(metrics: EvalMetrics): number | null {
  let weighted = 0;
  let weights = 0;
  for (const id of EvalMetricId.options) {
    const value = metrics[id];
    if (value === null || value === undefined) continue;
    weighted += EVAL_WEIGHTS[id] * value;
    weights += EVAL_WEIGHTS[id];
  }
  return weights === 0 ? null : (weighted / weights) * 100;
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? null;
}

export function aggregate(samples: readonly EvalSampleResult[]): EvalAggregate {
  const metrics: EvalMetrics = {};
  for (const id of EvalMetricId.options) {
    if (id === "jsonValidity") continue;
    const values = samples.flatMap((s) => {
      const value = s.metrics[id];
      return value === null || value === undefined ? [] : [value];
    });
    if (values.length > 0) metrics[id] = mean(values);
  }
  const calls = samples.length;
  const jsonFailures = samples.filter((s) => s.error?.code === "invalid_output").length;
  const jsonFailureRate = calls === 0 ? null : jsonFailures / calls;
  if (jsonFailureRate !== null) metrics.jsonValidity = 1 - jsonFailureRate;
  const latencies = samples.map((s) => s.latencyMs);
  const costs = samples.flatMap((s) => (s.costUsd === undefined ? [] : [s.costUsd]));

  return {
    metrics,
    overall: overallScore(metrics),
    calls,
    failures: samples.filter((s) => !s.ok).length,
    jsonFailureRate,
    retryRate: calls === 0 ? null : samples.filter((s) => s.attempts >= 2).length / calls,
    latencyMeanMs: mean(latencies),
    latencyP95Ms: percentile(latencies, 0.95),
    totalTokens: samples.reduce((sum, s) => sum + (s.tokens ?? 0), 0),
    ...(costs.length > 0 ? { totalCostUsd: costs.reduce((sum, c) => sum + c, 0) } : {}),
  };
}
