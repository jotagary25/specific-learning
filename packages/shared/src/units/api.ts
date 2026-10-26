import { z } from "zod";
import { CheckAnswerOutput, ExplainTutorOutput, HintLevel } from "../ai/schemas.ts";
import {
  AnswerKind,
  GrammarSpan,
  Segment,
  TheorySection,
  TimelineExpected,
  UnitExtras,
  WordBankEntry,
} from "../content/index.ts";
import { ItemCheckResult, UnitCompletion } from "./schemas.ts";
import { TimelinePlacement } from "./timeline.ts";

/** HTTP contracts of the Units feature (`/api/units`), shared by api and web. */

export const UnitProgressStatus = z.enum(["not-started", "in-progress", "completed"]);
export type UnitProgressStatus = z.infer<typeof UnitProgressStatus>;

export const UnitListEntry = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  subtitle: z.string(),
  status: UnitProgressStatus,
  /** First-attempt score 0..1 over graded items; null before any graded attempt. */
  score: z.number().min(0).max(1).nullable(),
  /** Raised by writing errors or SRS lapses: Today should review this unit. */
  priority: z.boolean(),
});
export type UnitListEntry = z.infer<typeof UnitListEntry>;

export const UnitsListResponse = z.object({
  blocks: z.array(
    z.object({ id: z.number().int(), title: z.string(), units: z.array(UnitListEntry) }),
  ),
});
export type UnitsListResponse = z.infer<typeof UnitsListResponse>;

/** An exercise item as the learner sees it: never carries the answer key. */
export const PublicExerciseItem = z.object({
  id: z.string(),
  num: z.string(),
  isExample: z.boolean(),
  /** Checked by the AI (open answer or a key that cannot be matched deterministically). */
  isOpen: z.boolean(),
  kind: AnswerKind.nullable(),
  lines: z.array(z.array(Segment)),
});
export type PublicExerciseItem = z.infer<typeof PublicExerciseItem>;

export const PublicExercise = z.object({
  id: z.string(),
  instruction: z.string(),
  evaluation: z.enum(["auto", "ai"]),
  wordBank: z.array(WordBankEntry).nullable(),
  passage: z.string().nullable(),
  answerNote: z.string().nullable(),
  items: z.array(PublicExerciseItem),
});
export type PublicExercise = z.infer<typeof PublicExercise>;

export const StoryChapterView = z.object({
  id: z.string(),
  position: z.number().int(),
  title: z.string(),
  body: z.string(),
  grammarSpans: z.array(GrammarSpan),
  teaser: z.string(),
});
export type StoryChapterView = z.infer<typeof StoryChapterView>;

export const TimelinePrompt = z.object({ id: z.string(), sentence: z.string() });
export type TimelinePrompt = z.infer<typeof TimelinePrompt>;

export const AttemptMethod = z.enum(["deterministic", "ai"]);
export type AttemptMethod = z.infer<typeof AttemptMethod>;

export const ItemProgress = z.object({
  itemId: z.string(),
  attempts: z.number().int().nonnegative(),
  latest: z.object({
    inputs: z.array(z.string()),
    result: ItemCheckResult,
    method: AttemptMethod,
    /** AI feedback (Spanish) stored with the attempt, so it survives a reload. */
    feedbackEs: z.string().optional(),
    hintEs: z.string().optional(),
  }),
});
export type ItemProgress = z.infer<typeof ItemProgress>;

export const UnitProgress = z.object({
  status: UnitProgressStatus,
  completedAt: z.string().nullable(),
  completion: UnitCompletion,
  items: z.array(ItemProgress),
});
export type UnitProgress = z.infer<typeof UnitProgress>;

