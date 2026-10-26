import {
  checkTypedAnswer,
  type DiffToken,
  type QueueCard,
  ratingForVerdict,
  type SessionRequest,
  type SrsRating,
  type TypedVerdict,
  wordDiff,
} from "@english-course/shared";

export type TypedFeedback = {
  verdict: TypedVerdict;
  suggested: SrsRating;
  expected: string;
  /** Word diff against the expected answer; only for not-exact `fix` answers. */
  diff: DiffToken[] | null;
};

/** Instant feedback for a typed card (production or fix). */
export function feedbackFor(card: QueueCard, input: string): TypedFeedback {
  const accepted = card.answers ?? [];
  const verdict = checkTypedAnswer(input, accepted);
  const expected = accepted[0] ?? "";
  return {
    verdict,
    suggested: ratingForVerdict(verdict),
    expected,
    diff: card.direction === "fix" && verdict !== "correct" ? wordDiff(input, expected) : null,
  };
}

export const VERDICT_TEXT: Record<TypedVerdict, string> = {
  correct: "Correct!",
  almost: "Almost — check the spelling.",
  incorrect: "Not quite.",
};

export type Tally = Omit<SessionRequest, "seconds">;

export const emptyTally = (): Tally => ({ reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 });

const RATING_KEYS = { 1: "again", 2: "hard", 3: "good", 4: "easy" } as const;

export function addRating(tally: Tally, rating: SrsRating): Tally {
  const key = RATING_KEYS[rating];
  return { ...tally, reviewed: tally.reviewed + 1, [key]: tally[key] + 1 };
}

/** "1".."4" → rating, anything else → null. */
export function ratingFromKey(key: string): SrsRating | null {
  return key === "1" || key === "2" || key === "3" || key === "4"
    ? (Number(key) as SrsRating)
    : null;
}
