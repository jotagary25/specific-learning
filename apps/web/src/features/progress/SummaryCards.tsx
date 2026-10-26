import type { ProgressSummary } from "@english-course/shared";
import { Sparkline } from "../../shared/ui/Sparkline.tsx";
import styles from "./Progress.module.css";
import { DIMENSION_LABELS, minutesLabel, plural, signed } from "./progress.model.ts";

/** Plain numbers, each with its context in the same sentence (read as one by screen readers). */
export function SummaryCards({ summary }: { summary: ProgressSummary }) {
  const { units, words, minutes, articlesRead } = summary;
  return (
    <ul className={styles.cards} aria-label="At a glance">
      <li className={styles.card}>
        <p className={styles.figure}>
          <strong className={styles.number}>{units.completed}</strong> of {units.total} units
          completed
        </p>
        <p className={styles.muted}>
          {units.inProgress} in progress · {units.needsReview} to review
        </p>
      </li>
      <li className={styles.card}>
        <p className={styles.figure}>
          <strong className={styles.number}>{words.mature}</strong>{" "}
          {words.mature === 1 ? "word" : "words"} you know well
        </p>
        <p className={styles.muted}>
          of {plural(words.saved, "saved word")} · {words.learning} learning · {words.new} not
          reviewed yet
        </p>
      </li>
      <li className={styles.card}>
        <p className={styles.figure}>
          <strong className={styles.number}>{minutesLabel(minutes.last7Days)}</strong> studied in
          the last 7 days
        </p>
        <p className={styles.muted}>{minutesLabel(minutes.last30Days)} in the last 30 days</p>
      </li>
      <li className={styles.card}>
        <p className={styles.figure}>
          <strong className={styles.number}>{articlesRead}</strong>{" "}
          {articlesRead === 1 ? "article" : "articles"} read in English
        </p>
      </li>
    </ul>
  );
}

export function ScoreTrends({ writing }: { writing: ProgressSummary["writing"] }) {
  if (writing.reviewed === 0) {
    return <p className={styles.muted}>Your scores appear here after your first reviewed text.</p>;
  }
  return (
    <ul className={styles.trends}>
      {writing.dimensions.map((d) => {
        const label = DIMENSION_LABELS[d.dimension];
        const latest = d.values.at(-1);
        return (
          <li key={d.dimension} className={styles.card}>
            <p className={styles.figure}>
              {label}: <strong className={styles.number}>{latest ?? "–"}</strong>
              {d.change !== null ? (
                <span className={styles.muted}>
                  {" "}
                  ({signed(d.change)} over your last {plural(d.values.length, "text")})
                </span>
              ) : null}
            </p>
            {d.values.length > 1 ? (
              <Sparkline
                values={d.values}
                label={`${label} scores of your last ${d.values.length} reviewed texts, oldest to newest: ${d.values.join(", ")}`}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
