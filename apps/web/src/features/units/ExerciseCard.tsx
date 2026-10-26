import type { AttemptResponse, ItemProgress, PublicExercise } from "@english-course/shared";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { blankCount, ExerciseItem } from "./ExerciseItem.tsx";
import styles from "./Exercises.module.css";
import { fetchAnswers, unitsKeys } from "./units.api.ts";

type Props = {
  unitNumber: number;
  exercise: PublicExercise;
  progress: ItemProgress[];
  onAttempt: (response: AttemptResponse, inputs: string[]) => void;
  /** Reports the item the learner is working on (for "I don't get it"). */
  onFocusItem: (itemId: string) => void;
};

type Focus = { itemId: string; index: number };

export function ExerciseCard({ unitNumber, exercise, progress, onAttempt, onFocusItem }: Props) {
  const graded = exercise.items.filter((item) => !item.isExample);
  const [inputs, setInputs] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      graded.map((item) => [
        item.id,
        progress.find((p) => p.itemId === item.id)?.latest.inputs ??
          Array.from({ length: Math.max(blankCount(item), 1) }, () => ""),
      ]),
    ),
  );
  const [focus, setFocus] = useState<Focus | null>(null);
  const [review, setReview] = useState(false);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  const attempted = new Set(progress.map((p) => p.itemId));
  const allAttempted = graded.every((item) => attempted.has(item.id));

  const answers = useQuery({
    queryKey: unitsKeys.answers(unitNumber, exercise.id),
    queryFn: () => fetchAnswers(unitNumber, exercise.id),
    enabled: review && allAttempted,
  });

  const insertWord = (word: string) => {
    const target = focus ?? firstEmptyBlank();
    if (!target) return;
    const current = inputs[target.itemId] ?? [];
    const next = [...current];
    const value = next[target.index]?.trim() ?? "";
    next[target.index] = value ? `${value} ${word}` : word;
    setInputs({ ...inputs, [target.itemId]: next });
    inputRefs.current.get(`${target.itemId}:${target.index}`)?.focus();
  };

  function firstEmptyBlank(): Focus | null {
    for (const item of graded) {
      const index = (inputs[item.id] ?? []).findIndex((value) => !value.trim());
      if (index >= 0) return { itemId: item.id, index };
    }
    return null;
  }

  return (
    <section className={styles.exercise} aria-labelledby={`exercise-${exercise.id}`}>
      <h3 id={`exercise-${exercise.id}`} className={styles.exerciseTitle}>
        <span className={styles.exerciseId}>{exercise.id}</span> {exercise.instruction}
      </h3>
      {exercise.passage ? <p className={styles.passage}>{exercise.passage}</p> : null}
      {exercise.wordBank ? (
        <fieldset className={styles.wordBank}>
          <legend className={styles.legend}>Word bank (tap to insert)</legend>
          {exercise.wordBank.map((entry) => (
            <button
              key={entry.text}
              type="button"
              className={styles.chip}
              data-used={entry.used || undefined}
              // Keep the focused blank: a chip tap must not steal focus before inserting.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertWord(entry.text)}
            >
              {entry.text}
            </button>
          ))}
        </fieldset>
      ) : null}

      <ol className={styles.items}>
        {exercise.items.map((item) => (
          <ExerciseItem
            key={item.id}
            unitNumber={unitNumber}
            item={item}
            inputs={inputs[item.id] ?? []}
            onInputsChange={(next) => setInputs((all) => ({ ...all, [item.id]: next }))}
            onFocusBlank={(index) => {
              setFocus({ itemId: item.id, index });
              onFocusItem(item.id);
            }}
            registerInput={(index, element) => {
              const key = `${item.id}:${index}`;
              if (element) inputRefs.current.set(key, element);
              else inputRefs.current.delete(key);
            }}
            progress={progress.find((p) => p.itemId === item.id)}
            answer={answers.data?.items.find((a) => a.itemId === item.id)}
            onAttempt={onAttempt}
          />
        ))}
      </ol>

      {exercise.answerNote ? <p className={styles.muted}>{exercise.answerNote}</p> : null}
      <div className={styles.reviewRow}>
        <button
          type="button"
          className={styles.hintButton}
          disabled={!allAttempted || review}
          onClick={() => setReview(true)}
        >
          Show answers
        </button>
        {!allAttempted ? (
          <span className={styles.muted}>Answer every item once to unlock the answers.</span>
        ) : null}
        {answers.isError ? <span className={styles.error}>{answers.error.message}</span> : null}
      </div>
    </section>
  );
}
