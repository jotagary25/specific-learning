import type { ExerciseItem, ItemAnswer } from "../content/index.ts";
import { checkBlank } from "./check-blank.ts";
import { normalize } from "./normalize.ts";
import type { BlankResult, ItemCheckResult } from "./schemas.ts";

const NEEDS_AI: ItemCheckResult = { status: "needs-ai", blanks: [], score: 0 };
const OK_ANSWERS = new Set(["ok", "okay", "correct"]);

/**
 * Checks one item. "open" items always go to the AI. Items flagged `needsAi` are
 * still checked deterministically first; only a non-correct result is routed to the AI.
 */
export function checkItem(
  item: Pick<ExerciseItem, "answer">,
  inputs: readonly string[],
): ItemCheckResult {
  const answer = item.answer;
  if (!answer || answer.kind === "open" || answer.blanks.length === 0) return NEEDS_AI;
  const result = summarize(gradeBlanks(answer, inputs));
  if (answer.needsAi && result.status !== "correct") return NEEDS_AI;
  return result;
}

function gradeBlanks(answer: ItemAnswer, inputs: readonly string[]): BlankResult[] {
  // The key has one part for several blanks (e.g. 4.2 #2): compare the joined sentence.
  if (answer.blanks.length === 1 && inputs.length > 1) {
    const joined = checkJoined(inputs, answer.blanks[0] ?? []);
    return inputs.map(() => joined);
  }
  return answer.blanks.map((alternatives, i) =>
    answer.kind === "ok-or-fix"
      ? checkOkOrFix(inputs[i] ?? "", alternatives)
      : checkBlank(inputs[i] ?? "", alternatives),
  );
}

function checkOkOrFix(input: string, alternatives: readonly string[]): BlankResult {
  const keyIsOk = alternatives.some((alternative) => normalize(alternative) === "ok");
  if (!keyIsOk) return checkBlank(input, alternatives);
  return OK_ANSWERS.has(normalize(input))
    ? { verdict: "correct", matched: "OK" }
    : { verdict: "incorrect" };
}

function checkJoined(inputs: readonly string[], alternatives: readonly string[]): BlankResult {
  const withoutPunctuation = (text: string) => normalize(text).replace(/[.!?,;:]/g, "");
  return checkBlank(inputs.map(withoutPunctuation).join(" "), alternatives.map(withoutPunctuation));
}

function summarize(blanks: BlankResult[]): ItemCheckResult {
  const accepted = blanks.filter((blank) => blank.verdict !== "incorrect").length;
  const status = accepted === blanks.length ? "correct" : accepted === 0 ? "incorrect" : "partial";
  return { status, blanks, score: accepted / blanks.length };
}
