import { AnnotateArticleOutput } from "@english-course/shared";
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

export type AnnotateArticleInput = {
  article: { title: string; source: string; text: string };
  currentUnit: UnitRef & { grammarFocus: string };
  /** Words the learner already saved; do not gloss them again. */
  knownWords: string[];
};

const ROLE = `You prepare today's article for an active reading session. The article is published under a no-derivatives license: NEVER rewrite, simplify, translate or summarize the article text itself. You only add annotations around it.

Produce:
- predictPrompt: one English question about the headline that invites the learner to guess what the article is about (step 1, before reading).
- glossary: 8–15 words or phrases that a B1 reader is unlikely to know and that matter for understanding. "term" must be copied exactly as it appears in the article. Skip the learner's known words and trivial words. Each entry: lemma, part of speech, Spanish meaning in this context (glossEs), a simple English definition, and a short new example sentence (not copied from the article).
- grammarSpots: up to 5 exact quotes from the article that use the current unit's grammar. Copy each quote verbatim (a clause or sentence), name the form, and explain in Spanish why the writer used it there. If there is no instance, return an empty list and explain in grammarNoteEs which related form appears instead.
- questions: exactly 3 inference questions in English. They must require understanding (why, what does it imply, what might happen next, what is the author's view), not locating a fact in one sentence. answerGuideEs says what a good answer covers.
- opinionPrompt: one English question that invites a one-sentence opinion the learner could later turn into a post.`;

export const annotateArticlePrompt = definePrompt({
  id: "annotate_article",
  schema: AnnotateArticleOutput,
  build: (input: AnnotateArticleInput) => [
    system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
    user(
      `Current unit ${input.currentUnit.id}: ${input.currentUnit.title}. Grammar target: ${input.currentUnit.grammarFocus}.`,
      `Known words (do not gloss): ${input.knownWords.join(", ") || "none"}.`,
      `Source: ${input.article.source}`,
      delimit("article_title", input.article.title),
      delimit("article_text", input.article.text),
    ),
  ],
});
