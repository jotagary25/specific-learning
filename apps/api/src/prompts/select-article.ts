import { type ArticleTopic, SelectArticleOutput } from "@english-course/shared";
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

export type ArticleCandidate = {
  id: string;
  title: string;
  summary: string;
  source: string;
  wordCount: number;
  publishedAt: string;
  topicHint?: ArticleTopic;
};

export type SelectArticleInput = {
  candidates: ArticleCandidate[];
  currentUnit: UnitRef & { grammarFocus: string };
  /** Topics of the last days' articles, most recent first. */
  recentTopics: ArticleTopic[];
  recentTitles: string[];
  wordRange: { min: number; max: number };
};

const ROLE = `You are the editor of a daily English reading for one learner. From the candidate articles, choose the single best one for today's 25-minute session.

Criteria, in order:
1. Current: published recently and about something happening now.
2. Topic rotation: the learner reads technology, science and geopolitics; prefer a topic different from the most recent ones.
3. Length inside the given word range.
4. Level B1–B2: explanatory writing, not dense jargon or heavy idioms.
5. Likely to contain the current unit's grammar naturally (e.g. narratives use the past tenses; explainers of ongoing events use present continuous).
6. Novelty: not a repeat of recent titles or stories.
7. Curiosity: a story with a question or a surprise beats a dry report.

Return the chosen candidate id exactly as given, its topic, the estimated level and 1–4 short reasons (English).`;

export const selectArticlePrompt = definePrompt({
  id: "select_article",
  schema: SelectArticleOutput,
  build: (input: SelectArticleInput) => {
    const candidates = input.candidates
      .map(
        (candidate) =>
          `id: ${candidate.id}\ntitle: ${candidate.title}\nsource: ${candidate.source}\npublished: ${candidate.publishedAt}\nwords: ${candidate.wordCount}\ntopic hint: ${candidate.topicHint ?? "unknown"}\nsummary: ${candidate.summary}`,
      )
      .join("\n---\n");
    return [
      system(ROLE, LEARNER_PROFILE, LANGUAGE_RULES, INJECTION_GUARD, JSON_ONLY),
      user(
        `Current unit ${input.currentUnit.id}: ${input.currentUnit.title}. Grammar target: ${input.currentUnit.grammarFocus}.`,
        `Word range: ${input.wordRange.min}–${input.wordRange.max}.`,
        `Recent topics (newest first): ${input.recentTopics.join(", ") || "none"}.`,
        delimit("recent_titles", input.recentTitles.join("\n") || "(none)"),
        delimit("candidates", candidates),
      ),
    ];
  },
});
