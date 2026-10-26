import type { ArticleDetail, ReadingStep } from "@english-course/shared";
import { useMutation } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { Link } from "react-router";
import {
  PredictStep,
  QuestionsStep,
  ReadStep,
  RetellStep,
  SpotsStep,
  type StepProps,
  useRefresh,
} from "./FlowSteps.tsx";
import styles from "./Reading.module.css";
import { completeReading, goToStep, saveOpinion } from "./reading.api.ts";
import { FLOW_STEPS, type FlowStep, nextStep, reachable, STEP_LABELS } from "./reading.model.ts";

function OpinionStep({ detail }: StepProps) {
  const refresh = useRefresh();
  const [text, setText] = useState(detail.session.opinion ?? "");
  const finish = useMutation({
    mutationFn: async () => {
      await saveOpinion(detail.article.id, text.trim());
      return completeReading(detail.article.id);
    },
    onSuccess: refresh,
  });
  return (
    <form
      className={styles.card}
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) finish.mutate();
      }}
    >
      <label htmlFor="opinion" className={styles.label}>
        {detail.article.annotations?.opinionPrompt ?? "What do you think? One sentence."}
      </label>
      <input
        id="opinion"
        className={styles.input}
        maxLength={500}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <p className={styles.muted}>Your opinions become the seed of this week's post.</p>
      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.primary}
          disabled={!text.trim() || finish.isPending}
        >
          Finish reading
        </button>
      </div>
      {finish.isError ? <p className={styles.error}>{finish.error.message}</p> : null}
    </form>
  );
}

function Done({ detail }: { detail: ArticleDetail }) {
  const { session } = detail;
  return (
    <section className={styles.banner} role="status" aria-label="Reading completed">
      <p className={styles.bannerTitle}>Reading done!</p>
      <p>
        {session.answers.length} questions answered · {session.savedWords.length} words saved
        {session.opinion ? ` · opinion: “${session.opinion}”` : ""}
      </p>
      <p>
        Tomorrow: a 2-minute recall. <Link to="/reading/history">Past readings</Link>
      </p>
    </section>
  );
}

const STEP_VIEWS: Record<FlowStep, (props: StepProps) => JSX.Element> = {
  predict: PredictStep,
  read: ReadStep,
  questions: QuestionsStep,
  spots: SpotsStep,
  retell: RetellStep,
  opinion: OpinionStep,
};

/** The 6-step active reading flow; the session's step is persisted so it resumes. */
export function ReadingFlow({ detail }: { detail: ArticleDetail }) {
  const refresh = useRefresh();
  const sessionStep = detail.session.step;
  const [viewing, setViewing] = useState<FlowStep | null>(null);
  const move = useMutation({
    mutationFn: (step: ReadingStep) => goToStep(detail.article.id, step),
    onSuccess: async () => {
      setViewing(null);
      await refresh();
    },
  });

  const allowed = reachable(sessionStep);
  const current: FlowStep | "done" = viewing && allowed.includes(viewing) ? viewing : sessionStep;
  const View = current === "done" ? null : STEP_VIEWS[current];

  const onContinue = () => {
    if (current === "done") return;
    const next = nextStep(current);
    if (next === "done") return;
    // Moving forward from an earlier step only changes the view, not the saved progress.
    if (FLOW_STEPS.indexOf(next as FlowStep) <= FLOW_STEPS.indexOf(sessionStep as FlowStep)) {
      setViewing(next as FlowStep);
    } else {
      move.mutate(next);
    }
  };

  return (
    <div className={styles.flow}>
      <nav aria-label="Reading steps">
        <ol className={styles.stepper}>
          {FLOW_STEPS.map((step, index) => (
            <li key={step}>
              <button
                type="button"
                className={styles.stepButton}
                aria-current={step === current ? "step" : undefined}
                disabled={!allowed.includes(step)}
                onClick={() => setViewing(step)}
              >
                <span className={styles.stepIndex}>{index + 1}</span>
                <span className={styles.stepLabel}>{STEP_LABELS[step]}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {sessionStep === "done" && current === "done" ? <Done detail={detail} /> : null}
      {View ? <View detail={detail} onContinue={onContinue} /> : null}
      {move.isError ? <p className={styles.error}>{move.error.message}</p> : null}
    </div>
  );
}
