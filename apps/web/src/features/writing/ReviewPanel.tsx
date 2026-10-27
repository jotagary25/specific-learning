import {
  highlightSpans,
  type SubmissionView,
  type WritingErrorStatus,
} from "@english-course/shared";
import { Link } from "react-router";
import { Badge, Eyebrow, type StateTone } from "../../shared/ui/index.ts";
import styles from "./Writing.module.css";
import { errorStatusLabel, errorTypeLabel } from "./writing.model.ts";

const STATUS_TONE: Record<WritingErrorStatus, StateTone> = {
  open: "almost",
  remaining: "almost",
  changed: "incorrect",
  fixed: "correct",
};

/** The learner's live text with the open errors highlighted, plus one Spanish hint per error. */
export function ReviewPanel({ text, submission }: { text: string; submission: SubmissionView }) {
  const numbered = submission.errors.map((error, index) => ({ ...error, n: index + 1 }));
  const open = numbered.filter((error) => error.status !== "fixed");
  const { segments, missing } = highlightSpans(
    text,
    open.map((error) => ({ id: error.id, span: error.span })),
  );
  const numberOf = (id: string) => numbered.find((error) => error.id === id)?.n;
  const scores = submission.scores;

  return (
    <section className={styles.review} aria-labelledby="review-title">
      <div className={styles.sectionHead}>
        <Eyebrow rule muted>
          Editor's notes · round {submission.round + 1}
        </Eyebrow>
        <h2 id="review-title" className={styles.sectionTitle}>
          Review
        </h2>
      </div>
      {scores ? (
        <dl className={styles.scores}>
          <div className={styles.overall}>
            <dt>Overall</dt>
            <dd className="numeral">{submission.overall}</dd>
          </div>
          <div>
            <dt>Grammar</dt>
            <dd className="numeral">{scores.grammar}</dd>
          </div>
          <div>
            <dt>Clarity</dt>
            <dd className="numeral">{scores.clarity}</dd>
          </div>
          <div>
            <dt>Vocabulary</dt>
            <dd className="numeral">{scores.vocabulary}</dd>
          </div>
          <div>
            <dt>Naturalness</dt>
            <dd className="numeral">{scores.naturalness}</dd>
          </div>
        </dl>
      ) : null}
      {submission.strengthEs ? (
        <p lang="es" className={styles.strength}>
          <strong>What worked:</strong> {submission.strengthEs}
        </p>
      ) : null}

      {submission.errors.length === 0 ? (
        <p className={styles.lead}>No errors to fix. Nice work.</p>
      ) : (
        <div className={styles.reviewGrid}>
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
              <li key={error.id} className={styles.errorItem} data-status={error.status}>
                <span className={`numeral ${styles.errorNumeral}`} aria-hidden="true">
                  {String(error.n).padStart(2, "0")}
                </span>
                <div className={styles.errorBody}>
                  <div className={styles.errorHead}>
                    <strong>
                      {error.n}. {errorTypeLabel(error.type)}
                      {error.origin === "recheck" ? " (new)" : ""}
                    </strong>
                    <Badge tone={STATUS_TONE[error.status]}>{errorStatusLabel(error.status)}</Badge>
                  </div>
                  <p lang="es">{error.hintEs}</p>
                  {error.feedbackEs ? (
                    <p lang="es" className={styles.muted}>
                      {error.feedbackEs}
                    </p>
                  ) : null}
                  {error.unit ? (
                    <p className={styles.small}>
                      <Link to={`/units/${error.unit.id}`}>
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
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
