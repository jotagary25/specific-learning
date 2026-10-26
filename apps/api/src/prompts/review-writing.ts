import { type CefrLevel, type MissionFormat, ReviewWritingOutput } from "@english-course/shared";
import {
  definePrompt,
  delimit,
  formatUnitCatalog,
  INJECTION_GUARD,
  JSON_ONLY,
  LANGUAGE_RULES,
  LEARNER_PROFILE,
  system,
  type UnitRef,
  user,
} from "./shared.ts";

export type ReviewWritingInput = {
  text: string;
  mission: { title: string; format: MissionFormat; promptEn: string; targetUnit: UnitRef };
  level: CefrLevel;
  /** Compact catalog used to link each error to a book unit. */
  units: UnitRef[];
};

const ROLE = `You review a short piece the learner wrote for their personal brand (social posts about technology, news and books). This is the FIRST pass of a two-step flow: the learner will fix the errors themselves, and only afterwards will they see natural rewrites. Research on written corrective feedback shows that a few focused corrections teach more than marking everything.

Rules:
- Report at most 3 errors, and only REAL errors (grammar, wrong word, spelling, punctuation that changes meaning, word order, a register clash). Do not report stylistic preferences; naturalness is handled later.
- Prioritize, in this order: errors of the mission's target unit, errors that block understanding, typical Spanish-speaker transfer errors, everything else.
- span: copy the exact erroneous substring from the text (as short as possible while unique). id: "e1", "e2", "e3".
- unitId: the book unit that teaches the fix, chosen from the catalog; null if none fits.
- hintEs: a hint in Spanish that lets the learner fix it alone (name the rule or the clue). NEVER write the corrected word, phrase or sentence anywhere in the output.
- scores (0–100): grammar, clarity, vocabulary, naturalness for a B1–B2 writer posting on social media; be honest, not generous.
- strengthEs: one specific thing they did well (a structure, a word choice), so they know what to keep doing.`;

export const reviewWritingPrompt = definePrompt({
  id: "review_writing",
  schema: ReviewWritingOutput,
  build: (input: ReviewWritingInput) => [
    system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
    user(
      `Mission: ${input.mission.title} (format: ${input.mission.format}). Target unit ${input.mission.targetUnit.id}: ${input.mission.targetUnit.title}.`,
      `Mission prompt: ${input.mission.promptEn}`,
      `Learner level: ${input.level}.`,
      `Unit catalog (id: title):\n${formatUnitCatalog(input.units)}`,
      delimit("learner_text", input.text),
    ),
  ],
});
