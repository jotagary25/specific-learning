import { GlossWordOutput } from "@english-course/shared";
import {
  definePrompt,
  delimit,
  INJECTION_GUARD,
  JSON_ONLY,
  LANGUAGE_RULES,
  LEARNER_PROFILE,
  system,
  user,
} from "./shared.ts";

export type GlossWordInput = {
  word: string;
  sentence: string;
};

const ROLE = `The learner tapped a word while reading. Explain it for THIS sentence only, fast, so reading is barely interrupted.

- lemma: dictionary form (for phrasal verbs and fixed phrases, the whole phrase).
- partOfSpeech: e.g. noun, verb, phrasal verb, adjective, idiom.
- glossEs: the Spanish meaning that fits this sentence (1–4 words, add a short clarification only if needed).
- definitionEn: a simple English definition (max 15 words, B1 vocabulary).
- example: a new short example sentence in American English, different from the given sentence.`;

export const glossWordPrompt = definePrompt({
  id: "gloss_word",
  schema: GlossWordOutput,
  build: (input: GlossWordInput) => [
    system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
    user(delimit("word", input.word), delimit("sentence", input.sentence)),
  ],
});
