/**
 * Text normalization for answer checking. Pure and deterministic.
 *
 * Two layers:
 * - `normalize`: surface cleanup (case, whitespace, quotes, trailing punctuation).
 * - `canonicalize`: `normalize` plus a generic contraction expansion. This is the
 *   fallback used when the key does not list the full form itself; the key's own
 *   alternatives are always tried first by the checker.
 */

const APOSTROPHES = /[‘’ʼ`´]/g;
const QUOTES = /[“”„«»]/g;
const TRAILING_PUNCTUATION = /[\s.!?,;:…]+$/;

export function normalize(text: string): string {
  return text
    .replace(APOSTROPHES, "'")
    .replace(QUOTES, '"')
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(TRAILING_PUNCTUATION, "");
}

const NEGATION_BASES: Record<string, string> = { ca: "can", wo: "will", sha: "shall" };
const SIMPLE_CONTRACTIONS: Record<string, string> = {
  "'m": "am",
  "'re": "are",
  "'ve": "have",
  "'ll": "will",
};
/** Words after which 's is a contraction of is/has rather than a possessive. */
const S_CONTRACTION_HOSTS = new Set([
  "",
  "he",
  "she",
  "it",
  "that",
  "this",
  "there",
  "here",
  "what",
  "who",
  "where",
  "when",
  "why",
  "how",
  "which",
]);
const HAS_MARKERS = new Set(["been", "got", "gotten", "gone", "had"]);
const HAD_MARKERS = new Set(["been", "better", "got", "gotten", "gone", "had"]);

/** Expands one contracted word; `next` is the following word (used for 's and 'd). */
function expandWord(word: string, next: string): string {
  if (word === "cannot") return "can not";
  if (word === "let's") return "let us";
  if (word.endsWith("n't")) {
    const base = word.slice(0, -3);
    return `${NEGATION_BASES[base] ?? base} not`;
  }
  const match = /^(.*?)('m|'re|'ve|'ll|'s|'d)$/.exec(word);
  if (!match) return word;
  const host = match[1] ?? "";
  const suffix = match[2] ?? "";
  const full = SIMPLE_CONTRACTIONS[suffix] ?? fullFormOfAmbiguous(suffix, host, next);
  if (full === undefined) return word;
  return host ? `${host} ${full}` : full;
}

// 's = is/has and 'd = would/had are ambiguous; the following word decides.
function fullFormOfAmbiguous(suffix: string, host: string, next: string): string | undefined {
  if (suffix === "'s") {
    if (!S_CONTRACTION_HOSTS.has(host)) return undefined;
    return HAS_MARKERS.has(next) ? "has" : "is";
  }
  return HAD_MARKERS.has(next) || next.endsWith("ed") ? "had" : "would";
}

export function canonicalize(text: string): string {
  const words = normalize(text).split(" ");
  return words
    .map((word, index) => expandWord(word, words[index + 1] ?? ""))
    .join(" ")
    .trim();
}

/** "took her (about) half an hour" → with and without each parenthesized group. */
export function expandOptionalWords(text: string): string[] {
  const match = /\(([^()]*)\)/.exec(text);
  if (!match) return [text.replace(/\s+/g, " ").trim()];
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  return [
    ...expandOptionalWords(`${before}${match[1]}${after}`),
    ...expandOptionalWords(`${before} ${after}`),
  ];
}
