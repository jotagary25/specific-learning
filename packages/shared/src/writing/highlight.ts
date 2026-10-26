/** Splits a learner text into plain and error-marked segments for highlighting. */

export type HighlightSegment = { text: string; errorId: string | null };

export type HighlightResult = {
  segments: HighlightSegment[];
  /** Errors whose span is not (or no longer) an exact substring of the text. */
  missing: string[];
};

/**
 * Marks each error's exact `span` in `text`. Spans are matched case-sensitively, on the first
 * occurrence that does not overlap an earlier match (input order wins); a span that cannot be
 * placed is reported in `missing` so the UI can still list its hint.
 */
export function highlightSpans(
  text: string,
  errors: ReadonlyArray<{ id: string; span: string }>,
): HighlightResult {
  const taken: Array<{ start: number; end: number; id: string }> = [];
  const missing: string[] = [];
  const overlaps = (start: number, end: number) =>
    taken.some((range) => start < range.end && range.start < end);

  for (const error of errors) {
    if (!error.span.trim()) {
      missing.push(error.id);
      continue;
    }
    let from = 0;
    let placed = false;
    while (from <= text.length) {
      const start = text.indexOf(error.span, from);
      if (start === -1) break;
      const end = start + error.span.length;
      if (!overlaps(start, end)) {
        taken.push({ start, end, id: error.id });
        placed = true;
        break;
      }
      from = start + 1;
    }
    if (!placed) missing.push(error.id);
  }

  taken.sort((a, b) => a.start - b.start);
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const range of taken) {
    if (range.start > cursor)
      segments.push({ text: text.slice(cursor, range.start), errorId: null });
    segments.push({ text: text.slice(range.start, range.end), errorId: range.id });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), errorId: null });
  return { segments, missing };
}
