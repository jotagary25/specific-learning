import type {
  AttemptResponse,
  GrammarSpan,
  ItemCheckResult,
  UnitDetail,
  UnitStep,
} from "@english-course/shared";

/** Steps of the guided unit flow, in order, limited to the ones this unit has content for. */
export function stepsFor(unit: UnitDetail): UnitStep[] {
  const steps: UnitStep[] = [];
  if (unit.story) steps.push("story");
  if (unit.extras) steps.push("puzzle");
  steps.push("theory");
  if (unit.timeline.length > 0) steps.push("timeline");
  steps.push("exercises");
  return steps;
}

export const STEP_LABELS: Record<UnitStep, string> = {
  story: "Story",
  puzzle: "Puzzle",
  theory: "Theory",
  timeline: "Timeline",
  exercises: "Exercises",
};

/** Merges an attempt answer into the cached unit, so progress updates without a refetch. */
export function applyAttempt(
  unit: UnitDetail,
  response: AttemptResponse,
  inputs: string[],
): UnitDetail {
  const latest = { inputs, result: response.result, method: response.method };
  const others = unit.progress.items.filter((item) => item.itemId !== response.itemId);
  const status =
    response.unitCompleted || unit.progress.status === "completed" ? "completed" : "in-progress";
  return {
    ...unit,
    progress: {
      ...unit.progress,
      status,
      completedAt:
        unit.progress.completedAt ?? (response.unitCompleted ? new Date().toISOString() : null),
      completion: response.completion,
      items: [...others, { itemId: response.itemId, attempts: response.attemptNo, latest }],
    },
  };
}

export type Verdict = "correct" | "almost" | "incorrect" | "needs-ai";

/** One visual verdict per item: "almost" when accepted with a slip. */
export function verdictOf(result: ItemCheckResult): Verdict {
  if (result.status === "needs-ai") return "needs-ai";
  if (result.status === "correct") {
    return result.blanks.some((blank) => blank.verdict === "almost") ? "almost" : "correct";
  }
  return "incorrect";
}

export type Piece = { text: string; span?: GrammarSpan };

/**
 * Splits a chapter body into paragraphs of text pieces, marking the first occurrence of each
 * grammar span (spans that overlap an earlier one are skipped).
 */
export function highlightBody(body: string, spans: readonly GrammarSpan[]): Piece[][] {
  const found = spans
    .map((span) => ({ span, index: body.indexOf(span.text) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index);

  const pieces: Piece[] = [];
  let cursor = 0;
  for (const { span, index } of found) {
    if (index < cursor) continue;
    if (index > cursor) pieces.push({ text: body.slice(cursor, index) });
    pieces.push({ text: span.text, span });
    cursor = index + span.text.length;
  }
  if (cursor < body.length) pieces.push({ text: body.slice(cursor) });

  // Paragraph breaks only occur in plain text pieces (spans never cross paragraphs).
  const paragraphs: Piece[][] = [[]];
  for (const piece of pieces) {
    if (piece.span) {
      paragraphs.at(-1)?.push(piece);
      continue;
    }
    piece.text.split(/\n\n+/).forEach((part, i) => {
      if (i > 0) paragraphs.push([]);
      if (part) paragraphs.at(-1)?.push({ text: part });
    });
  }
  return paragraphs.filter((paragraph) => paragraph.length > 0);
}
