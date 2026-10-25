import type { AnswerKind, ItemAnswer } from "@english-course/shared";

export interface AnswerContext {
  /** Number of blank segments in the item. */
  blankCount: number;
  /** The item has underlined targets (error-correction exercise). */
  hasUnderline: boolean;
  /** The exercise is open-ended ("Example answers"). */
  open: boolean;
}

const DIALOGUE_SEPARATOR = " | ";
// " . . . " separates blanks, except when it starts an alternative ("x / . . . y"),
// where it is an ellipsis wildcard inside that alternative.
const BLANK_SEPARATOR = /(?<!\/) \. \. \. /;
const ALTERNATIVE_SEPARATOR = / \/ | or /;
const ELLIPSIS = ". . .";
// "’m looking (am looking)": contraction followed by its full form in parentheses.
const FULL_FORM = /^(.+?)\s+\(([^()]+)\)$/;
const CONTRACTION = /[’']/;

/**
 * Parses one answer-key string into per-blank alternatives (spec §3.2.1).
 * It only splits; normalization (apostrophes, case, punctuation) is the checker's job.
 */
export function parseAnswer(rawHtml: string, context: AnswerContext): ItemAnswer {
  const raw = stripHtml(rawHtml);
  const parts = raw
    .split(DIALOGUE_SEPARATOR)
    .flatMap((part) => part.split(BLANK_SEPARATOR))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const blanks = parts.map(parseAlternatives);
  const answer: ItemAnswer = { raw, blanks, kind: answerKind(raw, context), needsAi: false };

  const aiReason = findAiReason(answer, context);
  if (aiReason) {
    answer.needsAi = true;
    answer.aiReason = aiReason;
  }
  return answer;
}

function findAiReason(answer: ItemAnswer, context: AnswerContext): string | undefined {
  if (context.open) return "open answer: the key only lists example answers";
  if (answer.blanks.length !== context.blankCount) {
    const parts = answer.blanks.length;
    return `answer has ${parts} part${parts === 1 ? "" : "s"} for ${context.blankCount} blanks`;
  }
  if (answer.blanks.flat().some((alternative) => alternative.includes(ELLIPSIS))) {
    return "an alternative contains a '. . .' wildcard";
  }
  return undefined;
}

function answerKind(raw: string, context: AnswerContext): AnswerKind {
  if (context.open) return "open";
  if (context.hasUnderline) return "ok-or-fix";
  if (/[.?!]$/.test(raw)) return "sentence";
  return "blanks";
}

function parseAlternatives(part: string): string[] {
  const alternatives = part
    .split(ALTERNATIVE_SEPARATOR)
    .map((alternative) => alternative.trim())
    .filter((alternative) => alternative.length > 0)
    .flatMap(expandFullForm);
  return [...new Set(alternatives)];
}

function expandFullForm(alternative: string): string[] {
  const match = FULL_FORM.exec(alternative);
  const [, short, full] = match ?? [];
  if (!short || !full || !CONTRACTION.test(short)) return [alternative];
  return [short, ...expandSlashedWord(full)];
}

/** "She did not have/eat" → ["She did not have", "She did not eat"]. */
function expandSlashedWord(text: string): string[] {
  const words = text.split(" ");
  const index = words.findIndex((word) => word.includes("/"));
  const slashed = words[index];
  if (slashed === undefined) return [text];
  return slashed
    .split("/")
    .map((option) => [...words.slice(0, index), option, ...words.slice(index + 1)].join(" "));
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
