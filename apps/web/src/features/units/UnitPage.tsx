import type { AttemptResponse, UnitDetail, UnitStep } from "@english-course/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useTutor } from "../tutor/TutorProvider.tsx";
import { ExerciseCard } from "./ExerciseCard.tsx";
import { ExplainSheet } from "./ExplainSheet.tsx";
import { PuzzleStep } from "./PuzzleStep.tsx";
import { StoryStep } from "./StoryStep.tsx";
import { TheoryStep } from "./TheoryStep.tsx";
import { TimelineStep } from "./TimelineStep.tsx";
import styles from "./Units.module.css";
import { fetchUnit, unitsKeys } from "./units.api.ts";
import { applyAttempt, STEP_LABELS, stepsFor } from "./units.model.ts";

function CompletionBanner({ unit, celebrate }: { unit: UnitDetail; celebrate: boolean }) {
  const canDo = unit.extras?.canDoEs ?? [];
  return (
    <section className={styles.banner} role="status" aria-label="Unit completed">
      <p className={styles.bannerTitle}>
        {celebrate ? "Unit completed!" : "Completed"} ·{" "}
        {Math.round(unit.progress.completion.ratio * 100)}% on first attempts
      </p>
      {canDo.length > 0 ? (
        <ul lang="es" className={styles.canDo}>
          {canDo.map((statement) => (
            <li key={statement}>{statement}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Stepper({
  steps,
  current,
  onSelect,
}: {
  steps: UnitStep[];
  current: UnitStep;
  onSelect: (step: UnitStep) => void;
}) {
  return (
    <nav aria-label="Unit steps">
      <ol className={styles.stepper}>
        {steps.map((step, index) => (
          <li key={step}>
            <button
              type="button"
              className={styles.stepButton}
              aria-current={step === current ? "step" : undefined}
              onClick={() => onSelect(step)}
            >
              <span className={styles.stepIndex}>{index + 1}</span>
              <span className={styles.stepLabel}>{STEP_LABELS[step]}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function UnitFlow({ unit }: { unit: UnitDetail }) {
  const queryClient = useQueryClient();
  const steps = stepsFor(unit);
  const [params, setParams] = useSearchParams();
  const requested = params.get("step") as UnitStep | null;
  const step = requested && steps.includes(requested) ? requested : (steps[0] ?? "exercises");
  const index = steps.indexOf(step);

  const [explainOpen, setExplainOpen] = useState(false);
  const { openTutor } = useTutor();
  const [celebrate, setCelebrate] = useState(false);
  const focusedItem = useRef<{ step: UnitStep; itemId?: string; timelineItemId?: string }>({
    step,
  });
  const returnFocus = useRef<HTMLElement | null>(null);

  const goTo = (next: UnitStep) => {
    focusedItem.current = { step: next };
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        copy.set("step", next);
        return copy;
      },
      { replace: false },
    );
    window.scrollTo?.({ top: 0 });
  };

  const onAttempt = (response: AttemptResponse, inputs: string[]) => {
    queryClient.setQueryData<UnitDetail>(unitsKeys.detail(unit.number), (old) =>
      old ? applyAttempt(old, response, inputs) : old,
    );
    void queryClient.invalidateQueries({ queryKey: unitsKeys.list });
    if (response.unitCompleted) setCelebrate(true);
  };

  const openExplain = () => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setExplainOpen(true);
  };

  const closeExplain = useCallback(() => {
    setExplainOpen(false);
    // Back to the exact spot: the step never changed; refocus the element the learner left.
    const target = returnFocus.current;
    setTimeout(() => {
      if (target?.isConnected) {
        target.focus();
        target.scrollIntoView?.({ block: "center" });
      }
    });
  }, []);

  const context = {
    step,
    itemId: step === focusedItem.current.step ? focusedItem.current.itemId : undefined,
    timelineItemId:
      step === "timeline"
        ? (focusedItem.current.timelineItemId ?? unit.timeline[0]?.id)
        : undefined,
  };

  return (
    <>
      <header className={styles.unitHeader}>
        <p className={styles.eyebrow}>
          <Link to="/units">Units</Link> · {unit.block.title}
        </p>
        <h1 className={styles.title}>
          Unit {unit.number}: {unit.title}
        </h1>
        {unit.subtitle ? <p className={styles.muted}>{unit.subtitle}</p> : null}
        <div className={styles.meter}>
          <progress
            className={styles.progress}
            max={100}
            value={Math.round(unit.progress.completion.ratio * 100)}
            aria-label="Unit score"
          />
          <span className={styles.muted}>
            {Math.round(unit.progress.completion.ratio * 100)}% · 80% completes the unit
          </span>
        </div>
      </header>

      {unit.progress.status === "completed" ? (
        <CompletionBanner unit={unit} celebrate={celebrate} />
      ) : null}

      <Stepper steps={steps} current={step} onSelect={goTo} />

      <button
        type="button"
        className={styles.skip}
        onClick={() => goTo("exercises")}
        disabled={step === "exercises"}
      >
        Go straight to exercises
      </button>

      <div className={styles.stepBody}>
        {step === "story" && unit.story ? (
          <StoryStep chapter={unit.story.chapter} storyTitle={unit.story.title} />
        ) : null}
        {step === "puzzle" && unit.extras ? <PuzzleStep puzzle={unit.extras.puzzle} /> : null}
        {step === "theory" ? <TheoryStep sections={unit.theory} extras={unit.extras} /> : null}
        {step === "timeline" ? (
          <TimelineStep
            unitNumber={unit.number}
            items={unit.timeline}
            onCurrentItem={(id) => {
              focusedItem.current = { step: "timeline", timelineItemId: id };
            }}
          />
        ) : null}
        {step === "exercises" ? (
          <article className={styles.card} aria-labelledby="exercises-title">
            <h2 id="exercises-title" className={styles.heading}>
              Exercises
            </h2>
            {unit.exercises.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                unitNumber={unit.number}
                exercise={exercise}
                progress={unit.progress.items}
                onAttempt={onAttempt}
                onFocusItem={(itemId) => {
                  focusedItem.current = { step: "exercises", itemId };
                }}
              />
            ))}
          </article>
        ) : null}
      </div>

      <div className={styles.pager}>
        <button
          type="button"
          className={styles.secondary}
          disabled={index <= 0}
          onClick={() => {
            const previous = steps[index - 1];
            if (previous) goTo(previous);
          }}
        >
          Back
        </button>
        {index < steps.length - 1 ? (
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              const next = steps[index + 1];
              if (next) goTo(next);
            }}
          >
            Next: {STEP_LABELS[steps[index + 1] ?? "exercises"]}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        className={styles.fab}
        // Keep the item focused while pressing, so we know where to come back to.
        onMouseDown={(event) => event.preventDefault()}
        onClick={openExplain}
      >
        I don't get it
      </button>

      {explainOpen ? (
        <ExplainSheet
          unitNumber={unit.number}
          context={context}
          onBack={closeExplain}
          onFollowUp={(shown) => {
            // Same context as the sheet; "Back to my task" returns to the same spot.
            setExplainOpen(false);
            openTutor({
              context: context.itemId
                ? { kind: "exercise", ref: context.itemId, snippet: shown }
                : { kind: "unit", ref: `${unit.number}#${step}`, snippet: shown },
              returnFocus: returnFocus.current,
            });
          }}
        />
      ) : null}
    </>
  );
}

export function UnitPage() {
  const { n } = useParams();
  const number = Number(n);
  const unit = useQuery({
    queryKey: unitsKeys.detail(number),
    queryFn: () => fetchUnit(number),
    enabled: Number.isInteger(number) && number > 0,
  });

  return (
    <section className={styles.page}>
      {unit.isPending ? <p className={styles.muted}>Loading unit…</p> : null}
      {unit.isError ? <p className={styles.error}>{unit.error.message}</p> : null}
      {unit.data ? <UnitFlow key={unit.data.number} unit={unit.data} /> : null}
    </section>
  );
}
