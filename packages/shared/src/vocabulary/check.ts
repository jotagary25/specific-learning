import { checkBlank } from "../units/check-blank.ts";
import { normalize } from "../units/normalize.ts";
import type { SrsRating } from "./api.ts";

/** Pure checks for typed SRS answers; the web uses them for instant feedback. */

export type TypedVerdict = "correct" | "almost" | "incorrect";

/** Same normalization and "almost" rules as unit exercises (case, spacing, contractions, typos). */
export function checkTypedAnswer(input: string, accepted: readonly string[]): TypedVerdict {
  return checkBlank(input, accepted).verdict;
}

/** Suggested rating for a typed answer: correct → Good, almost → Hard, incorrect → Again. */
export function ratingForVerdict(verdict: TypedVerdict): SrsRating {
  return verdict === "correct" ? 3 : verdict === "almost" ? 2 : 1;
}

export const CLOZE_GAP = "_____";

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Blanks the first whole-word occurrence of `word` in `sentence` (case-insensitive).
 * Returns the cloze and the surface form found, or `null` when the word is not there as is
 * (e.g. the sentence has an inflected form).
 */
export function blankWord(
  sentence: string,
  word: string,
): { cloze: string; surface: string } | null {
  const target = word.trim();
  if (!target) return null;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(target)}(?![\\p{L}\\p{N}])`, "iu");
  const match = pattern.exec(sentence);
  if (!match) return null;
  return {
    cloze: `${sentence.slice(0, match.index)}${CLOZE_GAP}${sentence.slice(match.index + match[0].length)}`,
    surface: match[0],
  };
}

export type DiffToken = { text: string; kind: "same" | "added" | "removed" };

/**
 * Word-level diff from the learner's answer to the expected sentence (LCS on normalized words).
 * `removed` = only in the answer, `added` = only in the expected text; `same` uses the expected
 * spelling.
 */
export function wordDiff(answer: string, expected: string): DiffToken[] {
  const a = answer.trim().split(/\s+/).filter(Boolean);
  const b = expected.trim().split(/\s+/).filter(Boolean);
  const key = (w: string) => normalize(w).replace(/^[("'“]+|[)"'”]+$/g, "");
  const ka = a.map(key);
  const kb = b.map(key);

  // lcs[i][j] = LCS length of a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  const at = (i: number, j: number) => lcs[i]?.[j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      (lcs[i] as number[])[j] =
        ka[i] === kb[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ka[i] === kb[j]) {
      tokens.push({ text: b[j] ?? "", kind: "same" });
      i++;
      j++;
    } else if (i < a.length && (j >= b.length || at(i + 1, j) >= at(i, j + 1))) {
      tokens.push({ text: a[i] ?? "", kind: "removed" });
      i++;
    } else {
      tokens.push({ text: b[j] ?? "", kind: "added" });
      j++;
    }
  }
  return tokens;
}
