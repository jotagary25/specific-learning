import { RecallQuestionsOutput } from "@english-course/shared";
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

export type RecallQuestionsInput = {
  article: { title: string; text: string };
  savedWords: string[];
  opinion?: string;
};

const ROLE = `Yesterday the learner read an article. Write exactly 3 quick questions to retrieve it from memory today (retrieval practice strengthens memory far more than rereading). The learner answers without seeing the article.

- One "recall" question: the main point or a key fact of the article.
- One "word" question: makes them USE one of their saved words (e.g. "Use 'X' in a sentence about…" or "Which word from yesterday means…?"). If no words were saved, ask about a key term from the article.
- One "inference" question: why it matters, what might happen next, or how it connects to their opinion.
- Questions in simple English (B1), answerable in one or two sentences. answerGuideEs: what a good answer contains.`;

export const recallQuestionsPrompt = definePrompt({
  id: "recall_questions",
  schema: RecallQuestionsOutput,
  build: (input: RecallQuestionsInput) => [
    system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
    user(
      `Saved words: ${input.savedWords.join(", ") || "none"}.`,
      delimit("article_title", input.article.title),
      delimit("article_text", input.article.text),
      delimit("learner_opinion", input.opinion ?? "(none)"),
    ),
  ],
});
