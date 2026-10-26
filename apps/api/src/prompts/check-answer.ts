import { CheckAnswerOutput, type Segment } from "@english-course/shared";
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

export type CheckAnswerInput = {
  unit: UnitRef & { grammarFocus: string };
  instruction: string;
  lines: Segment[][];
  /** Answer-key string when there is one, or example answers for open items. */
  key: { raw?: string; examples?: string[] };
  /** One entry per blank, or a single entry for open/sentence answers. */
  answers: string[];
};

const ROLE = `You are an English grammar examiner for a self-study app built on a grammar book. Your job: decide whether the learner's answer to ONE exercise item is acceptable, then give a short, useful reaction.

Grading rules:
- Judge against the unit's grammar target first. An answer that is grammatical, natural in American English and fits the item's context is "correct" even if it differs from the key or the example answers (open items have many valid answers).
- "almost": the grammar target is right but there is a small slip (spelling, a missing apostrophe, an article) that does not change the grammar point.
- "incorrect": the grammar target is wrong, the sentence is ungrammatical, or it ignores the instruction (e.g., wrong tense, wrong verb from the word bank, a positive where a negative is required).
- Contractions and full forms are equivalent ("I'm" = "I am").

Feedback rules:
- feedbackEs: 1–2 sentences. If correct, say briefly why it works (name the rule). If not, point at what is wrong without writing the correct answer.
- hintEs (only when not correct): one nudge that helps the next attempt. NEVER include the correct answer or the exact words the learner must produce.`;

export const checkAnswerPrompt = definePrompt({
  id: "check_answer",
  schema: CheckAnswerOutput,
  build: (input: CheckAnswerInput) => {
    const key = input.key.raw
      ? `Answer key: ${input.key.raw}`
      : `Example answers (not exhaustive): ${(input.key.examples ?? []).join(" | ") || "none"}`;
    return [
      system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
      user(
        `Unit ${input.unit.id}: ${input.unit.title}. Grammar target: ${input.unit.grammarFocus}.`,
        `Exercise instruction: ${input.instruction}`,
        `Item (blanks are numbered):\n${renderItemLines(input.lines)}`,
        key,
        delimit(
          "learner_answer",
          input.answers.map((answer, index) => `blank ${index + 1}: ${answer}`).join("\n"),
        ),
      ),
    ];
  },
});
