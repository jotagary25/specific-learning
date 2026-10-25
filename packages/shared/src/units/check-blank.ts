import { damerauLevenshtein } from "./distance.ts";
import { canonicalize, expandOptionalWords, normalize } from "./normalize.ts";
import type { BlankResult } from "./schemas.ts";

/**
 * Checks one blank against its key alternatives, in this order:
 * 1. key-driven: normalized input equals a normalized alternative
 *    (optional "(word)" groups expanded with and without the word);
 * 2. generic fallback: equal after the contraction table (I'm = I am, don't = do not…);
 * 3. wildcard: " . . . " inside an alternative matches any text;
 * 4. "almost" (see `isAlmost`); otherwise "incorrect".
 */
export function checkBlank(input: string, alternatives: readonly string[]): BlankResult {
  if (normalize(input) === "") return { verdict: "incorrect" };
  const candidates = alternatives.flatMap((alternative) =>
    isWildcard(alternative)
      ? []
      : expandOptionalWords(alternative).map((variant) => ({ alternative, variant })),
  );

  const exact = candidates.find(({ variant }) => normalize(variant) === normalize(input));
  if (exact) return { verdict: "correct", matched: exact.alternative };

  const canonicalInput = canonicalize(input);
  const generic = candidates.find(({ variant }) => canonicalize(variant) === canonicalInput);
  if (generic) return { verdict: "correct", matched: generic.alternative };

  const wildcard = alternatives.find(
    (alternative) => isWildcard(alternative) && wildcardPattern(alternative).test(canonicalInput),
  );
  if (wildcard) return { verdict: "correct", matched: wildcard };

  const near = candidates.find(({ variant }) => isAlmost(input, variant));
  if (near) return { verdict: "almost", matched: near.alternative };

  return { verdict: "incorrect" };
}

const WILDCARD = /\.\s*\.\s*\./;

function isWildcard(alternative: string): boolean {
  return WILDCARD.test(alternative);
}

function wildcardPattern(alternative: string): RegExp {
  const parts = alternative.split(WILDCARD).map((part) => escapeRegExp(canonicalize(part)));
  return new RegExp(`^${parts.join(".*")}$`);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * "Almost" = the learner knew the grammar but slipped while typing. Two rules:
 * - Apostrophe slip: input and key differ only by apostrophes ("dont", "is'nt"),
 *   unless the apostrophe-less word is a different word ("were" vs "we're").
 * - Typo: Damerau-Levenshtein distance 1 on the canonical forms, for keys of at
 *   least 5 characters, and the edit must not change the grammar form (`changesForm`).
 */
export function isAlmost(input: string, expected: string): boolean {
  return isApostropheSlip(normalize(input), normalize(expected)) || isTypo(input, expected);
}

/** Apostrophe-less spellings that are real, different words. */
const APOSTROPHE_CONFUSABLES = new Set([
  "were",
  "well",
  "hell",
  "shell",
  "wed",
  "ill",
  "its",
  "lets",
]);

function isApostropheSlip(input: string, expected: string): boolean {
  const strip = (text: string) => text.replaceAll("'", "");
  if (input === expected || strip(input) !== strip(expected)) return false;
  return !strip(input)
    .split(" ")
    .some((word) => APOSTROPHE_CONFUSABLES.has(word));
}

const MIN_TYPO_LENGTH = 5;

function isTypo(input: string, expected: string): boolean {
  const a = canonicalize(input);
  const b = canonicalize(expected);
  if (b.length < MIN_TYPO_LENGTH || damerauLevenshtein(a, b) !== 1) return false;

  const wordsA = a.split(" ");
  const wordsB = b.split(" ");
  // A missing or extra space ("islosing") is a typo.
  if (wordsA.length !== wordsB.length) return a.replaceAll(" ", "") === b.replaceAll(" ", "");

  const differing = wordsA.flatMap((word, i) =>
    word === wordsB[i] ? [] : [[word, wordsB[i] ?? ""]],
  );
  const [pair] = differing;
  return differing.length === 1 && pair !== undefined && !changesForm(pair[0] ?? "", pair[1] ?? "");
}

/** Closed-class words: a one-letter change here is a different word (was/has, in/on). */
const FUNCTION_WORDS = new Set(
  (
    "am is are was were be been being do does did has have had will would shall should can " +
    "could may might must not no a an the i you he she it we they me him her us them my your " +
    "his its our their this that these those there here to of in on at for with by from and " +
    "or but what who where when why how which whose"
  ).split(" "),
);
const VOWELS = new Set([..."aeiou"]);
const INFLECTION_LETTERS = new Set(["s", "d"]);

/**
 * True when a one-edit difference is likely a different grammar form, not a typo:
 * - either word is a function word (is/as, was/has);
 * - the edit is at the word end and involves -s/-d (open/opens, live/lived, rises/rised);
 * - one vowel replaces another (threw/throw, began/begun: irregular forms).
 */
function changesForm(a: string, b: string): boolean {
  if (FUNCTION_WORDS.has(a) || FUNCTION_WORDS.has(b)) return true;
  if (a.length !== b.length) {
    const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
    return longer.startsWith(shorter) && INFLECTION_LETTERS.has(longer.at(-1) ?? "");
  }
  const position = [...a].findIndex((char, i) => char !== b[i]);
  const charA = a[position] ?? "";
  const charB = b[position] ?? "";
  const atEnd = position === a.length - 1;
  if (atEnd && (INFLECTION_LETTERS.has(charA) || INFLECTION_LETTERS.has(charB))) {
    return true;
  }
  return VOWELS.has(charA) && VOWELS.has(charB);
}