export const UnitDetail = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  subtitle: z.string(),
  block: z.object({ id: z.number().int(), title: z.string() }),
  theory: z.array(TheorySection),
  extras: UnitExtras.nullable(),
  story: z.object({ title: z.string().nullable(), chapter: StoryChapterView }).nullable(),
  timeline: z.array(TimelinePrompt),
  exercises: z.array(PublicExercise),
  progress: UnitProgress,
});
export type UnitDetail = z.infer<typeof UnitDetail>;

const input = z.string().max(500);

export const AttemptRequest = z.object({ inputs: z.array(input).min(1).max(12) });
export type AttemptRequest = z.infer<typeof AttemptRequest>;

export const AttemptResponse = z.object({
  itemId: z.string(),
  status: ItemCheckResult.shape.status,
  result: ItemCheckResult,
  method: AttemptMethod,
  attemptNo: z.number().int().positive(),
  /** AI feedback (Spanish) for open items. */
  feedbackEs: CheckAnswerOutput.shape.feedbackEs.optional(),
  hintEs: CheckAnswerOutput.shape.hintEs,
  /** Set when an open item could not reach the AI; the attempt stays "needs-ai". */
  error: z.literal("ai-unavailable").optional(),
  completion: UnitCompletion,
  /** True only on the attempt that first took the unit to ≥ 80%. */
  unitCompleted: z.boolean(),
  /** "Now I can…" statements (Spanish) added when the unit was completed. */
  canDoEs: z.array(z.string()),
});
export type AttemptResponse = z.infer<typeof AttemptResponse>;

export const HintRequest = z.object({
  /** How many hints the learner already saw for this item (graduates the level). */
  shown: z.number().int().min(0).max(10).default(0),
});
export type HintRequest = z.infer<typeof HintRequest>;

export const HintResponse = z.object({
  level: HintLevel,
  hintEs: z.string(),
  /** "fallback" = generic hint used when the AI is unavailable or its hint leaked the answer. */
  source: z.enum(["ai", "fallback"]),
});
export type HintResponse = z.infer<typeof HintResponse>;

export const UnitStep = z.enum(["story", "puzzle", "theory", "timeline", "exercises"]);
export type UnitStep = z.infer<typeof UnitStep>;

export const ExplainContext = z.object({
  step: UnitStep,
  itemId: z.string().max(40).optional(),
  timelineItemId: z.string().max(40).optional(),
  /** The learner's own question, if typed. */
  question: z.string().trim().max(500).optional(),
  wantsProgrammerAnalogy: z.boolean().default(false),
  /** Explanations already shown for this doubt, so the next one takes a new angle. */
  previousExplanations: z.array(z.string().max(2000)).max(3).default([]),
});
export type ExplainContext = z.infer<typeof ExplainContext>;

export const ExplainRequest = z.object({ context: ExplainContext });
export type ExplainRequest = z.input<typeof ExplainRequest>;

export const ExplainResponse = ExplainTutorOutput;
export type ExplainResponse = z.infer<typeof ExplainResponse>;

export const TimelineCheckRequest = z.object({ placement: TimelinePlacement });
export type TimelineCheckRequest = z.infer<typeof TimelineCheckRequest>;

export const TimelineCheckResponse = z.object({
  correct: z.boolean(),
  kindCorrect: z.boolean(),
  handles: z.record(z.string(), z.boolean()),
  expected: TimelineExpected,
  explanationEs: z.string(),
});
export type TimelineCheckResponse = z.infer<typeof TimelineCheckResponse>;

export const AnswersResponse = z.object({
  exerciseId: z.string(),
  items: z.array(
    z.object({
      itemId: z.string(),
      raw: z.string(),
      /** Accepted alternatives per blank (for local re-checks in review mode). */
      blanks: z.array(z.array(z.string())),
      kind: AnswerKind,
      needsAi: z.boolean(),
    }),
  ),
});
export type AnswersResponse = z.infer<typeof AnswersResponse>;

/** Typed api error for AI-dependent endpoints when no model can be reached. */
export const AI_UNAVAILABLE = "ai-unavailable";
