import type { RecallQuestionView } from "@english-course/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Eyebrow, Field, Panel, StatusDot } from "../../shared/ui/index.ts";
import { GradeFeedback } from "./FlowSteps.tsx";
import styles from "./Reading.module.css";
import { answerRecall, fetchRecall, readingKeys } from "./reading.api.ts";

function RecallQuestion({ question, n }: { question: RecallQuestionView; n: number }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(question.answer ?? "");
  const submit = useMutation({
    mutationFn: () => answerRecall(question.qid, text),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: readingKeys.recall }),
  });
  return (
    <li className={`${styles.numberedRow} ${styles.withNumeral}`}>
      <span className={`numeral ${styles.rowNumeral}`} aria-hidden="true">
        {String(n).padStart(2, "0")}
      </span>
      <form
        className={styles.rowForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) submit.mutate();
        }}
      >
        <Field
          id={`recall-${question.qid}`}
          className={styles.questionField}
          label={question.question}
        >
          {(control) => (
            <input {...control} value={text} onChange={(event) => setText(event.target.value)} />
          )}
        </Field>
        <div className={styles.actions}>
          <Button type="submit" variant="secondary" disabled={!text.trim() || submit.isPending}>
            {question.answer ? "Answer again" : "Answer"}
          </Button>
        </div>
        {submit.data?.error ? (
          <p className={styles.error}>The AI is unavailable right now.</p>
        ) : null}
        {question.grade ? (
          <GradeFeedback grade={question.grade} guide={question.answerGuideEs} />
        ) : null}
      </form>
    </li>
  );
}

/** Next-day recall: 3 quick questions about yesterday's article, answered from memory. */
export function RecallCard() {
  const recall = useQuery({ queryKey: readingKeys.recall, queryFn: fetchRecall });
  const data = recall.data;
  if (!data || data.status === "none" || data.status === "done" || !data.article) return null;
  return (
    <section className={styles.recall} aria-labelledby="recall-title">
      {/* Plum "specimen" band for the title; the questions sit on cream (no forms on plum). */}
      <Panel tone="plum" padding="md" as="div" className={styles.recallHead}>
        <div className={styles.recallMeta}>
          <Eyebrow>Specimen · Yesterday</Eyebrow>
          <Eyebrow muted className={styles.recallStatus}>
            <StatusDot pulse /> Due now
          </Eyebrow>
        </div>
        <h2 id="recall-title" className={styles.recallTitle}>
          2-minute recall: {data.article.title}
        </h2>
      </Panel>
      <Panel tone="cream" padding="md" as="div" className={styles.recallBody}>
        {data.status === "ai-unavailable" ? (
          <p className={styles.muted}>
            Recall questions are unavailable right now. Try again later.
          </p>
        ) : (
          <>
            <p className={styles.muted}>Answer from memory — no peeking.</p>
            <ol className={styles.numberedList}>
              {data.questions.map((question, index) => (
                <RecallQuestion key={question.qid} question={question} n={index + 1} />
              ))}
            </ol>
          </>
        )}
      </Panel>
    </section>
  );
}
