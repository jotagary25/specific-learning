import type { EvalSampleResult } from "@english-course/shared";
import { useQuery } from "@tanstack/react-query";
import { functionLabel } from "../settings/effort.ts";
import styles from "./EvalPage.module.css";
import { formatMs, percent } from "./estimate.ts";
import { evalKeys, fetchRun } from "./eval.api.ts";

const ACTIVE = new Set(["queued", "running"]);

function Metrics({ sample }: { sample: EvalSampleResult }) {
  const entries = Object.entries(sample.metrics);
  if (entries.length === 0) return null;
  return (
    <p className={styles.muted}>
      {entries.map(([id, value]) => `${id} ${percent(value)}`).join(" · ")}
    </p>
  );
}

function ReviewComparison({ review }: { review: NonNullable<EvalSampleResult["review"]> }) {
  return (
    <div className={styles.compare}>
      <div>
        <h5 className={styles.compareTitle}>Expected</h5>
        <ul className={styles.plainList}>
          {review.expected.map((e) => (
            <li
              key={`${e.span}-${e.correction}`}
              className={e.foundBy ? styles.found : styles.missed}
            >
              <strong>{e.span}</strong> → {e.correction}{" "}
              <span className={styles.muted}>
                ({e.type}, unit {e.unitId ?? "–"}) {e.foundBy ? `found by ${e.foundBy}` : "missed"}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h5 className={styles.compareTitle}>Reported</h5>
        {review.reported.length === 0 && <p className={styles.muted}>No errors reported.</p>}
        <ul className={styles.plainList}>
          {review.reported.map((r) => (
            <li key={r.id} className={r.verdict === "match" ? styles.found : styles.flagged}>
              <strong>{r.span}</strong>{" "}
              <span className={styles.muted}>
                ({r.type}, unit {r.unitId ?? "–"}
                {r.unitCorrect === false ? ", wrong unit" : ""})
              </span>
              <br />
              {r.hintEs}
              {r.leak && <span className={styles.badgeBad}> leaks the correction</span>}
              {r.verdict === "possible_real_error" && (
                <span className={styles.badgeWarn}> possible real error: review manually</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SampleOutput({ sample }: { sample: EvalSampleResult }) {
  if (sample.review) return <ReviewComparison review={sample.review} />;
  if (sample.output === undefined) return null;
  return <pre className={styles.output}>{JSON.stringify(sample.output, null, 2)}</pre>;
}

export function RunDetails({ id }: { id: string }) {
  const run = useQuery({
    queryKey: evalKeys.run(id),
    queryFn: () => fetchRun(id),
    refetchInterval: (query) =>
      query.state.data && ACTIVE.has(query.state.data.status) ? 2000 : false,
  });

  if (run.isPending) return <p className={styles.muted}>Loading details…</p>;
  if (run.isError) return <p className={styles.warning}>Could not load the run details.</p>;

  return (
    <div className={styles.details}>
      {run.data.error && <p className={styles.warning}>{run.data.error}</p>}
      {run.data.samples.length === 0 && <p className={styles.muted}>No samples yet.</p>}
      {run.data.samples.map((sample) => (
        <details key={`${sample.functionId}-${sample.sampleId}`} className={styles.sample}>
          <summary>
            {functionLabel(sample.functionId)} · {sample.label} ·{" "}
            {sample.ok ? "ok" : `failed (${sample.error?.code})`} · {formatMs(sample.latencyMs)}
            {sample.attempts > 1 ? " · JSON retry" : ""}
          </summary>
          <Metrics sample={sample} />
          {sample.error && <p className={styles.warning}>{sample.error.message}</p>}
          <SampleOutput sample={sample} />
        </details>
      ))}
    </div>
  );
}
