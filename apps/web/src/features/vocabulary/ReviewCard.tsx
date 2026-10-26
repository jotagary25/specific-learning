import { type QueueCard, RATING_LABELS, type SrsRating } from "@english-course/shared";
import { useEffect, useRef, useState } from "react";
import styles from "./Vocabulary.module.css";
import {
  feedbackFor,
  ratingFromKey,
  type TypedFeedback,
  VERDICT_TEXT,
} from "./vocabulary.model.ts";

const RATINGS: SrsRating[] = [1, 2, 3, 4];

function Prompt({ card }: { card: QueueCard }) {
  const { prompt, highlight } = card;
  const at = highlight ? prompt.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
  if (!highlight || at < 0) return <p className={styles.prompt}>{prompt}</p>;
  return (
    <p className={styles.prompt}>
      {prompt.slice(0, at)}
      <mark className={styles.mark}>{prompt.slice(at, at + highlight.length)}</mark>
      {prompt.slice(at + highlight.length)}
    </p>
  );
}

function Feedback({ feedback }: { feedback: TypedFeedback }) {
  return (
    <div className={styles.feedback} role="status">
      <p className={styles[feedback.verdict]}>{VERDICT_TEXT[feedback.verdict]}</p>
      {feedback.diff ? (
        <p className={styles.diff}>
          <span className={styles.srOnly}>Differences: </span>
          {feedback.diff.map((token, i) => {
            const Tag = token.kind === "removed" ? "del" : token.kind === "added" ? "ins" : "span";
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: tokens are static per answer
              <Tag key={i} className={styles[token.kind]}>
                {token.text}{" "}
              </Tag>
            );
          })}
        </p>
      ) : null}
      {feedback.verdict !== "correct" ? (
        <p className={styles.expected}>
          Answer: <strong>{feedback.expected}</strong>
        </p>
      ) : null}
    </div>
  );
}

type Props = {
  card: QueueCard;
  position: number;
  total: number;
  pending: boolean;
  onRate: (rating: SrsRating, answer?: string) => void;
};

/** One card: ask → answer (typed or reveal) → rate. Keys: Enter/Space reveal, 1–4 rate. */
export function ReviewCard({ card, position, total, pending, onRate }: Props) {
  const typed = card.direction !== "recognition";
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState<TypedFeedback | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const answered = typed ? feedback !== null : revealed;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const rate = (rating: SrsRating) => {
    if (!pending) onRate(rating, typed ? input : undefined);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!answered) {
        if (!typed && (event.key === " " || event.key === "Enter")) {
          event.preventDefault();
          setRevealed(true);
        }
        return;
      }
      const rating = ratingFromKey(event.key);
      if (rating) {
        event.preventDefault();
        if (!pending) onRate(rating, typed ? input : undefined);
      } else if (event.key === "Enter" && feedback) {
        event.preventDefault();
        if (!pending) onRate(feedback.suggested, input);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answered, typed, feedback, input, pending, onRate]);

  return (
    <article className={styles.card} aria-label={`Card ${position} of ${total}`}>
      <div className={styles.row}>
        <span className={styles.progress}>
          {position}/{total}
        </span>
        {card.context ? <span className={styles.muted}>{card.context}</span> : null}
      </div>
      <p className={styles.task}>{card.task}</p>
      <Prompt card={card} />
      {card.hintEs ? (
        <p className={styles.hint} lang="es">
          {card.hintEs}
        </p>
      ) : null}

      {typed ? (
        <form
          className={styles.answerForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (!feedback && input.trim()) setFeedback(feedbackFor(card, input));
          }}
        >
          <label htmlFor={`answer-${card.id}`} className={styles.srOnly}>
            Your answer
          </label>
          <input
            id={`answer-${card.id}`}
            ref={inputRef}
            className={styles.input}
            value={input}
            readOnly={feedback !== null}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(event) => setInput(event.target.value)}
          />
          {feedback ? null : (
            <button type="submit" className={styles.primary} disabled={!input.trim()}>
              Check
            </button>
          )}
        </form>
      ) : revealed ? null : (
        <button type="button" className={styles.primary} onClick={() => setRevealed(true)}>
          Show answer
        </button>
      )}

      {feedback ? <Feedback feedback={feedback} /> : null}

      {answered ? (
        <>
          <p className={styles.back}>{card.back}</p>
          <fieldset className={styles.ratings} disabled={pending}>
            <legend className={styles.srOnly}>How well did you know it?</legend>
            {RATINGS.map((rating) => (
              <button
                key={rating}
                type="button"
                className={`${styles.rating} ${styles[`r${rating}`]} ${
                  feedback?.suggested === rating ? styles.suggested : ""
                }`}
                aria-keyshortcuts={String(rating)}
                onClick={() => rate(rating)}
              >
                <span>{RATING_LABELS[rating]}</span>
                <kbd className={styles.kbd}>{rating}</kbd>
              </button>
            ))}
          </fieldset>
          {feedback ? (
            <p className={styles.muted}>
              Enter accepts <strong>{RATING_LABELS[feedback.suggested]}</strong>; 1–4 to change it.
            </p>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
