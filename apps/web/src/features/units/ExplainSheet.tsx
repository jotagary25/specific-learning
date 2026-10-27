import type { ExplainContext, ExplainResponse } from "@english-course/shared";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { HttpError } from "../../shared/api/http.ts";
import { Button, buttonClassName, Eyebrow, Field, overlayStyles } from "../../shared/ui/index.ts";
import styles from "./Units.module.css";
import { requestExplanation } from "./units.api.ts";

type Props = {
  unitNumber: number;
  context: Pick<ExplainContext, "step" | "itemId" | "timelineItemId">;
  /** Closes the sheet; the page restores the exact step and item. */
  onBack: () => void;
  /** Continues in the tutor chat; receives the explanation already shown (if any). */
  onFollowUp?: (shownExplanation?: string) => void;
};

const unavailable = (error: Error) =>
  error instanceof HttpError && error.code === "ai-unavailable"
    ? "The AI tutor is unavailable right now (add an Ollama API key in Settings). Your doubt was saved for later."
    : error.message;

/** "I don't get it": a Spanish explanation of what is on screen, then back to the same spot. */
export function ExplainSheet({ unitNumber, context, onBack, onFollowUp }: Props) {
  const titleId = useId();
  const questionId = useId();
  const [question, setQuestion] = useState("");
  const [previous, setPrevious] = useState<ExplainResponse[]>([]);
  const backRef = useRef<HTMLButtonElement>(null);

  const explain = useMutation({
    mutationFn: (extra: { question?: string; previousExplanations: string[] }) =>
      requestExplanation(unitNumber, { ...context, ...extra }),
    onSuccess: (res) => setPrevious((list) => [...list, res]),
  });

  // Ask once when the sheet opens (the ref keeps StrictMode's double effect from asking twice).
  const { mutate } = explain;
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    mutate({ previousExplanations: [] });
    backRef.current?.focus();
  }, [mutate]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const current = previous.at(-1);

  return (
    <>
      <div className={overlayStyles.backdrop} aria-hidden="true" />
      <div
        className={overlayStyles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={overlayStyles.header}>
          <div>
            <Eyebrow muted>I don't get it</Eyebrow>
            <h2 id={titleId} className={overlayStyles.title}>
              No entiendo
            </h2>
          </div>
        </div>
        {explain.isPending ? (
          <p className={styles.muted} role="status">
            Preparing an explanation…
          </p>
        ) : null}
        {explain.isError ? <p className={styles.error}>{unavailable(explain.error)}</p> : null}
        {current && !explain.isPending ? (
          <div className={styles.explanation} lang="es" aria-live="polite">
            <p>{current.explanationEs}</p>
            <ul lang="en">
              {current.examplesEn.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
            {current.analogyEs ? <p className={styles.muted}>{current.analogyEs}</p> : null}
            {current.pitfallEs ? <p className={styles.muted}>{current.pitfallEs}</p> : null}
            <p className={styles.backToTask}>
              <strong>{current.backToTaskEs}</strong>
            </p>
          </div>
        ) : null}

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            explain.mutate({
              question: question.trim() || undefined,
              previousExplanations: previous.map((p) => p.explanationEs).slice(-3),
            });
          }}
        >
          <Field label="Still confused? Ask in your own words (optional)" id={questionId}>
            <input
              id={questionId}
              value={question}
              maxLength={500}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </Field>
          <div className={styles.actions}>
            <Button type="submit" variant="secondary" disabled={explain.isPending}>
              Explain it differently
            </Button>
            {onFollowUp ? (
              <Button
                variant="secondary"
                onClick={() =>
                  onFollowUp(
                    current
                      ? `Explanation already shown: ${current.explanationEs}`.slice(0, 2000)
                      : undefined,
                  )
                }
              >
                Ask a follow-up
              </Button>
            ) : null}
            <button
              ref={backRef}
              type="button"
              className={buttonClassName({ className: styles.backButton })}
              onClick={onBack}
            >
              Back to where I was
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
