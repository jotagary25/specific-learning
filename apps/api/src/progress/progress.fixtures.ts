// Fixture builders shared by the Progress tests.

import type {
  ErrorRecord,
  EventRecord,
  ReadingRecord,
  SubmissionRecord,
  UnitRecord,
  WordCardRecord,
} from "./progress.store.ts";

/** UTC date (month is 1-based); the tests read days in UTC unless they pass another zone. */
export const at = (y: number, m: number, d: number, h = 9) => new Date(Date.UTC(y, m - 1, d, h));

const fsrs = (state: number, scheduledDays: number) => ({
  due: new Date(Date.UTC(2026, 11, 1)).toISOString(),
  stability: scheduledDays,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: scheduledDays,
  learning_steps: 0,
  reps: 4,
  lapses: 0,
  state,
});

/** FSRS states as stored in `srs_card.state`. */
export const STATES = {
  new: {},
  learning: fsrs(1, 0),
  young: fsrs(2, 6),
  mature: fsrs(2, 30),
} as const;

export const card = (
  word: string,
  state: keyof typeof STATES,
  articleId: string | null = null,
): WordCardRecord => ({ word, articleId, state: STATES[state] });

export const event = (
  type: string,
  createdAt: Date,
  payload: Record<string, unknown> = {},
): EventRecord => ({ type, payload, createdAt });

export const unitRecord = (id: number, over: Partial<UnitRecord> = {}): UnitRecord => ({
  id,
  title: `Unit title ${id}`,
  status: "new",
  completedAt: null,
  canDo: [],
  ...over,
});

let submissionSeq = 0;
export function submission(
  createdAt: Date,
  scores: SubmissionRecord["scores"],
  over: Partial<SubmissionRecord> = {},
): SubmissionRecord {
  submissionSeq += 1;
  return {
    id: `s${submissionSeq}`,
    missionId: "m1",
    title: `Post ${submissionSeq}`,
    format: "tweet",
    text: `Text ${submissionSeq}`,
    scores,
    createdAt,
    ...over,
  };
}

export const scores = (grammar: number, clarity = 70, vocabulary = 70, naturalness = 70) => ({
  grammar,
  clarity,
  vocabulary,
  naturalness,
});

export const writingError = (
  s: SubmissionRecord,
  type: string,
  unitId: number | null = null,
): ErrorRecord => ({ submissionId: s.id, type, unitId, createdAt: s.createdAt });

export const reading = (
  articleId: string,
  startedAt: Date,
  glossed: string[] = [],
  over: Partial<ReadingRecord> = {},
): ReadingRecord => ({
  articleId,
  title: `Article ${articleId}`,
  startedAt,
  completedAt: startedAt,
  glossed,
  ...over,
});
