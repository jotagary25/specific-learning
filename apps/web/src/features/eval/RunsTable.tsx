import type { EvalRunSummary } from "@english-course/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { encodeThink } from "../settings/effort.ts";
import styles from "./EvalPage.module.css";
import {
  ascendingByDefault,
  formatMs,
  formatUsd,
  percent,
  type SortKey,
  sortRuns,
} from "./estimate.ts";
import { applyRun, cancelRun, evalKeys } from "./eval.api.ts";
import { RunDetails } from "./RunDetails.tsx";

const COLUMNS: Array<{ key: SortKey; label: string; format: (run: EvalRunSummary) => string }> = [
  {
    key: "overall",
    label: "Overall",
    format: (r) => (r.aggregate?.overall == null ? "–" : r.aggregate.overall.toFixed(0)),
  },
  { key: "recall", label: "Recall", format: (r) => percent(r.aggregate?.metrics.recall) },
  {
    key: "hintLeakFree",
    label: "Hint leak-free",
    format: (r) => percent(r.aggregate?.metrics.hintLeakFree),
  },
  { key: "precision", label: "Precision", format: (r) => percent(r.aggregate?.metrics.precision) },
  {
    key: "unitAccuracy",
    label: "Unit links",
    format: (r) => percent(r.aggregate?.metrics.unitAccuracy),
  },
  {
    key: "spanishHints",
    label: "Spanish hints",
    format: (r) => percent(r.aggregate?.metrics.spanishHints),
  },
  {
    key: "rewriteQuality",
    label: "Rewrites",
    format: (r) => percent(r.aggregate?.metrics.rewriteQuality),
  },
  {
    key: "exerciseHintLeakFree",
    label: "Exercise hints",
    format: (r) => percent(r.aggregate?.metrics.exerciseHintLeakFree),
  },
  {
    key: "jsonValidity",
    label: "Valid JSON",
    format: (r) => percent(r.aggregate?.metrics.jsonValidity),
  },
  {
    key: "latencyMeanMs",
    label: "Latency (mean / p95)",
    format: (r) =>
      `${formatMs(r.aggregate?.latencyMeanMs)} / ${formatMs(r.aggregate?.latencyP95Ms)}`,
  },
  { key: "totalTokens", label: "Tokens", format: (r) => String(r.aggregate?.totalTokens ?? "–") },
  { key: "totalCostUsd", label: "Cost", format: (r) => formatUsd(r.aggregate?.totalCostUsd) },
];

const effortLabel = (run: EvalRunSummary) =>
  run.think === null ? "default" : encodeThink(run.think).replace(/^level:/, "");

function statusLabel(run: EvalRunSummary) {
  if (run.status === "running") return `running ${run.progress.done}/${run.progress.total}`;
  return run.status;
}

function RunActions({ run }: { run: EvalRunSummary }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const cancel = useMutation({
    mutationFn: () => cancelRun(run.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: evalKeys.runs }),
    onError: (error) => setMessage(error.message),
  });
  const apply = useMutation({
    mutationFn: () => applyRun(run.id, "review_writing"),
    onSuccess: async () => {
      setMessage("Now used for review_writing");
      await queryClient.invalidateQueries({ queryKey: ["settings", "ai-functions"] });
    },
    onError: (error) => setMessage(error.message),
  });
  const active = run.status === "queued" || run.status === "running";
  const canApply = run.status === "completed" && run.functions.includes("review_writing");

  return (
    <span className={styles.rowActions}>
      {active && (
        <button
          className={styles.secondary}
          type="button"
          onClick={() => cancel.mutate()}
          disabled={cancel.isPending}
          aria-label={`Cancel ${run.model}`}
        >
          Cancel
        </button>
      )}
      {canApply && (
        <button
          className={styles.primary}
          type="button"
          onClick={() => apply.mutate()}
          disabled={apply.isPending}
          aria-label={`Use ${run.model} for review_writing`}
        >
          Use for review_writing
        </button>
      )}
      <span role="status" className={styles.message}>
        {message}
      </span>
    </span>
  );
}

export function RunsTable({ runs }: { runs: EvalRunSummary[] }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "overall",
    direction: "desc",
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const sorted = sortRuns(runs, sort.key, sort.direction);

  const sortBy = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: ascendingByDefault(key) ? "asc" : "desc" },
    );

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Status</th>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={
                  sort.key === column.key
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  className={styles.sortButton}
                  type="button"
                  onClick={() => sortBy(column.key)}
                >
                  {column.label}
                  {sort.key === column.key ? (sort.direction === "asc" ? " ▲" : " ▼") : ""}
                </button>
              </th>
            ))}
            <th scope="col">
              <span className={styles.visuallyHidden}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((run) => (
            <Fragment key={run.id}>
              <tr data-testid="eval-run-row">
                <th scope="row" className={styles.modelCell}>
                  <button
                    className={styles.linkButton}
                    type="button"
                    aria-expanded={expanded === run.id}
                    onClick={() => setExpanded((current) => (current === run.id ? null : run.id))}
                  >
                    {run.model}
                  </button>
                  <span className={styles.muted}> {effortLabel(run)}</span>
                </th>
                <td>{statusLabel(run)}</td>
                {COLUMNS.map((column) => (
                  <td key={column.key}>{column.format(run)}</td>
                ))}
                <td>
                  <RunActions run={run} />
                </td>
              </tr>
              {expanded === run.id && (
                <tr>
                  <td colSpan={COLUMNS.length + 3}>
                    <RunDetails id={run.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
