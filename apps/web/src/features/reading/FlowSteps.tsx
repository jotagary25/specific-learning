import type { ArticleDetail, ComprehensionGrade } from "@english-course/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Badge, Button, Eyebrow, Field, type StateTone } from "../../shared/ui/index.ts";
import { ArticleBody, Attribution, PlainArticle } from "./ArticleBody.tsx";
import styles from "./Reading.module.css";
import {
  answerQuestion,
  checkSpot,
  readingKeys,
  retryAnnotations,
  revealSpots,
  savePrediction,
  submitRetell,
} from "./reading.api.ts";

export type StepProps = { detail: ArticleDetail; onContinue: () => void };

export function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: readingKeys.all });
}

const SCORE_STATE: Record<ComprehensionGrade["score"], { tone: StateTone; word: string }> = {
  0: { tone: "incorrect", word: "Not quite" },
  1: { tone: "almost", word: "Almost" },
  2: { tone: "correct", word: "Correct" },
};

export function GradeFeedback({ grade, guide }: { grade: ComprehensionGrade; guide?: string }) {
  const state = SCORE_STATE[grade.score];
  return (
    <div className={styles.feedback} data-state={state.tone} role="status">
      <div className={styles.feedbackHead}>
        <Badge tone={state.tone}>{state.word}</Badge>
        <p className={styles.feedbackScore}>Score {grade.score}/2</p>
      </div>
      <p lang="es">{grade.feedbackEs}</p>
      {grade.hintEs ? <p lang="es">💡 {grade.hintEs}</p> : null}
      {grade.missingPointsEs?.length ? (
        <>
          <p className={styles.feedbackLabel}>Missed points</p>
          <ul lang="es">
            {grade.missingPointsEs.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </>
      ) : null}
      {guide ? (
        <p lang="es" className={styles.feedbackGuide}>
          A good answer covers: {guide}
        </p>
      ) : null}
    </div>
  );
}

function Continue({ onContinue, label = "Continue" }: { onContinue: () => void; label?: string }) {
  return (
    <div className={styles.continue}>
      <Button arrow fullWidth="mobile" onClick={onContinue}>
        {label}
      </Button>
    </div>
  );
}

/** Shown in the steps that need annotations when the editor stored the article without them. */
function NotAnnotated({ detail, onContinue }: StepProps) {
  const refresh = useRefresh();
  const retry = useMutation({
    mutationFn: () => retryAnnotations(detail.article.id),
    onSuccess: refresh,
  });
  return (
    <div className={styles.notice}>
      <p className={styles.muted}>The AI annotations for this article are not available yet.</p>
      <div className={styles.actions}>
        <Button variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate()}>
          {retry.isPending ? "Annotating…" : "Retry annotations"}
        </Button>
        <Button arrow onClick={onContinue}>
          Skip this step
        </Button>
      </div>
      {retry.isError ? <p className={styles.error}>{retry.error.message}</p> : null}
    </div>
  );
}

/** Eyebrow + short instruction that opens every step. */
function StepIntro({ eyebrow, children }: { eyebrow: string; children?: ReactNode }) {
  return (
    <div className={styles.stepIntro}>
      <Eyebrow rule muted>
        {eyebrow}
      </Eyebrow>
      {children}
    </div>
  );
}

export function PredictStep({ detail, onContinue }: StepProps) {
  const refresh = useRefresh();
  const [text, setText] = useState(detail.session.prediction ?? "");
  const save = useMutation({
    mutationFn: () => savePrediction(detail.article.id, text),
    onSuccess: async () => {
      await refresh();
      onContinue();
    },
  });
  return (
    <form
      className={styles.step}
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) save.mutate();
      }}
    >
      <StepIntro eyebrow="Before you read · headline only" />
      <p className={styles.headline}>{detail.article.title}</p>
      <Field
        id="prediction"
        className={styles.bigField}
        label={
          detail.article.annotations?.predictPrompt ?? "What do you think this article will say?"
        }
      >
        {(control) => (
          <textarea
            {...control}
            rows={2}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>
      <div className={styles.actions}>
        <Button type="submit" arrow fullWidth="mobile" disabled={!text.trim() || save.isPending}>
          Start reading
        </Button>
      </div>
      {save.isError ? <p className={styles.error}>{save.error.message}</p> : null}
    </form>
  );
}

