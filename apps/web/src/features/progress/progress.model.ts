import type { MirrorWordStatus, ScoreDimension } from "@english-course/shared";

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM of `date` in local time. */
export const monthOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

export const isMonthKey = (value: string | undefined): value is string =>
  value !== undefined && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** Shifts a YYYY-MM month by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return monthOf(new Date(y ?? 1970, (m ?? 1) - 1 + delta, 1));
}

/** e.g. "October 2026". */
export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Local date of a YYYY-MM-DD day or an ISO instant, e.g. "Oct 19". */
export function shortDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8)))
    : new Date(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "45 min", "1 h 15 min". */
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "+12", "−3", "±0" (true minus sign for screen readers and typography). */
export function signed(change: number): string {
  if (change > 0) return `+${change}`;
  if (change < 0) return `−${Math.abs(change)}`;
  return "±0";
}

export const DIMENSION_LABELS: Record<ScoreDimension | "overall", string> = {
  grammar: "Grammar",
  clarity: "Clarity",
  vocabulary: "Vocabulary",
  naturalness: "Naturalness",
  overall: "Overall",
};

/** "third_person_s" → "Third person s". */
export function errorTypeLabel(type: string): string {
  const words = type.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : type;
}

export const WORD_STATUS_LABELS: Record<MirrorWordStatus, string> = {
  mature: "known now",
  learning: "still learning",
  new: "saved, not reviewed yet",
  not_saved: "looked up, not saved",
};

export type TextSegment = { text: string; status: MirrorWordStatus | null };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Splits `text` so every listed word (case-insensitive, whole word) is its own segment. */
export function highlightSegments(
  text: string,
  words: readonly { word: string; status: MirrorWordStatus }[],
): TextSegment[] {
  const usable = words.filter((w) => w.word.trim());
  if (usable.length === 0) return text ? [{ text, status: null }] : [];
  const statusOf = new Map(usable.map((w) => [w.word.toLowerCase(), w.status]));
  const alternatives = [...statusOf.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const pattern = new RegExp(`(?<![\\p{L}'’])(${alternatives})(?![\\p{L}'’])`, "giu");
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: text.slice(last, index), status: null });
    segments.push({ text: match[0], status: statusOf.get(match[0].toLowerCase()) ?? null });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), status: null });
  return segments;
}
