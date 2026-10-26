import type { UnitPuzzle } from "@english-course/shared";
import { type FormEvent, useId, useState } from "react";
import styles from "./Units.module.css";

/** Curiosity gap: the learner commits to a guess before the explanation is revealed. */
export function PuzzleStep({ puzzle }: { puzzle: UnitPuzzle }) {
  const [guess, setGuess] = useState("");
  const [revealed, setRevealed] = useState(false);
  const guessId = useId();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (guess.trim()) setRevealed(true);
  };

  return (
    <article className={styles.card} aria-labelledby="puzzle-title">
      <h2 id="puzzle-title" className={styles.heading}>
        Puzzle
      </h2>
      <blockquote className={styles.quote}>{puzzle.sentenceA}</blockquote>
      <blockquote className={styles.quote}>{puzzle.sentenceB}</blockquote>
      <p className={styles.question}>{puzzle.question}</p>
      <form onSubmit={onSubmit} className={styles.form}>
        <label htmlFor={guessId} className={styles.label}>
          Your guess
        </label>
        <textarea
          id={guessId}
          className={styles.textarea}
          rows={3}
          value={guess}
          onChange={(event) => setGuess(event.target.value)}
          readOnly={revealed}
        />
        {!revealed ? (
          <button type="submit" className={styles.primary} disabled={!guess.trim()}>
            Reveal the answer
          </button>
        ) : null}
      </form>
      {revealed ? (
        <section className={styles.reveal} aria-live="polite" lang="es">
          <h3 className={styles.subheading}>Explicación</h3>
          <p>{puzzle.revealEs}</p>
        </section>
      ) : null}
    </article>
  );
}
