import type {
  TimelineCheckResponse,
  TimelinePlacement,
  TimelinePrompt,
} from "@english-course/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Eyebrow } from "../../shared/ui/index.ts";
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

const VERDICT_BADGES = { correct: "Correct", almost: "Almost", incorrect: "Incorrect" } as const;

const pad = (n: number) => String(n).padStart(2, "0");

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

  const verdict = result
    ? result.correct
      ? "correct"
      : result.kindCorrect
        ? "almost"
        : "incorrect"
    : null;

  return (
    <article className={styles.card} aria-labelledby="timeline-title">
      <header className={styles.stepHeader}>
        <Eyebrow muted>
          Place it · {pad(index + 1)} / {pad(items.length)}
        </Eyebrow>
        <h2 id="timeline-title" className={styles.heading}>
          Timeline
        </h2>
        <p className={styles.muted}>
          Sentence {index + 1} of {items.length}. Pick the kind of action, then drag (or use the
          arrow keys on) the handles to place it in time.
        </p>
      </header>
      <p className={timeline.sentence}>{item.sentence}</p>

      <fieldset className={timeline.kinds} disabled={result !== null}>
        <legend className={timeline.legend}>What kind of action is it?</legend>
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

      {result && verdict ? (
        <section
          className={styles.feedback}
          data-verdict={result.correct ? "correct" : "incorrect"}
          data-state={verdict}
          aria-live="polite"
        >
          <Badge tone={verdict} aria-hidden="true">
            {VERDICT_BADGES[verdict]}
          </Badge>
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
          <Button
            disabled={!placement || check.isPending}
            onClick={() => placement && check.mutate(placement)}
          >
            {check.isPending ? "Checking…" : "Check"}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => goTo(index)}>
              Try again
            </Button>
            {index + 1 < items.length ? (
              <Button arrow onClick={() => goTo(index + 1)}>
                Next sentence
              </Button>
            ) : (
              <p className={styles.muted}>That was the last sentence.</p>
            )}
          </>
        )}
      </div>
    </article>
  );
}
