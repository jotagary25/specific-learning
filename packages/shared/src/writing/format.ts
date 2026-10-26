import type { MissionFormat } from "../ai/schemas.ts";
import { countWords } from "../reading/text.ts";

/**
 * Writing formats and level progression (spec §3.6).
 *
 * Levels 1–4 map to tweet → thread → linkedin → article. The level is stored in the
 * `writing.level` setting. Progression rule: the learner moves to the next level when the
 * latest {@link ADVANCE_AFTER} completed missions in the current format have an average
 * overall score of at least {@link ADVANCE_MIN_AVERAGE}. The overall score of a mission is the
 * rounded mean of the four first-review scores (grammar, clarity, vocabulary, naturalness).
 */

export const WRITING_FORMATS = ["tweet", "thread", "linkedin", "article"] as const;
export const MAX_WRITING_LEVEL = WRITING_FORMATS.length;
export const ADVANCE_AFTER = 3;
export const ADVANCE_MIN_AVERAGE = 75;

export type FormatLimits = { minWords: number; maxWords: number; maxChars: number | null };

/** Default length limits per format; AI missions may narrow them. */
export const FORMAT_LIMITS: Record<MissionFormat, FormatLimits> = {
  tweet: { minWords: 15, maxWords: 50, maxChars: 280 },
  thread: { minWords: 80, maxWords: 180, maxChars: null },
  linkedin: { minWords: 120, maxWords: 250, maxChars: null },
  article: { minWords: 300, maxWords: 600, maxChars: null },
};

export const FORMAT_LABELS: Record<MissionFormat, string> = {
  tweet: "X post",
  thread: "Thread",
  linkedin: "LinkedIn post",
  article: "Short article",
};

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(MAX_WRITING_LEVEL, Math.max(1, Math.trunc(level)));
}

export function formatForLevel(level: number): MissionFormat {
  return WRITING_FORMATS[clampLevel(level) - 1] ?? "tweet";
}

export type LengthStatus = {
  words: number;
  chars: number;
  state: "short" | "ok" | "long";
};

export function lengthStatus(text: string, limits: FormatLimits): LengthStatus {
  const words = countWords(text);
  const chars = text.trim().length;
  const tooLong = words > limits.maxWords || (limits.maxChars !== null && chars > limits.maxChars);
  return { words, chars, state: tooLong ? "long" : words < limits.minWords ? "short" : "ok" };
}

export type WritingScores = {
  grammar: number;
  clarity: number;
  vocabulary: number;
  naturalness: number;
};

export function overallScore(scores: WritingScores): number {
  return Math.round((scores.grammar + scores.clarity + scores.vocabulary + scores.naturalness) / 4);
}

export type LevelProgress = {
  level: number;
  /** Completed missions counted toward the rule (at most {@link ADVANCE_AFTER}). */
  completed: number;
  needed: number;
  /** Average of the counted scores; `null` before the first completed mission. */
  average: number | null;
  advance: boolean;
};

/** `scoresNewestFirst`: overall scores of completed missions in the current format. */
export function levelProgress(level: number, scoresNewestFirst: readonly number[]): LevelProgress {
  const counted = scoresNewestFirst.slice(0, ADVANCE_AFTER);
  const average = counted.length
    ? Math.round(counted.reduce((sum, score) => sum + score, 0) / counted.length)
    : null;
  const current = clampLevel(level);
  return {
    level: current,
    completed: counted.length,
    needed: ADVANCE_AFTER,
    average,
    advance:
      current < MAX_WRITING_LEVEL &&
      counted.length === ADVANCE_AFTER &&
      average !== null &&
      average >= ADVANCE_MIN_AVERAGE,
  };
}
