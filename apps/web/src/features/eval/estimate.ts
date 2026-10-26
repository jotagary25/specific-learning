import type { EvalFunctionId, EvalMetricId, EvalRunSummary } from "@english-course/shared";

/** LLM calls a run will make: fixtures per selected function × selected models. */
export function estimateCalls(
  counts: Partial<Record<EvalFunctionId, number>> | undefined,
  functions: readonly EvalFunctionId[],
  modelCount: number,
): number {
  if (!counts) return 0;
  return functions.reduce((sum, fn) => sum + (counts[fn] ?? 0), 0) * modelCount;
}

export type SortKey = "overall" | EvalMetricId | "latencyMeanMs" | "totalTokens";

/** Value used to sort a run by `key`; runs without a value sort last. */
export function sortValue(run: EvalRunSummary, key: SortKey): number | null {
  const agg = run.aggregate;
  if (!agg) return null;
  if (key === "overall") return agg.overall;
  if (key === "latencyMeanMs") return agg.latencyMeanMs;
  if (key === "totalTokens") return agg.totalTokens;
  return agg.metrics[key] ?? null;
}

/** Lower is better for latency and tokens; higher for every score. */
export const ascendingByDefault = (key: SortKey) =>
  key === "latencyMeanMs" || key === "totalTokens";

export function sortRuns(
  runs: readonly EvalRunSummary[],
  key: SortKey,
  direction: "asc" | "desc",
): EvalRunSummary[] {
  return [...runs].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return direction === "asc" ? va - vb : vb - va;
  });
}

export const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? "–" : `${Math.round(value * 100)}%`;

export const formatMs = (ms: number | null | undefined) =>
  ms === null || ms === undefined
    ? "–"
    : ms >= 1000
      ? `${(ms / 1000).toFixed(1)} s`
      : `${Math.round(ms)} ms`;
