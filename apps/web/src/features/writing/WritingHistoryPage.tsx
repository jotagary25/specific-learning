import { FORMAT_LABELS } from "@english-course/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Sparkline } from "../../shared/ui/Sparkline.tsx";
import { LevelLine } from "./MissionCard.tsx";
import styles from "./Writing.module.css";
import { fetchHistory, writingKeys } from "./writing.api.ts";
import { flowLabel, versionLabel } from "./writing.model.ts";

export function WritingHistoryPage() {
  const history = useQuery({ queryKey: writingKeys.history, queryFn: fetchHistory });
  const missions = history.data?.missions ?? [];
  const scores = missions
    .filter((m) => m.status === "completed" && m.overall !== null)
    .map((m) => m.overall as number)
    .reverse();

  return (
    <div className={styles.page}>
      <div className={styles.row}>
        <h1 className={styles.title}>Writing history</h1>
        <Link to="/writing" className={styles.linkButton}>
          Back to writing
        </Link>
      </div>
      {history.isPending ? <p className={styles.muted}>Loading…</p> : null}
      {history.isError ? (
        <p role="alert" className={styles.error}>
          Could not load your history: {history.error.message}
        </p>
      ) : null}
      {history.data ? <LevelLine level={history.data.level} /> : null}
      {scores.length > 1 ? (
        <figure className={styles.card}>
          <Sparkline values={scores} label={`Overall scores over time: ${scores.join(", ")}`} />
          <figcaption className={styles.muted}>
            Overall score of completed missions, oldest to newest.
          </figcaption>
        </figure>
      ) : null}
      {history.data && missions.length === 0 ? (
        <p className={styles.muted}>No missions yet.</p>
      ) : null}
      <ul className={styles.history}>
        {missions.map((m) => (
          <li key={m.id} className={styles.card}>
            <div className={styles.row}>
              <strong>{m.title}</strong>
              <span className={styles.chip}>{FORMAT_LABELS[m.format]}</span>
            </div>
            <p className={styles.muted}>
              {new Date(m.createdAt).toLocaleDateString()} · {flowLabel(m.status)}
              {m.overall !== null ? ` · score ${m.overall}` : ""}
              {m.errorCount > 0 ? ` · fixed ${m.fixedCount} of ${m.errorCount} errors` : ""}
              {m.publishedVersion ? ` · published: ${versionLabel(m.publishedVersion)}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