export function ReadStep({ detail, onContinue }: StepProps) {
  const refresh = useRefresh();
  const retry = useMutation({
    mutationFn: () => retryAnnotations(detail.article.id),
    onSuccess: refresh,
  });
  return (
    <div className={styles.step}>
      <Attribution article={detail.article} />
      {detail.article.annotations ? null : (
        <div className={styles.notice}>
          <p className={styles.muted}>Plain reading: annotations are not available.</p>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              size="sm"
              disabled={retry.isPending}
              onClick={() => retry.mutate()}
            >
              {retry.isPending ? "Annotating…" : "Retry annotations"}
            </Button>
          </div>
          {retry.isError ? <p className={styles.error}>{retry.error.message}</p> : null}
        </div>
      )}
      <ArticleBody
        article={detail.article}
        aside={
          <>
            <p className={styles.asideNote}>Tap a word to see its meaning and save it.</p>
            {detail.session.prediction ? (
              <div className={styles.asideBlock}>
                <Eyebrow muted>Your prediction</Eyebrow>
                <p>{detail.session.prediction}</p>
              </div>
            ) : null}
            {detail.session.savedWords.length > 0 ? (
              <div className={styles.asideBlock}>
                <Eyebrow muted>Saved words</Eyebrow>
                <ul className={styles.savedWords} aria-label="Saved words">
                  {detail.session.savedWords.map((word) => (
                    <li key={word}>{word}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        }
      />
      <Continue onContinue={onContinue} label="I've read it" />
    </div>
  );
}

function QuestionCard({ detail, qid }: { detail: ArticleDetail; qid: number }) {
  const refresh = useRefresh();
  const question = detail.article.annotations?.questions[qid];
  const answered = detail.session.answers.find((a) => a.qid === qid);
  const [text, setText] = useState(answered?.answer ?? "");
  const submit = useMutation({
    mutationFn: () => answerQuestion(detail.article.id, qid, text),
    onSuccess: refresh,
  });
  if (!question) return null;
  return (
    <li className={styles.numberedRow}>
      <form
        className={styles.rowForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) submit.mutate();
        }}
      >
        <Field
          id={`question-${qid}`}
          className={styles.questionField}
          label={
            <>
              <span className={styles.rowNumber}>{qid + 1}.</span> {question.question}
            </>
          }
        >
          {(control) => (
            <textarea
              {...control}
              rows={2}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          )}
        </Field>
        <div className={styles.actions}>
          <Button type="submit" variant="secondary" disabled={!text.trim() || submit.isPending}>
            {submit.isPending ? "Checking…" : answered ? "Answer again" : "Answer"}
          </Button>
        </div>
        {submit.data?.error ? (
          <p className={styles.error}>The AI is unavailable; your answer was saved.</p>
        ) : null}
        {submit.isError ? <p className={styles.error}>{submit.error.message}</p> : null}
        {answered?.grade ? (
          <GradeFeedback grade={answered.grade} guide={question.answerGuideEs} />
        ) : null}
      </form>
    </li>
  );
}

export function QuestionsStep(props: StepProps) {
  const { detail, onContinue } = props;
  const questions = detail.article.annotations?.questions;
  if (!questions) return <NotAnnotated {...props} />;
  return (
    <div className={styles.step}>
      <StepIntro eyebrow="Questions">
        <p className={styles.lead}>Think beyond the text: why, what it implies, what comes next.</p>
      </StepIntro>
      <ol className={styles.numberedList}>
        {questions.map((question, qid) => (
          <QuestionCard key={question.question} detail={detail} qid={qid} />
        ))}
      </ol>
      <Continue onContinue={onContinue} />
    </div>
  );
}

export function SpotsStep(props: StepProps) {
  const { detail, onContinue } = props;
  const refresh = useRefresh();
  const [text, setText] = useState("");
  const [explanation, setExplanation] = useState("");
  const spots = detail.article.annotations?.grammarSpots;
  const check = useMutation({
    mutationFn: (withExplanation: boolean) =>
      checkSpot(detail.article.id, {
        text,
        ...(withExplanation && explanation.trim() ? { explanation: explanation.trim() } : {}),
      }),
    onSuccess: refresh,
  });
  const reveal = useMutation({
    mutationFn: () => revealSpots(detail.article.id),
    onSuccess: refresh,
  });
  if (!spots) return <NotAnnotated {...props} />;

  const found = new Set(
    detail.session.spots.flatMap((s) => (s.spotIndex === null ? [] : [s.spotIndex])),
  );
  const last = check.data?.attempt;
  const unit = detail.unit;
  const revealed = detail.session.spotsRevealed;

  return (
    <div className={styles.step}>
      <StepIntro eyebrow="Grammar hunt">
        <p className={styles.lead}>
          Find {detail.spotTarget} example{detail.spotTarget === 1 ? "" : "s"} of{" "}
          {unit ? unit.grammarFocus : "the current grammar"} in the article.
        </p>
        <p className={styles.muted}>
          Select the words in the text and tap “Use selection”, or type them. Found {found.size}/
          {detail.spotTarget}.
        </p>
      </StepIntro>
      {spots.length === 0 && detail.article.annotations?.grammarNoteEs ? (
        <p lang="es" className={styles.notice}>
          {detail.article.annotations.grammarNoteEs}
        </p>
      ) : null}
      <div className={styles.spread}>
        <PlainArticle
          text={detail.article.text}
          highlights={revealed ? spots.map((s) => s.quote) : []}
        />
        <div className={styles.aside}>
          <form
            className={styles.rowForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim()) check.mutate(false);
            }}
          >
            <Field id="spot" label="Example">
              {(control) => (
                <input
                  {...control}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              )}
            </Field>
            <div className={styles.actions}>
              <Button
                variant="secondary"
                onClick={() => setText(window.getSelection()?.toString().trim() ?? "")}
              >
                Use selection
              </Button>
              <Button type="submit" disabled={!text.trim() || check.isPending}>
                Check
              </Button>
            </div>
          </form>
          {last ? (
            last.spotIndex === null ? (
              <p className={styles.feedback} data-state="incorrect" role="status">
                Not one of the annotated examples. Look for {unit?.title ?? "the unit's form"}{" "}
                again.
              </p>
            ) : (
              <div className={styles.feedback} data-state="correct" role="status">
                <p>
                  Yes! “{spots[last.spotIndex]?.quote}” — {spots[last.spotIndex]?.form}.
                </p>
                <Field id="explain" label="Optional: why did the writer use it here?">
                  {(control) => (
                    <textarea
                      {...control}
                      rows={2}
                      value={explanation}
                      onChange={(event) => setExplanation(event.target.value)}
                    />
                  )}
                </Field>
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!explanation.trim() || check.isPending}
                    onClick={() => check.mutate(true)}
                  >
                    Check my explanation
                  </Button>
                </div>
                {last.feedback ? <GradeFeedback grade={last.feedback} /> : null}
                {check.data?.error ? (
                  <p className={styles.error}>The AI is unavailable right now.</p>
                ) : null}
              </div>
            )
          ) : null}
          {check.isError ? <p className={styles.error}>{check.error.message}</p> : null}
          {revealed ? (
            <ul className={styles.spotList} aria-label="Annotated examples">
              {spots.map((spot, index) => (
                <li key={spot.quote} data-found={found.has(index)}>
                  {found.has(index) ? (
                    <Badge tone="correct" className={styles.spotBadge}>
                      Found
                    </Badge>
                  ) : null}
                  <strong>“{spot.quote}”</strong> — {spot.form}
                  <span lang="es" className={styles.muted}>
                    {" "}
                    {spot.whyEs}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Button
              variant="ghost"
              className={styles.ghostStart}
              disabled={reveal.isPending}
              onClick={() => reveal.mutate()}
            >
              Reveal the examples
            </Button>
          )}
        </div>
      </div>
      <Continue onContinue={onContinue} />
    </div>
  );
}

export function RetellStep({ detail, onContinue }: StepProps) {
  const refresh = useRefresh();
  const [text, setText] = useState(detail.session.retell?.text ?? "");
  const submit = useMutation({
    mutationFn: () => submitRetell(detail.article.id, text),
    onSuccess: refresh,
  });
  const grade = detail.session.retell?.grade;
  return (
    <form
      className={styles.step}
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) submit.mutate();
      }}
    >
      <StepIntro eyebrow="Retell">
        <p className={styles.lead}>The article is hidden. Retell it from memory.</p>
      </StepIntro>
      <Field
        id="retell"
        className={styles.bigField}
        label={`Write 3 sentences about “${detail.article.title}”`}
      >
        {(control) => (
          <textarea
            {...control}
            rows={5}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>
      <div className={styles.actions}>
        <Button type="submit" variant="secondary" disabled={!text.trim() || submit.isPending}>
          {submit.isPending ? "Checking…" : "Check my retell"}
        </Button>
      </div>
      {submit.data?.error ? (
        <p className={styles.error}>The AI is unavailable; your retell was saved.</p>
      ) : null}
      {submit.isError ? <p className={styles.error}>{submit.error.message}</p> : null}
      {grade ? <GradeFeedback grade={grade} /> : null}
      <Continue onContinue={onContinue} />
    </form>
  );
}
