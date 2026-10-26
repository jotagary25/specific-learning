import { z } from "zod";

/** HTTP contracts of the Vocabulary + SRS feature (`/api/vocabulary`), shared by api and web. */

export const CardSource = z.enum(["word", "own_error", "unit_item"]);
export type CardSource = z.infer<typeof CardSource>;

/** FSRS rating: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export const SrsRating = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type SrsRating = z.infer<typeof SrsRating>;

export const RATING_LABELS: Record<SrsRating, string> = {
  1: "Again",
  2: "Hard",
  3: "Good",
  4: "Easy",
};

/** Where a card is in FSRS terms; `new` = never reviewed. */
export const CardPhase = z.enum(["new", "learning", "review", "relearning"]);
export type CardPhase = z.infer<typeof CardPhase>;

/**
 * How the card is asked:
 * - `recognition`: show the prompt, reveal the back, self-rate;
 * - `production`: type the answer (cloze), auto-checked;
 * - `fix`: type the corrected sentence (own errors), auto-checked, diff + self-rate when not exact.
 */
export const CardDirection = z.enum(["recognition", "production", "fix"]);
export type CardDirection = z.infer<typeof CardDirection>;

/** One card as the review session shows it. */
export const QueueCard = z.object({
  id: z.string(),
  source: CardSource,
  direction: CardDirection,
  phase: CardPhase,
  /** Task line, e.g. "Type the missing word" or "Fix the sentence". */
  task: z.string(),
  /** Main prompt text (cloze sentence, original sentence, exercise line). */
  prompt: z.string(),
  /** Text to highlight inside `prompt` (recognition of a word in its sentence). */
  highlight: z.string().nullable(),
  /** Spanish hint shown with the prompt. */
  hintEs: z.string().nullable(),
  /** Accepted typed answers; `null` for recognition cards. */
  answers: z.array(z.string()).nullable(),
  /** Text revealed after answering. */
  back: z.string(),
  /** Where it comes from, e.g. article title or "Written on 2026-10-25". */
  context: z.string().nullable(),
});
export type QueueCard = z.infer<typeof QueueCard>;

export const QueueResponse = z.object({
  cards: z.array(QueueCard),
  /** Due cards still waiting after this batch (not counting new ones). */
  dueRemaining: z.number().int().nonnegative(),
  newPerDay: z.number().int().nonnegative(),
  newToday: z.number().int().nonnegative(),
});
export type QueueResponse = z.infer<typeof QueueResponse>;

export const ReviewRequest = z.object({
  rating: SrsRating,
  answer: z.string().max(2000).optional(),
});
export type ReviewRequest = z.infer<typeof ReviewRequest>;

export const ReviewResponse = z.object({
  cardId: z.string(),
  rating: SrsRating,
  phase: CardPhase,
  due: z.string(),
});
export type ReviewResponse = z.infer<typeof ReviewResponse>;

/** Card as the browser lists it. */
export const CardView = z.object({
  id: z.string(),
  source: CardSource,
  front: z.string(),
  back: z.string(),
  phase: CardPhase,
  due: z.string(),
  suspended: z.boolean(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type CardView = z.infer<typeof CardView>;

export const CardsListResponse = z.object({ cards: z.array(CardView) });
export type CardsListResponse = z.infer<typeof CardsListResponse>;

export const CardPatch = z
  .object({
    front: z.string().trim().min(1).max(2000).optional(),
    back: z.string().trim().min(1).max(2000).optional(),
    suspended: z.boolean().optional(),
  })
  .refine((p) => Object.keys(p).length > 0, { message: "Nothing to update" });
export type CardPatch = z.infer<typeof CardPatch>;

export const StatsResponse = z.object({
  /** Reviews due by the end of today (excludes new and suspended cards). */
  dueToday: z.number().int().nonnegative(),
  /** Cards reviewed for the first time today. */
  newToday: z.number().int().nonnegative(),
  /** New cards still waiting to be introduced. */
  newAvailable: z.number().int().nonnegative(),
  /** Cards reviewed at least once. */
  learned: z.number().int().nonnegative(),
  /** Review-phase cards with an interval of 21 days or more. */
  mature: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  suspended: z.number().int().nonnegative(),
  reviewsLast30Days: z.number().int().nonnegative(),
  /** Reviews per local day (YYYY-MM-DD), oldest first, only days with reviews. */
  reviewsByDay: z.array(z.object({ date: z.string(), count: z.number().int().positive() })),
});
export type StatsResponse = z.infer<typeof StatsResponse>;

const Count = z.number().int().min(0).max(1000);

export const SessionRequest = z.object({
  reviewed: Count,
  again: Count,
  hard: Count,
  good: Count,
  easy: Count,
  /** Session length in seconds, as measured by the client. */
  seconds: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600)
    .optional(),
});
export type SessionRequest = z.infer<typeof SessionRequest>;

export const SessionResponse = z.object({ recorded: z.boolean() });
export type SessionResponse = z.infer<typeof SessionResponse>;

export const DeleteCardResponse = z.object({ deleted: z.literal(true) });
export type DeleteCardResponse = z.infer<typeof DeleteCardResponse>;
