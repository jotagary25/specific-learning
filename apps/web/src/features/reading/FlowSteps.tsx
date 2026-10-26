import type { ArticleDetail, ComprehensionGrade } from "@english-course/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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

export function GradeFeedback({ grade, guide }: { grade: ComprehensionGrade; guide?: string }) {
  return (
    <div className={styles.feedback} data-score={grade.score} role="status">
      <p className={styles.label}>Score {grade.score}/2</p>
      <p lang="es">{grade.feedbackEs}</p>
      {grade.hintEs ? <p lang="es">💡 {grade.hintEs}</p> : null}
      {grade.missingPointsEs?.length ? (
        <>
          <p className={styles.label}>Missed points</p>
          <ul lang="es">
            {grade.missingPointsEs.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </>
      ) : null}
      {guide ? (
        <p lang="es" className={styles.muted}>
          A good answer covers: {guide}
        </p>
      ) : null}
    </div>
  );
}

function Continue({ onContinue, label = "Continue" }: { onContinue: () => void; label?: string }) {
  return (
    <div className={styles.actions}>
      <button type="button" className={styles.primary} onClick={onContinue}>
        {label}
      </button>
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
    <div className={styles.card}>
      <p className={styles.muted}>The AI annotations for this article are not available yet.</p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          disabled={retry.isPending}
          onClick={() => retry.mutate()}
        >
          {retry.isPending ? "Annotating…" : "Retry annotations"}
        </button>
        <button type="button" className={styles.primary} onClick={onContinue}>
          Skip this step
        </button>
      </div>
      {retry.isError ? <p className={styles.error}>{retry.error.message}</p> : null}
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
      className={styles.card}
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) save.mutate();
      }}
    >
      <p className={styles.headline}>{detail.article.title}</p>
      <label htmlFor="prediction" className={styles.label}>
        {detail.article.annotations?.predictPrompt ?? "What do you think this article will say?"}
      </label>
      <textarea
        id="prediction"
        className={styles.textarea}
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={!text.trim() || save.isPending}>
          Start reading
        </button>
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
    <div className={styles.card}>
      {detail.session.prediction ? (
        <p className={styles.muted}>Your prediction: {detail.session.prediction}</p>
      ) : null}
      <Attribution article={detail.article} />
      {detail.article.annotations ? null : (
        <div className={styles.notice}>
          <p className={styles.muted}>Plain reading: annotations are not available.</p>
          <button
            type="button"
            className={styles.secondary}
            disabled={retry.isPending}
            onClick={() => retry.mutate()}
          >
            {retry.isPending ? "Annotating…" : "Retry annotations"}
          </button>
          {retry.isError ? <p className={styles.error}>{retry.error.message}</p> : null}
        </div>
      )}
      <p className={styles.muted}>Tap a word to see its meaning and save it.</p>
      <ArticleBody article={detail.article} />
      {detail.session.savedWords.length > 0 ? (
        <p className={styles.muted}>Saved: {detail.session.savedWords.join(", ")}</p>
      ) : null}
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
  const id = `question-${qid}`;
  return (
    <form
      className={styles.card}
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) submit.mutate();
      }}
    >
      <label htmlFor={id} className={styles.label}>
        {qid + 1}. {question.question}
      </label>
      <textarea
        id={id}
        className={styles.textarea}
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.secondary}
          disabled={!text.trim() || submit.isPending}
        >
          {submit.isPending ? "Checking…" : answered ? "Answer again" : "Answer"}
        </button>
      </div>
      {submit.data?.error ? (
        <p className={styles.error}>The AI is unavailable; your answer was saved.</p>
      ) : null}
      {submit.isError ? <p className={styles.error}>{submit.error.message}</p> : null}
      {answered?.grade ? (
        <GradeFeedback grade={answered.grade} guide={question.answerGuideEs} />
      ) : null}
    </form>
  );
}

export function QuestionsStep(props: StepProps) {
  const { detail, onContinue } = props;
  const questions = detail.article.annotations?.questions;
  if (!questions) return <NotAnnotated {...props} />;
  return (
    <div className={styles.card}>
      <p className={styles.muted}>Think beyond the text: why, what it implies, what comes next.</p>
      {questions.map((question, qid) => (
        <QuestionCard key={question.question} detail={detail} qid={qid} />
      ))}
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
    <div className={styles.card}>
      <p className={styles.label}>
        Find {detail.spotTarget} example{detail.spotTarget === 1 ? "" : "s"} of{" "}
        {unit ? unit.grammarFocus : "the current grammar"} in the article.
      </p>
      <p className={styles.muted}>
        Select the words in the text and tap “Use selection”, or type them. Found {found.size}/
        {detail.spotTarget}.
      </p>
      {spots.length === 0 && detail.article.annotations?.grammarNoteEs ? (
        <p lang="es" className={styles.notice}>
          {detail.article.annotations.grammarNoteEs}
        </p>
      ) : null}
      <PlainArticle
        text={detail.article.text}
        highlights={revealed ? spots.map((s) => s.quote) : []}
      />
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) check.mutate(false);
        }}
      >
        <label htmlFor="spot" className={styles.label}>
          Example
        </label>
        <input
          id="spot"
          className={styles.input}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setText(window.getSelection()?.toString().trim() ?? "")}
          >
            Use selection
          </button>
          <button
            type="submit"
            className={styles.primary}
            disabled={!text.trim() || check.isPending}
          >
            Check
          </button>
        </div>
      </form>
      {last ? (
        last.spotIndex === null ? (
          <p className={styles.feedback} role="status">
            Not one of the annotated examples. Look for {unit?.title ?? "the unit's form"} again.
          </p>
        ) : (
          <div className={styles.feedback} data-score={2} role="status">
            <p>
              Yes! “{spots[last.spotIndex]?.quote}” — {spots[last.spotIndex]?.form}.
            </p>
            <label htmlFor="explain" className={styles.label}>
              Optional: why did the writer use it here?
            </label>
            <textarea
              id="explain"
              className={styles.textarea}
              rows={2}
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
            />
            <button
              type="button"
              className={styles.secondary}
              disabled={!explanation.trim() || check.isPending}
              onClick={() => check.mutate(true)}
            >
              Check my explanation
            </button>
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
              <strong>“{spot.quote}”</strong> — {spot.form}
              <span lang="es" className={styles.muted}>
                {" "}
                {spot.whyEs}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <button
          type="button"
          className={styles.linkButton}
          disabled={reveal.isPending}
          onClick={() => reveal.mutate()}
        >
          Reveal the examples
        </button>
      )}
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
      className={styles.card}
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) submit.mutate();
      }}
    >
      <p className={styles.muted}>The article is hidden. Retell it from memory.</p>
      <label htmlFor="retell" className={styles.label}>
        Write 3 sentences about “{detail.article.title}”
      </label>
      <textarea
        id="retell"
        className={styles.textarea}
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.secondary}
          disabled={!text.trim() || submit.isPending}
        >
          {submit.isPending ? "Checking…" : "Check my retell"}
        </button>
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
