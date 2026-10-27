import type { GlossEntry, ReadingStep } from "@english-course/shared";

export const FLOW_STEPS = ["predict", "read", "questions", "spots", "retell", "opinion"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

export const STEP_LABELS: Record<FlowStep, string> = {
  predict: "Predict",
  read: "Read",
  questions: "Questions",
  spots: "Grammar hunt",
  retell: "Retell",
  opinion: "Opinion",
};

/** Stepper subtitles: what each step asks of the learner. */
export const STEP_HINTS: Record<FlowStep, string> = {
  predict: "Guess the story",
  read: "Tap any word",
  questions: "Think beyond",
  spots: "Find the form",
  retell: "From memory",
  opinion: "One sentence",
};

export const nextStep = (step: FlowStep): ReadingStep =>
  FLOW_STEPS[FLOW_STEPS.indexOf(step) + 1] ?? "done";

/** Steps the learner may revisit: everything up to the step the session reached. */
export function reachable(current: ReadingStep): FlowStep[] {
  if (current === "done") return [...FLOW_STEPS];
  return FLOW_STEPS.slice(0, FLOW_STEPS.indexOf(current) + 1);
}

export type Token = {
  text: string;
  /** Offset of the token in its paragraph. */
  offset: number;
  isWord: boolean;
  /** Index into the glossary when the token is part of an annotated term. */
  glossIndex?: number;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Splits a paragraph into words and gaps, tagging the words of annotated glossary terms. */
export function tokenize(paragraph: string, glossary: readonly GlossEntry[] = []): Token[] {
  const owner = new Array<number | undefined>(paragraph.length);
  glossary.forEach((entry, index) => {
    const term = entry.term.trim();
    if (!term) return;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu");
    for (const match of paragraph.matchAll(pattern)) {
      for (let i = match.index; i < match.index + match[0].length; i++) owner[i] ??= index;
    }
  });
  const tokens: Token[] = [];
  for (const match of paragraph.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*|[^\p{L}\p{N}]+/gu)) {
    const isWord = /[\p{L}\p{N}]/u.test(match[0]);
    const glossIndex = isWord ? owner[match.index] : undefined;
    tokens.push({
      text: match[0],
      offset: match.index,
      isWord,
      ...(glossIndex === undefined ? {} : { glossIndex }),
    });
  }
  return tokens;
}

/** Paragraphs with stable keys for rendering. */
export const keyedParagraphs = (paragraphs: readonly string[]) =>
  paragraphs.map((text, index) => ({ key: `p${index}`, index, text }));

/** Hostname of a URL for the attribution line. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
