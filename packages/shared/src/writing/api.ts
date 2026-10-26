import { z } from "zod";
import { MissionFormat, PracticeItem, Register, WritingErrorType } from "../ai/schemas.ts";

/** HTTP contracts of the Writing feature (`/api/writing`), shared by api and web. */

/**
 * Review flow of one mission's submission:
 * draft → reviewed → rechecked (≤ {@link MAX_RECHECKS} rounds) → rewritten → completed.
 * `skipped` ends a mission without completing it.
 */
export const WritingFlowStatus = z.enum([
  "draft",
  "reviewed",
  "rechecked",
  "rewritten",
  "completed",
  "skipped",
]);
export type WritingFlowStatus = z.infer<typeof WritingFlowStatus>;

export const MAX_RECHECKS = 2;
export const MAX_TEXT_LENGTH = 8000;

/** `open` until the first recheck; then the recheck verdict. */
export const WritingErrorStatus = z.enum(["open", "fixed", "changed", "remaining"]);
export type WritingErrorStatus = z.infer<typeof WritingErrorStatus>;

export const UnitLink = z.object({ id: z.number().int(), title: z.string() });
export type UnitLink = z.infer<typeof UnitLink>;

export const FormatLimitsView = z.object({
  minWords: z.number().int(),
  maxWords: z.number().int(),
  maxChars: z.number().int().nullable(),
});

export const Inspiration = z.object({ title: z.string(), opinion: z.string().nullable() });
export type Inspiration = z.infer<typeof Inspiration>;

export const MissionView = z.object({
  id: z.string(),
  level: z.number().int(),
  format: MissionFormat,
  title: z.string(),
  topic: z.string(),
  promptEn: z.string(),
  whyEs: z.string().nullable(),
  targetUnit: UnitLink.nullable(),
  grammarTargets: z.array(z.string()),
  suggestedWords: z.array(z.string()),
  limits: FormatLimitsView,
  /** This week's reading opinions the mission builds on. */
  inspiration: z.array(Inspiration),
  /** `fallback` = built-in template used while the AI was unavailable. */
  source: z.enum(["ai", "fallback"]),
  createdAt: z.string(),
});
export type MissionView = z.infer<typeof MissionView>;

export const WritingErrorView = z.object({
  id: z.string(),
  /** Exact substring of the text the error was found in. */
  span: z.string(),
  type: WritingErrorType,
  unit: UnitLink.nullable(),
  hintEs: z.string(),
  status: WritingErrorStatus,
  /** Latest recheck feedback (Spanish), never the corrected form. */
  feedbackEs: z.string().nullable(),
  /** `recheck` = a new issue introduced by a fix. */
  origin: z.enum(["review", "recheck"]),
  /** Only after the last recheck round, for errors still not fixed. */
  reveal: z
    .object({ explanationEs: z.string(), correctedFragment: z.string().nullable() })
    .nullable(),
});
export type WritingErrorView = z.infer<typeof WritingErrorView>;

export const ScoresView = z.object({
  grammar: z.number().int(),
  clarity: z.number().int(),
  vocabulary: z.number().int(),
  naturalness: z.number().int(),
});
export type ScoresView = z.infer<typeof ScoresView>;

export const RewriteView = z.object({ register: Register, text: z.string(), noteEs: z.string() });
export type RewriteView = z.infer<typeof RewriteView>;

export const PublishedVersion = z.union([Register, z.literal("own")]);
export type PublishedVersion = z.infer<typeof PublishedVersion>;

export const WritingActions = z.object({
  saveDraft: z.boolean(),
  submit: z.boolean(),
  recheck: z.boolean(),
  rewrite: z.boolean(),
  complete: z.boolean(),
  skip: z.boolean(),
  markPublished: z.boolean(),
});
export type WritingActions = z.infer<typeof WritingActions>;

export const SubmissionView = z.object({
  id: z.string(),
  status: WritingFlowStatus,
  /** Recheck rounds done so far. */
  round: z.number().int(),
  maxRounds: z.number().int(),
  /** The editable text: the draft, then the learner's fixed version. */
  text: z.string(),
  /** Text as first submitted for review; `null` while drafting. */
  submittedText: z.string().nullable(),
  scores: ScoresView.nullable(),
  overall: z.number().int().nullable(),
  strengthEs: z.string().nullable(),
  errors: z.array(WritingErrorView),
  rewrites: z.array(RewriteView),
  publishedAt: z.string().nullable(),
  publishedVersion: PublishedVersion.nullable(),
  completedAt: z.string().nullable(),
  can: WritingActions,
});
export type SubmissionView = z.infer<typeof SubmissionView>;

export const LevelView = z.object({
  level: z.number().int(),
  format: MissionFormat,
  completed: z.number().int(),
  needed: z.number().int(),
  average: z.number().int().nullable(),
});
export type LevelView = z.infer<typeof LevelView>;

export const WritingCurrentResponse = z.object({
  level: LevelView,
  mission: MissionView.nullable(),
  submission: SubmissionView.nullable(),
});
export type WritingCurrentResponse = z.infer<typeof WritingCurrentResponse>;

/** Answer of every flow action on the active mission. */
export const WritingMissionResponse = z.object({
  level: LevelView,
  mission: MissionView,
  submission: SubmissionView,
  /** Set when the AI could not run; the learner's text is saved anyway. */
  error: z.literal("ai-unavailable").optional(),
  /** Set when completing this mission moved the learner to the next level. */
  levelUp: z.boolean().optional(),
});
export type WritingMissionResponse = z.infer<typeof WritingMissionResponse>;

export const HistoryEntry = z.object({
  id: z.string(),
  title: z.string(),
  format: MissionFormat,
  level: z.number().int(),
  status: WritingFlowStatus,
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  scores: ScoresView.nullable(),
  overall: z.number().int().nullable(),
  errorCount: z.number().int(),
  fixedCount: z.number().int(),
  publishedVersion: PublishedVersion.nullable(),
});
export type HistoryEntry = z.infer<typeof HistoryEntry>;

export const WritingHistoryResponse = z.object({
  level: LevelView,
  /** Newest first. */
  missions: z.array(HistoryEntry),
});
export type WritingHistoryResponse = z.infer<typeof WritingHistoryResponse>;

const LearnerText = z.string().max(MAX_TEXT_LENGTH);

export const DraftRequest = z.object({ text: LearnerText });
export type DraftRequest = z.infer<typeof DraftRequest>;

export const SubmitRequest = z.object({ text: LearnerText.refine((t) => t.trim().length > 0) });
export type SubmitRequest = z.infer<typeof SubmitRequest>;

export const RecheckRequest = SubmitRequest;
export type RecheckRequest = SubmitRequest;

export const CompleteRequest = z.object({ publishedVersion: PublishedVersion.optional() });
export type CompleteRequest = z.infer<typeof CompleteRequest>;

export const PublishedRequest = z.object({ version: PublishedVersion });
export type PublishedRequest = z.infer<typeof PublishedRequest>;

export const PracticeRequest = z.object({ count: z.number().int().min(1).max(10).default(5) });
export type PracticeRequest = z.infer<typeof PracticeRequest>;

export const PracticeResponse = z.object({
  /** Unit the items practice; `null` when there are no recent errors. */
  unit: UnitLink.nullable(),
  items: z.array(PracticeItem),
  error: z.literal("ai-unavailable").optional(),
});
export type PracticeResponse = z.infer<typeof PracticeResponse>;
