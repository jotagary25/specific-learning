import { highlightSpans, type SubmissionView } from "@english-course/shared";
import { Link } from "react-router";
import styles from "./Writing.module.css";
import { errorStatusLabel, errorTypeLabel } from "./writing.model.ts";

/** The learner's live text with the open errors highlighted, plus one Spanish hint per error. */
export function ReviewPanel({ text, submission }: { text: string; submission: SubmissionView }) {
  const numbered = submission.errors.map((error, index) => ({ ...error, n: index + 1 }));
  const open = numbered.filter((error) => error.status !== "fixed");
  const { segments, missing } = highlightSpans(
    text,
    open.map((error) => ({ id: error.id, span: error.span })),
  );
  const numberOf = (id: string) => numbered.find((error) => error.id === id)?.n;

  return (
    <section className={styles.card} aria-labelledby="review-title">
      <h2 id="review-title" className={styles.subheading}>
        Review
      </h2>
      {submission.scores ? (
        <dl className={styles.scores}>
          <div>
            <dt>Overall</dt>
            <dd>{submission.overall}</dd>
          </div>
          <div>
            <dt>Grammar</dt>
            <dd>{submission.scores.grammar}</dd>
          </div>
          <div>
            <dt>Clarity</dt>
            <dd>{submission.scores.clarity}</dd>
          </div>
          <div>
            <dt>Vocabulary</dt>
            <dd>{submission.scores.vocabulary}</dd>
          </div>
          <div>
            <dt>Naturalness</dt>
            <dd>{submission.scores.naturalness}</dd>
          </div>
        </dl>
      ) : null}
      {submission.strengthEs ? (
        <p lang="es">
          <strong>What worked:</strong> {submission.strengthEs}
        </p>
      ) : null}

      {submission.errors.length === 0 ? (
        <p>No errors to fix. Nice work.</p>
      ) : (
        <>
          <p className={styles.text} data-testid="highlighted-text">
            {segments.map((segment, index) =>
              segment.errorId ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
                <mark key={index} className={styles.mark}>
                  {segment.text}
                  <span className={styles.markNumber}>{numberOf(segment.errorId)}</span>
                </mark>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
                <span key={index}>{segment.text}</span>
              ),
            )}
          </p>
          <ol className={styles.errors} aria-label="Errors to fix">
            {numbered.map((error) => (
              <li key={error.id} className={styles.errorItem}>
                <div className={styles.row}>
                  <strong>
                    {error.n}. {errorTypeLabel(error.type)}
                    {error.origin === "recheck" ? " (new)" : ""}
                  </strong>
                  <span
                    className={`${styles.badge} ${error.status === "fixed" ? styles.fixed : styles.pending}`}
                  >
                    {errorStatusLabel(error.status)}
                  </span>
                </div>
                <p lang="es">{error.hintEs}</p>
                {error.feedbackEs ? (
                  <p lang="es" className={styles.muted}>
                    {error.feedbackEs}
                  </p>
                ) : null}
                {error.unit ? (
                  <p>
                    <Link to={`/units/${error.unit.id}`} className={styles.linkButton}>
                      Unit {error.unit.id} · {error.unit.title}
                    </Link>
                  </p>
                ) : null}
                {missing.includes(error.id) ? (
                  <p className={styles.muted}>"{error.span}" is no longer in your text.</p>
                ) : null}
                {error.reveal ? (
                  <div className={styles.reveal}>
                    <p lang="es">{error.reveal.explanationEs}</p>
                    {error.reveal.correctedFragment ? (
                      <p>
                        Correct form: <strong>{error.reveal.correctedFragment}</strong>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
