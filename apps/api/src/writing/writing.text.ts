/** Sentence helpers that turn writing errors into own-error SRS cards. */

const SENTENCE = /[^.!?\n]+(?:[.!?]+["')\]]*|$)/g;

export function splitSentences(text: string): string[] {
  return (text.match(SENTENCE) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** The sentence of `text` that contains `span` (first occurrence), or `null`. */
export function sentenceAround(text: string, span: string): string | null {
  const at = span ? text.indexOf(span) : -1;
  if (at === -1) return null;
  for (const match of text.matchAll(SENTENCE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (at >= start && at < end) {
      return (
        text
          .slice(start, Math.max(end, at + span.length))
          .trim()
          .replace(/\s+/g, " ") || null
      );
    }
  }
  return null;
}

const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);

/**
 * The sentence of the revised text that best matches `original` (word overlap, Jaccard ≥ 0.3):
 * the learner's own corrected version of the sentence that had the error.
 */
export function correspondingSentence(revisedText: string, original: string): string | null {
  const target = words(original);
  let best: { sentence: string; score: number } | null = null;
  for (const sentence of splitSentences(revisedText)) {
    const candidate = words(sentence);
    const shared = [...candidate].filter((word) => target.has(word)).length;
    const union = new Set([...candidate, ...target]).size;
    const score = union ? shared / union : 0;
    if (!best || score > best.score) best = { sentence, score };
  }
  return best && best.score >= 0.3 ? best.sentence.replace(/\s+/g, " ") : null;
}
