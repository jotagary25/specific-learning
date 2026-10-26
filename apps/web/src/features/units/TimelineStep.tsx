import type {
  TimelineCheckResponse,
  TimelinePlacement,
  TimelinePrompt,
} from "@english-course/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import timeline from "./Timeline.module.css";
import { TimelineAxis } from "./TimelineAxis.tsx";
import { initialPlacement, KIND_LABELS, type TimelineKind } from "./timeline-geometry.ts";
import styles from "./Units.module.css";
import { checkTimeline } from "./units.api.ts";

type Props = {
  unitNumber: number;
  items: TimelinePrompt[];
  /** Reports the item on screen, for the "I don't get it" context. */
  onCurrentItem?: (id: string) => void;
};

const KINDS = Object.keys(KIND_LABELS) as TimelineKind[];

export function TimelineStep({ unitNumber, items, onCurrentItem }: Props) {
  const [index, setIndex] = useState(0);
  const [placement, setPlacement] = useState<TimelinePlacement | null>(null);
  const [result, setResult] = useState<TimelineCheckResponse | null>(null);
  const item = items[index];

  const check = useMutation({
    mutationFn: (value: TimelinePlacement) => checkTimeline(unitNumber, item?.id ?? "", value),
    onSuccess: setResult,
  });

  if (!item) return null;

  const goTo = (next: number) => {
    setIndex(next);
    setPlacement(null);
    setResult(null);
    check.reset();
    const nextItem = items[next];
    if (nextItem) onCurrentItem?.(nextItem.id);
  };

  return (
    <article className={styles.card} aria-labelledby="timeline-title">
      <h2 id="timeline-title" className={styles.heading}>
        Timeline
      </h2>
      <p className={styles.muted}>
        Sentence {index + 1} of {items.length}. Pick the kind of action, then drag (or use the arrow
        keys on) the handles to place it in time.
      </p>
      <p className={timeline.sentence}>{item.sentence}</p>

      <fieldset className={timeline.kinds} disabled={result !== null}>
        <legend className={styles.label}>What kind of action is it?</legend>
        {KINDS.map((kind) => (
          <label key={kind} className={timeline.kind}>
            <input
              type="radio"
              name={`kind-${item.id}`}
              value={kind}
              checked={placement?.kind === kind}
              onChange={() => setPlacement(initialPlacement(kind))}
            />
            {KIND_LABELS[kind]}
          </label>
        ))}
      </fieldset>

      {placement ? (
        <TimelineAxis
          placement={placement}
          onChange={setPlacement}
          expected={result?.expected}
          disabled={result !== null}
        />
      ) : null}

      {result ? (
        <section
          className={styles.feedback}
          data-verdict={result.correct ? "correct" : "incorrect"}
          aria-live="polite"
        >
          <p className={styles.verdict}>
            {result.correct
              ? "Correct!"
              : result.kindCorrect
                ? "Right kind, wrong place: compare with the dashed shape."
                : `Not quite: this is "${KIND_LABELS[result.expected.kind]}".`}
          </p>
          <p lang="es">{result.explanationEs}</p>
        </section>
      ) : null}
      {check.isError ? <p className={styles.error}>{check.error.message}</p> : null}

      <div className={styles.actions}>
        {result === null ? (
          <button
            type="button"
            className={styles.primary}
            disabled={!placement || check.isPending}
            onClick={() => placement && check.mutate(placement)}
          >
            {check.isPending ? "Checking…" : "Check"}
          </button>
        ) : (
          <>
            <button type="button" className={styles.secondary} onClick={() => goTo(index)}>
              Try again
            </button>
            {index + 1 < items.length ? (
              <button type="button" className={styles.primary} onClick={() => goTo(index + 1)}>
                Next sentence
              </button>
            ) : (
              <p className={styles.muted}>That was the last sentence.</p>
            )}
          </>
        )}
      </div>
    </article>
  );
}
