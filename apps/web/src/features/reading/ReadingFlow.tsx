import type { ArticleDetail, ReadingStep } from "@english-course/shared";
import { useMutation } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { Link } from "react-router";
import { Button, Eyebrow, Field, Panel, Stat, Stepper } from "../../shared/ui/index.ts";
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
import {
  FLOW_STEPS,
  type FlowStep,
  nextStep,
  reachable,
  STEP_HINTS,
  STEP_LABELS,
} from "./reading.model.ts";

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
      className={styles.step}
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) finish.mutate();
      }}
    >
      <Eyebrow rule muted>
        Your take
      </Eyebrow>
      <Field
        id="opinion"
        className={styles.bigField}
        label={detail.article.annotations?.opinionPrompt ?? "What do you think? One sentence."}
        hint="Your opinions become the seed of this week's post."
      >
        {(control) => (
          <input
            {...control}
            maxLength={500}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>
      <div className={styles.actions}>
        <Button type="submit" arrow fullWidth="mobile" disabled={!text.trim() || finish.isPending}>
          Finish reading
        </Button>
      </div>
      {finish.isError ? <p className={styles.error}>{finish.error.message}</p> : null}
    </form>
  );
}

function Done({ detail }: { detail: ArticleDetail }) {
  const { session } = detail;
  return (
    <Panel
      tone="lime"
      padding="lg"
      className={styles.done}
      role="status"
      aria-label="Reading completed"
    >
      <Eyebrow rule>Finished</Eyebrow>
      <p className={styles.doneTitle}>Reading done!</p>
      <div className={styles.doneStats}>
        <Stat stacked size="lg" label="Questions" value={session.answers.length} />
        <Stat stacked size="lg" label="Words saved" value={session.savedWords.length} />
      </div>
      {session.opinion ? <p className={styles.doneQuote}>“{session.opinion}”</p> : null}
      <p>
        Tomorrow: a 2-minute recall. <Link to="/reading/history">Past readings</Link>
      </p>
    </Panel>
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
  const done = (step: FlowStep) =>
    sessionStep === "done" || FLOW_STEPS.indexOf(step) < FLOW_STEPS.indexOf(sessionStep);

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
      <Stepper
        label="Reading steps"
        className={styles.stepper}
        current={current}
        onSelect={(id) => setViewing(id as FlowStep)}
        steps={FLOW_STEPS.map((step) => ({
          id: step,
          title: STEP_LABELS[step],
          subtitle: STEP_HINTS[step],
          disabled: !allowed.includes(step),
          done: done(step),
        }))}
      />
      {sessionStep === "done" && current === "done" ? <Done detail={detail} /> : null}
      {View ? <View detail={detail} onContinue={onContinue} /> : null}
      {move.isError ? <p className={styles.error}>{move.error.message}</p> : null}
    </div>
  );
}
