import { GeneratePracticeOutput } from "@english-course/shared";
import {
  definePrompt,
  delimit,
  INJECTION_GUARD,
  JSON_ONLY,
  LANGUAGE_RULES,
  LEARNER_PROFILE,
  system,
  type UnitRef,
  user,
} from "./shared.ts";

export type PracticeSource = {
  id: string;
  /** The learner's own sentence that contained the error. */
  sentence: string;
  span: string;
  type: string;
  /** The fix the learner eventually reached, when known. */
  fixed?: string;
};

export type GeneratePracticeInput = {
  unit: UnitRef & { grammarFocus: string; theorySummary: string };
  sources: PracticeSource[];
  count: number;
};

const ROLE = `You turn the learner's OWN past mistakes into short practice items for spaced repetition. Practicing with their own sentences is more memorable than generic exercises.

- For each source error, create one item (up to the requested count), in the source order.
- "fix_sentence": show the learner's original sentence (lightly trimmed to one clause if long) and ask them to correct it. "fill_blank": rewrite a NEW sentence on the same topic with "___" where the target form goes, plus the base verb or hint in parentheses.
- Alternate the two types when there are several items, so recall is not just recognition.
- answer: the correct full sentence (fix_sentence) or the missing words (fill_blank). acceptedAlternatives: other correct forms (contractions, valid variants), max 4.
- instructionEs: one short instruction in Spanish.
- Keep the topic of the learner's sentence (technology, news, books) so the item feels like their own writing.
- sourceId must be the id of the source error.`;

export const generatePracticePrompt = definePrompt({
  id: "generate_practice",
  schema: GeneratePracticeOutput,
  build: (input: GeneratePracticeInput) => [
    system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
    user(
      `Create ${input.count} item(s).`,
      `Unit ${input.unit.id}: ${input.unit.title}. Grammar target: ${input.unit.grammarFocus}.`,
      `Unit theory summary:\n${input.unit.theorySummary}`,
      delimit(
        "learner_errors",
        input.sources
          .map(
            (source) =>
              `id: ${source.id}\nsentence: ${source.sentence}\nerror span: ${source.span}\ntype: ${source.type}${source.fixed ? `\nlearner's fix: ${source.fixed}` : ""}`,
          )
          .join("\n---\n"),
      ),
    ),
  ],
});
