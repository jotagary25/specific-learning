import type { AttemptResponse, UnitDetail, UnitStep } from "@english-course/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  ArrowLeftIcon,
  Button,
  CheckIcon,
  Eyebrow,
  Panel,
  ProgressLine,
  Stepper,
} from "../../shared/ui/index.ts";
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

const pad = (n: number) => String(n).padStart(2, "0");

const STEP_SUBTITLES: Record<UnitStep, string> = {
  story: "The chapter",
  puzzle: "Guess first",
  theory: "The rule",
  timeline: "Place it",
  exercises: "Practice",
};

function CompletionBanner({ unit, celebrate }: { unit: UnitDetail; celebrate: boolean }) {
  const canDo = unit.extras?.canDoEs ?? [];
  return (
    <Panel
      tone="lime"
      padding="md"
      className={styles.banner}
      role="status"
      aria-label="Unit completed"
    >
      <p className={styles.bannerTitle}>
        {celebrate ? "Unit completed!" : "Completed"} ·{" "}
        {Math.round(unit.progress.completion.ratio * 100)}% on first attempts
      </p>
      {canDo.length > 0 ? (
        <ul lang="es" className={styles.canDo}>
          {canDo.map((statement) => (
            <li key={statement}>
              <CheckIcon size={20} className={styles.canDoIcon} />
              <span>{statement}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
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

  const percent = Math.round(unit.progress.completion.ratio * 100);

  return (
    <>
      <header className={styles.unitHeader}>
        <div className={styles.unitHeading}>
          <Eyebrow rule className={styles.crumbs}>
            <span>
              <Link to="/units">Units</Link> · Unit {pad(unit.number)} · {unit.block.title}
            </span>
          </Eyebrow>
          <h1 className={styles.title}>
            <span className="visually-hidden">Unit {unit.number}: </span>
            {unit.title}
          </h1>
          {unit.subtitle ? <p className={styles.lead}>{unit.subtitle}</p> : null}
        </div>
        <span className={`numeral ${styles.unitBigNumeral}`} aria-hidden="true">
          {pad(unit.number)}
        </span>
        <div className={styles.meter}>
          <ProgressLine value={percent} label="Unit score" showValue={false} />
          <span className={styles.score}>{percent}% · 80% completes the unit</span>
        </div>
      </header>

      {unit.progress.status === "completed" ? (
        <CompletionBanner unit={unit} celebrate={celebrate} />
      ) : null}

      <div className={styles.flowNav}>
        <Stepper
          label="Unit steps"
          className={styles.stepper}
          steps={steps.map((id) => ({
            id,
            title: STEP_LABELS[id],
            subtitle: STEP_SUBTITLES[id],
          }))}
          current={step}
          onSelect={(id) => goTo(id as UnitStep)}
        />
        <Button
          variant="ghost"
          size="sm"
          className={styles.skip}
          onClick={() => goTo("exercises")}
          disabled={step === "exercises"}
        >
          Go straight to exercises
        </Button>
      </div>

      <div className={styles.stepBody} key={step}>
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
            <header className={styles.stepHeader}>
              <Eyebrow muted>Step {pad(index + 1)} · Practice</Eyebrow>
              <h2 id="exercises-title" className={styles.heading}>
                Exercises
              </h2>
            </header>
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
        <Button
          variant="secondary"
          disabled={index <= 0}
          onClick={() => {
            const previous = steps[index - 1];
            if (previous) goTo(previous);
          }}
        >
          <ArrowLeftIcon size={18} className={styles.backIcon} />
          Back
        </Button>
        {index < steps.length - 1 ? (
          <Button
            arrow
            onClick={() => {
              const next = steps[index + 1];
              if (next) goTo(next);
            }}
          >
            Next: {STEP_LABELS[steps[index + 1] ?? "exercises"]}
          </Button>
        ) : null}
      </div>

      <Button
        className={styles.fab}
        // Keep the item focused while pressing, so we know where to come back to.
        onMouseDown={(event) => event.preventDefault()}
        onClick={openExplain}
      >
        I don't get it
      </Button>

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
