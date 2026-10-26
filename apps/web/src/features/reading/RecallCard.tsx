import type { RecallQuestionView } from "@english-course/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GradeFeedback } from "./FlowSteps.tsx";
import styles from "./Reading.module.css";
import { answerRecall, fetchRecall, readingKeys } from "./reading.api.ts";

function RecallQuestion({ question }: { question: RecallQuestionView }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(question.answer ?? "");
  const submit = useMutation({
    mutationFn: () => answerRecall(question.qid, text),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: readingKeys.recall }),
  });
  const id = `recall-${question.qid}`;
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) submit.mutate();
      }}
    >
      <label htmlFor={id} className={styles.label}>
        {question.question}
      </label>
      <input
        id={id}
        className={styles.input}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.secondary}
          disabled={!text.trim() || submit.isPending}
        >
          {question.answer ? "Answer again" : "Answer"}
        </button>
      </div>
      {submit.data?.error ? <p className={styles.error}>The AI is unavailable right now.</p> : null}
      {question.grade ? (
        <GradeFeedback grade={question.grade} guide={question.answerGuideEs} />
      ) : null}
    </form>
  );
}

/** Next-day recall: 3 quick questions about yesterday's article, answered from memory. */
export function RecallCard() {
  const recall = useQuery({ queryKey: readingKeys.recall, queryFn: fetchRecall });
  const data = recall.data;
  if (!data || data.status === "none" || data.status === "done" || !data.article) return null;
  return (
    <section className={styles.recall} aria-labelledby="recall-title">
      <h2 id="recall-title" className={styles.subheading}>
        2-minute recall: {data.article.title}
      </h2>
      {data.status === "ai-unavailable" ? (
        <p className={styles.muted}>Recall questions are unavailable right now. Try again later.</p>
      ) : (
        <>
          <p className={styles.muted}>Answer from memory — no peeking.</p>
          {data.questions.map((question) => (
            <RecallQuestion key={question.qid} question={question} />
          ))}
        </>
      )}
    </section>
  );
}
