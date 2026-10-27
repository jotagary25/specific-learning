import {
  type AnswersResponse,
  type AttemptResponse,
  checkItem,
  type HintResponse,
  type ItemCheckResult,
  type ItemProgress,
  type PublicExerciseItem,
  type Segment,
} from "@english-course/shared";
import { useMutation } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { Badge, Button } from "../../shared/ui/index.ts";
import styles from "./Exercises.module.css";
import { requestHint, submitAttempt } from "./units.api.ts";
import { type Verdict, verdictOf } from "./units.model.ts";

export type ReviewAnswer = AnswersResponse["items"][number];

type Props = {
  unitNumber: number;
  item: PublicExerciseItem;
  inputs: string[];
  onInputsChange: (next: string[]) => void;
  onFocusBlank: (index: number) => void;
  registerInput: (index: number, element: HTMLInputElement | null) => void;
  progress?: ItemProgress;
  /** Answer key, only present in review mode (after every item was attempted). */
  answer?: ReviewAnswer;
  onAttempt: (response: AttemptResponse, inputs: string[]) => void;
};

const MAX_HINTS = 3;

export function blankCount(item: PublicExerciseItem): number {
  return item.lines.flat().filter((segment) => segment.type === "blank").length;
}

const VERDICT_BADGES: Record<Verdict, string> = {
  correct: "Correct",
  almost: "Almost",
  incorrect: "Incorrect",
  "needs-ai": "Checking",
};

const VERDICT_TEXT: Record<Verdict, string> = {
  correct: "Correct!",
  almost: "Almost: accepted, but check the spelling.",
  incorrect: "Not quite. Try again or ask for a hint.",
  "needs-ai": "Waiting for the AI check…",
};

function VerdictBox({
  result,
  response,
  saved,
  local,
}: {
  result: ItemCheckResult;
  response?: AttemptResponse;
  /** The stored latest attempt, used for its AI feedback after a reload. */
  saved?: ItemProgress["latest"];
  local: boolean;
}) {
  const verdict = verdictOf(result);
  const unavailable = response?.error === "ai-unavailable";
  const feedbackEs = response ? response.feedbackEs : saved?.feedbackEs;
  const hintEs = response ? response.hintEs : saved?.hintEs;
  return (
    <div className={styles.verdict} data-verdict={verdict} role="status">
      {/* The sentence below already says it; the badge is the visual label. */}
      <Badge tone={verdict === "needs-ai" ? "neutral" : verdict} aria-hidden="true">
        {VERDICT_BADGES[verdict]}
      </Badge>
      <p className={styles.verdictText}>
        {unavailable
          ? "Answer saved, but the AI check is unavailable right now (add an Ollama API key in Settings)."
          : VERDICT_TEXT[verdict]}
        {local ? <span className={styles.muted}> (checking with the server…)</span> : null}
      </p>
      {feedbackEs ? <p lang="es">{feedbackEs}</p> : null}
      {hintEs ? (
        <p lang="es" className={styles.muted}>
          Pista: {hintEs}
        </p>
      ) : null}
    </div>
  );
}

