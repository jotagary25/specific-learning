import type { PracticeItem } from "../ai/schemas.ts";
import { checkTypedAnswer, type TypedVerdict } from "../vocabulary/check.ts";

/** Deterministic check of a practice answer (same normalization as exercises and SRS). */
export function checkPracticeAnswer(
  item: Pick<PracticeItem, "answer" | "acceptedAlternatives">,
  input: string,
): TypedVerdict {
  return checkTypedAnswer(input, [item.answer, ...item.acceptedAlternatives]);
}
