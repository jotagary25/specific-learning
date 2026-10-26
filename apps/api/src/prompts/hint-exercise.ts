import { HintExerciseOutput, type HintLevel, type Segment } from "@english-course/shared";
import {
  definePrompt,
  delimit,
  INJECTION_GUARD,
  JSON_ONLY,
  LANGUAGE_RULES,
  LEARNER_PROFILE,
  renderItemLines,
  system,
  type UnitRef,
  user,
} from "./shared.ts";

export type HintExerciseInput = {
  unit: UnitRef & { grammarFocus: string };
  /** Plain-text summary of the unit theory (rules and key examples). */
  theorySummary: string;
  instruction: string;
  lines: Segment[][];
  /** Reference answers so the hint is accurate. Must never be revealed. */
  keyAnswers: string[];
  /** 1-based number of the hint being requested for this item. */
  attempt: number;
  previousAnswers: string[];
};

export const NO_REVEAL_RULE =
  "NEVER reveal the answer: do not write the correct form, do not quote any word the learner must produce, and do not give a sentence that contains the solution.";

const ROLE = `You are a patient grammar coach. The learner is stuck on ONE exercise item and asked for a hint. Confusion is when they usually give up, so the hint must unblock them in under 20 seconds of reading.

Graduated hints (you will be told which level to give):
- Level 1, nudge: point their attention to the clue in the sentence (a time expression, "right now", "every day", the subject) or to what kind of answer is needed. No grammar terms beyond the obvious.
- Level 2, rule pointer: name the rule that applies here and how the form is built (e.g. "be + verb-ing"), referring to the unit theory.
- Level 3, partial: walk through the reasoning step by step and give the structure with placeholders (e.g. "sujeto + am/is/are + verbo-ing"), still leaving the final form for the learner.

Rules:
- ${NO_REVEAL_RULE}
- If the learner's previous answers show a specific misconception, address that misconception.
- hintEs: at most 2 short sentences.`;

export function hintLevelFor(attempt: number): HintLevel {
  if (attempt <= 1) return 1;
  if (attempt === 2) return 2;
  return 3;
}

export const hintExercisePrompt = definePrompt({
  id: "hint_exercise",
  schema: HintExerciseOutput,
  build: (input: HintExerciseInput) => {
    const level = hintLevelFor(input.attempt);
    return [
      system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
      user(
        `Give a level ${level} hint. Set "level" to ${level}.`,
        `Unit ${input.unit.id}: ${input.unit.title}. Grammar target: ${input.unit.grammarFocus}.`,
        `Unit theory summary:\n${input.theorySummary}`,
        `Exercise instruction: ${input.instruction}`,
        `Item (blanks are numbered):\n${renderItemLines(input.lines)}`,
        `Reference answers (secret, for your reasoning only — ${NO_REVEAL_RULE}): ${input.keyAnswers.join(" | ")}`,
        delimit("previous_answers", input.previousAnswers.join("\n") || "(none yet)"),
      ),
    ];
  },
});
