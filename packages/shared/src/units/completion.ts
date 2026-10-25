import type { ItemOutcome, UnitCompletion } from "./schemas.ts";

export const COMPLETION_THRESHOLD = 0.8;
// Guards against floating-point drift when summing partial scores.
const EPSILON = 1e-9;

/**
 * Unit completion from first-attempt outcomes. Examples are ignored; needs-ai items
 * are pending until resolved. "almost" counts as correct but is reported separately.
 */
export function unitCompletion(outcomes: readonly ItemOutcome[]): UnitCompletion {
  const attempted = outcomes.filter((outcome) => !outcome.isExample);
  const graded = attempted.filter((outcome) => outcome.result.status !== "needs-ai");
  const totalScore = graded.reduce((sum, outcome) => sum + outcome.result.score, 0);
  const ratio = graded.length === 0 ? 0 : totalScore / graded.length;
  const correct = graded.filter((outcome) => outcome.result.status === "correct");

  return {
    graded: graded.length,
    correct: correct.length,
    almost: correct.filter((outcome) =>
      outcome.result.blanks.some((blank) => blank.verdict === "almost"),
    ).length,
    pending: attempted.length - graded.length,
    ratio,
    completed: graded.length > 0 && ratio >= COMPLETION_THRESHOLD - EPSILON,
  };
}