export function ExerciseItem({
  unitNumber,
  item,
  inputs,
  onInputsChange,
  onFocusBlank,
  registerInput,
  progress,
  answer,
  onAttempt,
}: Props) {
  const [response, setResponse] = useState<AttemptResponse | undefined>();
  const [localResult, setLocalResult] = useState<ItemCheckResult | undefined>();
  const [hints, setHints] = useState<HintResponse[]>([]);
  const number = item.num.replace(/\.$/, "");
  const blanks = blankCount(item);

  const submit = useMutation({
    mutationFn: (values: string[]) => submitAttempt(unitNumber, item.id, values),
    onSuccess: (res, values) => {
      setResponse(res);
      setLocalResult(undefined);
      onAttempt(res, values);
    },
    onError: () => setLocalResult(undefined),
  });

  const hint = useMutation({
    mutationFn: () => requestHint(unitNumber, item.id, hints.length),
    onSuccess: (res) => setHints((previous) => [...previous, res]),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const values = inputs.map((value) => value.trim());
    // Review mode: the key is known locally, so show the verdict instantly; the server decides.
    if (answer) {
      const { itemId: _itemId, ...key } = answer;
      const local = checkItem({ answer: key }, values);
      if (local.status !== "needs-ai") setLocalResult(local);
    }
    submit.mutate(values);
  };

  const shown = localResult ?? response?.result ?? progress?.latest.result;
  let blankIndex = -1;

  const renderSegment = (segment: Segment, key: string) => {
    switch (segment.type) {
      case "text":
        return <span key={key}>{segment.text}</span>;
      case "underline":
        return (
          <u key={key} className={styles.underline}>
            {segment.text}
          </u>
        );
      case "example":
        return (
          <input
            key={key}
            className={styles.blank}
            data-size="long"
            value={segment.text}
            disabled
            aria-label={`Item ${number} example answer`}
            size={Math.max(segment.text.length, 4)}
          />
        );
      case "blank": {
        blankIndex += 1;
        const index = blankIndex;
        const verdict = shown?.blanks[index]?.verdict;
        return (
          <input
            key={key}
            ref={(element) => registerInput(index, element)}
            className={styles.blank}
            data-size={segment.size}
            data-verdict={verdict}
            value={inputs[index] ?? ""}
            onChange={(event) => {
              const next = [...inputs];
              next[index] = event.target.value;
              onInputsChange(next);
            }}
            onFocus={() => onFocusBlank(index)}
            aria-label={blanks > 1 ? `Item ${number}, blank ${index + 1}` : `Item ${number} answer`}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            size={segment.size === "short" ? 6 : 16}
          />
        );
      }
    }
  };

  if (item.isExample) {
    return (
      <li className={styles.item} data-example="true">
        <span className={`numeral ${styles.num}`}>{number}</span>
        <div className={styles.lines}>
          {item.lines.map((line, l) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static content
            <p key={l} className={styles.line}>
              {line.map((segment, s) => renderSegment(segment, `${l}-${s}`))}
            </p>
          ))}
          <span className={styles.exampleTag}>Example</span>
        </div>
      </li>
    );
  }

  const complete = inputs.length > 0 && inputs.every((value) => value.trim() !== "");

  return (
    <li className={styles.item} data-item-id={item.id}>
      <span className={`numeral ${styles.num}`}>{number}</span>
      <form className={styles.lines} onSubmit={onSubmit}>
        {item.lines.map((line, l) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static content
          <p key={l} className={styles.line}>
            {line.map((segment, s) => renderSegment(segment, `${l}-${s}`))}
          </p>
        ))}
        {blanks === 0 ? (
          <input
            ref={(element) => registerInput(0, element)}
            className={styles.blank}
            data-size="long"
            value={inputs[0] ?? ""}
            onChange={(event) => onInputsChange([event.target.value])}
            onFocus={() => onFocusBlank(0)}
            aria-label={`Item ${number} answer`}
          />
        ) : null}

        <div className={styles.itemActions}>
          <Button type="submit" size="sm" disabled={!complete || submit.isPending}>
            {submit.isPending ? "Checking…" : "Check"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => hint.mutate()}
            disabled={hints.length >= MAX_HINTS || hint.isPending}
          >
            {hint.isPending ? "Thinking…" : hints.length === 0 ? "Hint" : "Another hint"}
          </Button>
          {item.isOpen ? <span className={styles.muted}>Checked by AI</span> : null}
        </div>

        {shown ? (
          <VerdictBox
            result={shown}
            response={response}
            saved={localResult ? undefined : progress?.latest}
            local={localResult !== undefined}
          />
        ) : null}
        {submit.isError ? <p className={styles.error}>{submit.error.message}</p> : null}
        {hints.length > 0 ? (
          <ol className={styles.hints} lang="es" aria-label={`Hints for item ${number}`}>
            {hints.map((h) => (
              <li key={h.level + h.hintEs}>{h.hintEs}</li>
            ))}
          </ol>
        ) : null}
        {hint.isError ? <p className={styles.error}>{hint.error.message}</p> : null}
        {answer ? (
          <p className={styles.answer}>
            Answer: <strong>{answer.raw}</strong>
          </p>
        ) : null}
      </form>
    </li>
  );
}
