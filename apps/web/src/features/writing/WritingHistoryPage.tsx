import { FORMAT_LABELS } from "@english-course/shared";
import { useQuery } from "@tanstack/react-query";
import { Badge, Eyebrow, Panel, Sparkline, Stat } from "../../shared/ui/index.ts";
import { LevelLine } from "./MissionCard.tsx";
import styles from "./Writing.module.css";
import { WritingHeader } from "./WritingPage.tsx";
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
      <WritingHeader
        eyebrow="Writing archive"
        title="Writing history"
        link={{ to: "/writing", label: "Back to writing" }}
        back
      />
      {history.isPending ? <p className={styles.muted}>Loading…</p> : null}
      {history.isError ? (
        <p role="alert" className={styles.error}>
          Could not load your history: {history.error.message}
        </p>
      ) : null}
      {history.data ? <LevelLine level={history.data.level} /> : null}
      {scores.length > 1 ? (
        <Panel tone="plum" padding="md" as="div" className={styles.trend}>
          <figure className={styles.trendFigure}>
            <div className={styles.trendHead}>
              <Eyebrow>Overall score</Eyebrow>
              <Stat size="lg" label="Latest" value={scores[scores.length - 1]} />
            </div>
            <Sparkline
              className={styles.sparkline}
              values={scores}
              label={`Overall scores over time: ${scores.join(", ")}`}
            />
            <figcaption className={styles.muted}>
              Overall score of completed missions, oldest to newest.
            </figcaption>
          </figure>
        </Panel>
      ) : null}
      {history.data && missions.length === 0 ? (
        <p className={styles.muted}>No missions yet.</p>
      ) : null}
      <ul className={styles.history}>
        {missions.map((m) => (
          <li key={m.id} className={styles.historyRow}>
            <span className={`numeral ${styles.historyScore}`} aria-hidden="true">
              {m.overall !== null ? m.overall : "—"}
            </span>
            <div className={styles.historyText}>
              <div className={styles.historyHead}>
                <strong className={styles.historyTitle}>{m.title}</strong>
                <Badge>{FORMAT_LABELS[m.format]}</Badge>
              </div>
              <p className={styles.muted}>
                {new Date(m.createdAt).toLocaleDateString()} · {flowLabel(m.status)}
                {m.overall !== null ? ` · score ${m.overall}` : ""}
                {m.errorCount > 0 ? ` · fixed ${m.fixedCount} of ${m.errorCount} errors` : ""}
                {m.publishedVersion ? ` · published: ${versionLabel(m.publishedVersion)}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
