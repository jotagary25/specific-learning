// Pure card presentation: how a stored card is asked, by source and maturity.
import { blankWord, type CardView, type QueueCard, type Segment } from "@english-course/shared";
import { phaseOf } from "./srs.ts";
import type { CardRecord, MissedItem, NewCard } from "./vocabulary.store.ts";

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const firstLine = (text: string) => text.split("\n")[0]?.trim() ?? "";

const dateOnly = (value: string | Date) =>
  (typeof value === "string" ? value : value.toISOString()).slice(0, 10);

/** Spanish gloss of a reading word card: the back starts with "glossEs (pos) — definition". */
export function glossOfWordBack(back: string): string | null {
  const line = firstLine(back);
  const gloss = line.split(/ \(|\s—\s/)[0]?.trim();
  return gloss || null;
}

function presentWord(card: CardRecord): QueueCard {
  const word = str(card.ref.word) ?? firstLine(card.front);
  const sentence = str(card.ref.sentence) ?? card.front.split("\n").slice(1).join(" ").trim();
  const phase = phaseOf(card.state);
  const base = {
    id: card.id,
    source: card.source,
    phase,
    back: card.back,
    context: str(card.ref.articleTitle),
  };
  // New and learning cards are recognized first; review-phase cards are produced (cloze).
  const cloze = phase === "review" && sentence ? blankWord(sentence, word) : null;
  if (cloze) {
    return {
      ...base,
      direction: "production",
      task: "Type the missing word",
      prompt: cloze.cloze,
      highlight: null,
      hintEs: glossOfWordBack(card.back),
      answers: [cloze.surface],
    };
  }
  return {
    ...base,
    direction: "recognition",
    task: "What does the word mean here?",
    prompt: sentence || word,
    highlight: blankWord(sentence, word)?.surface ?? word,
    hintEs: null,
    answers: null,
  };
}

function presentOwnError(card: CardRecord): QueueCard {
  const written = str(card.ref.writtenAt) ?? card.createdAt.toISOString();
  return {
    id: card.id,
    source: card.source,
    phase: phaseOf(card.state),
    direction: "fix",
    task: "Fix the sentence",
    prompt: str(card.ref.original) ?? card.front,
    highlight: null,
    hintEs: str(card.ref.hintEs),
    answers: [str(card.ref.corrected) ?? firstLine(card.back)],
    back: card.back,
    context: `Written on ${dateOnly(written)}`,
  };
}

function presentUnitItem(card: CardRecord): QueueCard {
  const blanks = Array.isArray(card.ref.blanks) ? (card.ref.blanks as unknown[]) : [];
  const single = blanks.length === 1 && Array.isArray(blanks[0]) ? (blanks[0] as unknown[]) : null;
  const answers = single?.filter((a): a is string => typeof a === "string") ?? [];
  const unitId = card.ref.unitId;
  return {
    id: card.id,
    source: card.source,
    phase: phaseOf(card.state),
    direction: answers.length > 0 ? "production" : "recognition",
    task: str(card.ref.instruction) ?? "Complete the sentence",
    prompt: card.front,
    highlight: null,
    hintEs: null,
    answers: answers.length > 0 ? answers : null,
    back: card.back,
    context: typeof unitId === "number" ? `Unit ${unitId}` : null,
  };
}

export function presentCard(card: CardRecord): QueueCard {
  switch (card.source) {
    case "word":
      return presentWord(card);
    case "own_error":
      return presentOwnError(card);
    default:
      return presentUnitItem(card);
  }
}

export function cardView(card: CardRecord): CardView {
  return {
    id: card.id,
    source: card.source,
    front: card.front,
    back: card.back,
    phase: phaseOf(card.state),
    due: card.due.toISOString(),
    suspended: card.suspended,
    reps: card.state.reps ?? 0,
    lapses: card.state.lapses ?? 0,
    createdAt: card.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------
// Card builders for other features
// ---------------------------------------------------------------------------------------------

/** Exercise lines as plain text with "_____" for each blank. */
export function renderLines(lines: Segment[][]): string {
  return lines
    .map((line) =>
      line
        .map((segment) => (segment.type === "blank" ? "_____" : segment.text))
        .join(" ")
        .replace(/\s+([.,;:!?])/g, "$1")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

/** A missed exercise item as a card; `null` for examples, open items and items without a key. */
export function unitItemCard(item: MissedItem, now: Date): NewCard | null {
  if (item.isExample || !item.answer || item.answer.kind === "open") return null;
  return {
    source: "unit_item",
    front: renderLines(item.lines),
    back: item.answer.raw,
    ref: {
      itemId: item.itemId,
      unitId: item.unitId,
      instruction: item.instruction,
      blanks: item.answer.blanks,
    },
    state: {},
    due: now,
  };
}

/** What the writing feature (T12) passes for one of the learner's errors. */
export type OwnErrorInput = {
  /** The learner's sentence, with the error. */
  original: string;
  corrected: string;
  hintEs?: string;
  rule?: string;
  unitId?: number;
  /** When the learner wrote it (ISO); defaults to now. */
  writtenAt?: string;
  writingId?: string;
};

export function ownErrorCard(input: OwnErrorInput, now: Date): NewCard {
  const back = [input.corrected, input.hintEs, input.rule].filter(Boolean).join("\n");
  return {
    source: "own_error",
    front: input.original,
    back,
    ref: {
      original: input.original,
      corrected: input.corrected,
      ...(input.hintEs ? { hintEs: input.hintEs } : {}),
      ...(input.rule ? { rule: input.rule } : {}),
      ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
      ...(input.writingId ? { writingId: input.writingId } : {}),
      writtenAt: input.writtenAt ?? now.toISOString(),
    },
    state: {},
    due: now,
  };
}
