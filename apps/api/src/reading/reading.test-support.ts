// Shared fixtures for Reading tests: a fake news source, article text and AI replies.
import type { AnnotateArticleOutput, ArticleTopic } from "@english-course/shared";
import type { NewsArticle, NewsCandidate, NewsSource } from "../shared/news/types.ts";

const FILLER = "Engineers are testing small robots that sort plastic in a busy recycling plant. ";

/** ~560 words with two grammar spots ("are testing", "is growing"). */
export const ARTICLE_TEXT = [
  FILLER.repeat(10).trim(),
  "The city is growing fast, and the plant is working day and night.",
  FILLER.repeat(10).trim(),
  FILLER.repeat(10).trim(),
  FILLER.repeat(10).trim(),
].join("\n\n");

export const SPOT_QUOTES = ["is growing fast", "is working day and night"];

export function annotations(overrides: Partial<AnnotateArticleOutput> = {}): AnnotateArticleOutput {
  return {
    predictPrompt: "What do you think the robots are doing?",
    glossary: [
      {
        term: "sort",
        lemma: "sort",
        partOfSpeech: "verb",
        glossEs: "clasificar",
        definitionEn: "to put things into groups",
        example: "She sorts the mail every morning.",
      },
      {
        term: "plant",
        lemma: "plant",
        partOfSpeech: "noun",
        glossEs: "planta (fábrica)",
        definitionEn: "a factory",
        example: "The car plant closed.",
      },
      {
        term: "busy",
        lemma: "busy",
        partOfSpeech: "adjective",
        glossEs: "concurrido",
        definitionEn: "full of activity",
        example: "The station is busy.",
      },
    ],
    grammarSpots: SPOT_QUOTES.map((quote) => ({
      quote,
      form: "present continuous",
      whyEs: "Acción en curso alrededor de ahora.",
    })),
    questions: [0, 1, 2].map((n) => ({
      question: `Why does question ${n} matter?`,
      answerGuideEs: `Guía ${n}`,
    })),
    opinionPrompt: "Would you trust a robot to sort your trash?",
    ...overrides,
  };
}

export const gradeReply = (score: 0 | 1 | 2, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ score, feedbackEs: "Bien.", ...extra });

export function candidate(overrides: Partial<NewsCandidate> & { url: string }): NewsCandidate {
  return {
    source: "theconversation",
    title: `Title of ${overrides.url}`,
    summary: "Summary.",
    publishedAt: new Date("2026-10-24T10:00:00Z"),
    topicHint: "tech" as ArticleTopic,
    outlet: "The Conversation",
    authors: ["Ada Lovelace, Professor, Example University"],
    license: "CC BY-ND 4.0",
    text: ARTICLE_TEXT,
    wordCount: 560,
    ...overrides,
  };
}

export type FakeSource = NewsSource & { fetched: string[] };

export function fakeSource(
  candidates: NewsCandidate[] | (() => Promise<NewsCandidate[]>),
  name = "fake",
  texts: Record<string, string> = {},
): FakeSource {
  const fetched: string[] = [];
  return {
    name,
    fetched,
    candidates: typeof candidates === "function" ? candidates : async () => candidates,
    async fetchFullText(c): Promise<NewsArticle> {
      fetched.push(c.url);
      return {
        source: c.source,
        url: c.url,
        title: c.title,
        authors: c.authors,
        outlet: c.outlet,
        license: c.license,
        publishedAt: c.publishedAt,
        text: texts[c.url] ?? c.text ?? ARTICLE_TEXT,
      };
    },
  };
}
