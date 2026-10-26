import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import styles from "./Reading.module.css";
import { ReadingFlow } from "./ReadingFlow.tsx";
import { RecallCard } from "./RecallCard.tsx";
import { fetchToday, readingKeys, runEditor } from "./reading.api.ts";

function EmptyState() {
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: runEditor,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: readingKeys.all }),
  });
  const result = run.data;
  return (
    <div className={styles.card}>
      <p className={styles.muted}>
        Today's article is not ready yet. The editor picks one every morning.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={run.isPending}
          onClick={() => run.mutate()}
        >
          {run.isPending ? "Choosing an article…" : "Run editor now"}
        </button>
      </div>
      {result?.status === "no-candidates" ? (
        <p className={styles.error} role="status">
          No suitable article found right now
          {result.sources.some((s) => s.error)
            ? ` (${result.sources.flatMap((s) => (s.error ? [`${s.name}: ${s.error}`] : [])).join("; ")})`
            : ""}
          . Try again later.
        </p>
      ) : null}
      {run.isError ? <p className={styles.error}>{run.error.message}</p> : null}
    </div>
  );
}

/** `/reading`: yesterday's recall (when due) and today's 6-step reading. */
export function ReadingPage() {
  const today = useQuery({ queryKey: readingKeys.today, queryFn: fetchToday });
  return (
    <section className={styles.page} aria-labelledby="reading-title">
      <div className={styles.row}>
        <h1 id="reading-title" className={styles.title}>
          Today's reading
        </h1>
        <Link to="/reading/history" className={styles.muted}>
          History
        </Link>
      </div>
      <RecallCard />
      {today.isPending ? <p className={styles.muted}>Loading…</p> : null}
      {today.isError ? <p className={styles.error}>{today.error.message}</p> : null}
      {today.data && !today.data.reading ? <EmptyState /> : null}
      {today.data?.reading ? <ReadingFlow detail={today.data.reading} /> : null}
    </section>
  );
}
