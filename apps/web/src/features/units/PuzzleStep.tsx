import type { UnitPuzzle } from "@english-course/shared";
import { type FormEvent, useId, useState } from "react";
import { Button, Eyebrow, Field, Panel } from "../../shared/ui/index.ts";
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
      <header className={styles.stepHeader}>
        <Eyebrow muted>Guess first</Eyebrow>
        <h2 id="puzzle-title" className={styles.heading}>
          Puzzle
        </h2>
      </header>
      <Panel tone="lime" padding="lg" className={styles.puzzle}>
        <div className={styles.quotes}>
          <figure className={styles.quoteFigure}>
            <figcaption className="eyebrow">A</figcaption>
            <blockquote className={styles.quote}>{puzzle.sentenceA}</blockquote>
          </figure>
          <figure className={styles.quoteFigure}>
            <figcaption className="eyebrow">B</figcaption>
            <blockquote className={styles.quote}>{puzzle.sentenceB}</blockquote>
          </figure>
        </div>
        <p className={styles.question}>{puzzle.question}</p>
      </Panel>
      <form onSubmit={onSubmit} className={styles.form}>
        <Field label="Your guess" id={guessId}>
          <textarea
            id={guessId}
            rows={3}
            value={guess}
            onChange={(event) => setGuess(event.target.value)}
            readOnly={revealed}
          />
        </Field>
        {!revealed ? (
          <Button type="submit" arrow className={styles.formAction} disabled={!guess.trim()}>
            Reveal the answer
          </Button>
        ) : null}
      </form>
      {revealed ? (
        <Panel tone="plum" padding="lg" className={styles.reveal} aria-live="polite" lang="es">
          <Eyebrow muted>The answer</Eyebrow>
          <h3 className={styles.subheading}>Explicación</h3>
          <p className={styles.revealText}>{puzzle.revealEs}</p>
        </Panel>
      ) : null}
    </article>
  );
}
