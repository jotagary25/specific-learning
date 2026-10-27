import { EVAL_WEIGHTS } from "@english-course/shared";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Link } from "react-router";
import { ArrowLeftIcon, Eyebrow } from "../../shared/ui/index.ts";
import styles from "./EvalPage.module.css";
import { evalKeys, fetchRuns } from "./eval.api.ts";
import { RunForm } from "./RunForm.tsx";
import { RunsTable } from "./RunsTable.tsx";

const weights = Object.entries(EVAL_WEIGHTS)
  .map(([id, weight]) => `${id} ${Math.round(weight * 100)}%`)
  .join(", ");

export function EvalPage() {
  const runsTitle = useId();
  const runs = useQuery({
    queryKey: evalKeys.runs,
    queryFn: fetchRuns,
    // Live progress while any run is queued or running.
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === "queued" || r.status === "running") ? 2000 : false,
  });

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <Link to="/settings" className={styles.back}>
          <ArrowLeftIcon size={18} />
          Settings
        </Link>
        <Eyebrow rule>Benchmarks</Eyebrow>
        <h1 className={styles.title}>Model evaluation</h1>
        <p className={styles.lead}>
          Runs the real prompts over fixed learner texts and exercise items, then scores each model
          deterministically: errors found, hint leaks, unit links, JSON validity, latency and
          tokens.
        </p>
      </header>
      <RunForm />
      <section className={styles.section} aria-labelledby={runsTitle}>
        <div className={styles.sectionHead}>
          <span className={`numeral ${styles.sectionNumber}`} aria-hidden="true">
            02
          </span>
          <h2 id={runsTitle} className={styles.heading}>
            Results
          </h2>
        </div>
        <p className={styles.muted}>Overall score weights: {weights}.</p>
        {runs.isPending && <p className={styles.muted}>Loading…</p>}
        {runs.isError && <p className={styles.warning}>Could not load the runs.</p>}
        {runs.isSuccess && runs.data.length === 0 && (
          <p className={styles.muted}>No runs yet. Pick models above and run an evaluation.</p>
        )}
        {runs.isSuccess && runs.data.length > 0 && <RunsTable runs={runs.data} />}
      </section>
    </div>
  );
}
