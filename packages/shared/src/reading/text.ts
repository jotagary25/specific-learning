/** Pure text helpers of the Reading feature, shared by api (checks) and web (rendering). */

/** Words in a text: runs of letters/digits, with inner apostrophes and hyphens. */
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export type TextRange = { start: number; end: number };

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * Where a quote sits in the text. Tries an exact match first, then a whitespace- and
 * case-insensitive one (models sometimes normalize spaces or quotes' casing).
 */
export function findQuote(text: string, quote: string): TextRange | null {
  const wanted = quote.trim();
  if (!wanted) return null;
  const exact = text.indexOf(wanted);
  if (exact >= 0) return { start: exact, end: exact + wanted.length };

  const pattern = collapse(wanted)
    .split(" ")
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern, "i").exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

function occurrences(text: string, needle: string): TextRange[] {
  const found: TextRange[] = [];
  let from = 0;
  for (;;) {
    const index = text.indexOf(needle, from);
    if (index < 0) return found;
    found.push({ start: index, end: index + needle.length });
    from = index + 1;
  }
}

const overlap = (a: TextRange, b: TextRange) =>
  Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

/** Minimum share of the learner's selection that must fall inside an annotated span. */
export const SPOT_MIN_OVERLAP = 0.5;

/**
 * Grammar hunt check: does the learner's selection overlap one of the annotated spans?
 * At least half of the selection must fall inside the span, so a lone "the" next to it does not
 * count. Without an offset every occurrence of the selected text is considered.
 * Returns the index of the matched quote, or null.
 */
export function matchSpot(
  text: string,
  selection: { text: string; start?: number },
  quotes: readonly string[],
): number | null {
  const selected = selection.text.trim();
  if (selected.length < 2) return null;

  const leading = selection.text.indexOf(selected);
  const atOffset =
    selection.start !== undefined &&
    text.slice(selection.start + leading, selection.start + leading + selected.length) === selected
      ? [{ start: selection.start + leading, end: selection.start + leading + selected.length }]
      : null;
  const ranges = atOffset ?? occurrences(text, selected);
  if (ranges.length === 0) {
    const loose = findQuote(text, selected);
    if (loose) ranges.push(loose);
  }

  for (const [index, quote] of quotes.entries()) {
    const span = findQuote(text, quote);
    if (!span) continue;
    if (
      ranges.some((range) => overlap(range, span) >= (range.end - range.start) * SPOT_MIN_OVERLAP)
    ) {
      return index;
    }
  }
  return null;
}

/** The sentence around a character offset of a paragraph (for on-demand glosses). */
export function sentenceAt(paragraph: string, offset: number): string {
  const boundary = /[.!?]["'”’)]?\s+/g;
  let start = 0;
  let end = paragraph.length;
  for (const match of paragraph.matchAll(boundary)) {
    const after = match.index + match[0].length;
    if (after <= offset) start = after;
    else {
      end = match.index + match[0].trimEnd().length;
      break;
    }
  }
  return paragraph.slice(start, end).trim();
}

/** Paragraphs of a stored article text (blank-line separated). */
export const paragraphsOf = (text: string): string[] =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
