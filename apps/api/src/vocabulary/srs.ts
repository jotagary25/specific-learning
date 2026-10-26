// Pure FSRS scheduling around ts-fsrs. The card state is stored as JSON in `srs_card.state`
// (`null` = new card); suspension has its own `srs_card.suspended` column.
import type { CardPhase, SrsRating } from "@english-course/shared";
import { type Card, createEmptyCard, fsrs, type Grade, State } from "ts-fsrs";
import { z } from "zod";

/** ts-fsrs `Card` with ISO dates, as persisted in jsonb. */
const ScheduledFields = z.object({
  due: z.iso.datetime({ offset: true }),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: z.number().int(),
  lapses: z.number().int(),
  state: z.enum(State),
  last_review: z.iso.datetime({ offset: true }).optional(),
});
type ScheduledFields = z.infer<typeof ScheduledFields>;

/** In-memory state: `{}` = new, never reviewed; otherwise the FSRS card fields. */
export type SrsState = Partial<ScheduledFields>;

const scheduler = fsrs({ enable_fuzz: true });

/** Intervals of at least this many days count as "mature" (Anki's convention). */
export const MATURE_DAYS = 21;

/**
 * Lenient read of the stored jsonb: `null`, the legacy `{}` placeholder and unknown or partial
 * shapes become a new card; a legacy `suspended` key inside the state is ignored.
 */
export function parseState(value: unknown): SrsState {
  const scheduled = ScheduledFields.safeParse(value);
  return scheduled.success ? scheduled.data : {};
}

/** What `srs_card.state` stores: `null` for a new card, else the FSRS fields. */
export function storedState(state: SrsState): SrsState | null {
  return isNew(state) ? null : state;
}

export const isNew = (state: SrsState): boolean => state.state === undefined;

export function phaseOf(state: SrsState): CardPhase {
  switch (state.state) {
    case undefined:
    case State.New:
      return "new";
    case State.Learning:
      return "learning";
    case State.Review:
      return "review";
    default:
      return "relearning";
  }
}

export const isMature = (state: SrsState): boolean =>
  state.state === State.Review && (state.scheduled_days ?? 0) >= MATURE_DAYS;

function serialize(card: Card): ScheduledFields {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    ...(card.last_review ? { last_review: card.last_review.toISOString() } : {}),
  };
}

function toCard(state: SrsState, now: Date): Card {
  const scheduled = ScheduledFields.safeParse(state);
  if (!scheduled.success || scheduled.data.state === State.New) return createEmptyCard(now);
  const { due, last_review, ...rest } = scheduled.data;
  return {
    ...rest,
    due: new Date(due),
    ...(last_review ? { last_review: new Date(last_review) } : {}),
  };
}

/** A card that has never been reviewed: empty state, due now. */
export function scheduleNew(now: Date): { state: SrsState; due: Date } {
  return { state: {}, due: now };
}

/** Applies one rating; returns the next state and its due date. */
export function review(
  state: SrsState,
  rating: SrsRating,
  now: Date,
): { state: SrsState; due: Date } {
  const { card } = scheduler.next(toCard(state, now), now, rating as Grade);
  return { state: serialize(card), due: card.due };
}
