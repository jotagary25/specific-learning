import { z } from "zod";
import { ScoresView } from "../writing/api.ts";

// Progress (spec §3.7, methodology §7): evidence of competence, never streaks or points.

const Count = z.number().int().nonnegative();
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/** Calendar month, `YYYY-MM`. */
export const MonthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");
export type MonthKey = z.infer<typeof MonthKey>;

export const ScoreDimension = z.enum(["grammar", "clarity", "vocabulary", "naturalness"]);
export type ScoreDimension = z.infer<typeof ScoreDimension>;
export const SCORE_DIMENSIONS = ScoreDimension.options;

// --- Summary -------------------------------------------------------------------------------

export const DimensionTrend = z.object({
  dimension: ScoreDimension,
  /** Scores of the last reviewed submissions (up to 10), oldest first. */
  values: z.array(z.number()),
  average: z.number().nullable(),
  /** Latest minus oldest of `values`; `null` with fewer than two values. */
  change: z.number().nullable(),
});
export type DimensionTrend = z.infer<typeof DimensionTrend>;

export const ProgressSummary = z.object({
  units: z.object({
    total: Count,
    completed: Count,
    inProgress: Count,
    needsReview: Count,
  }),
  /** Word cards saved from reading, by FSRS maturity. */
  words: z.object({ saved: Count, new: Count, learning: Count, mature: Count }),
  writing: z.object({ reviewed: Count, dimensions: z.array(DimensionTrend) }),
  /** Minutes from finished Today sessions. */
  minutes: z.object({ last7Days: Count, last30Days: Count }),
  articlesRead: Count,
});
export type ProgressSummary = z.infer<typeof ProgressSummary>;

// --- Timeline ------------------------------------------------------------------------------

export const ProgressItemKind = z.enum([
  "unit_completed",
  "reading_completed",
  "recall_completed",
  "writing_completed",
  "writing_level_up",
  "srs_session",
  "study_session",
  "can_do",
  "mirror_reflection",
]);
export type ProgressItemKind = z.infer<typeof ProgressItemKind>;

export const ProgressItem = z.object({
  at: z.iso.datetime({ offset: true }),
  kind: ProgressItemKind,
  title: z.string(),
  detail: z.string().nullable(),
  /** In-app route to the evidence (unit, article, mirror…). */
  link: z.string().nullable(),
  /** "Now I can…" statements earned with this item (unit completion). */
  canDo: z.array(z.string()),
  scores: ScoresView.nullable(),
});
export type ProgressItem = z.infer<typeof ProgressItem>;

export const TimelineWeek = z.object({
  /** Local Monday of the week. */
  weekStart: IsoDate,
  minutes: Count,
  /** Oldest first. */
  items: z.array(ProgressItem),
});
export type TimelineWeek = z.infer<typeof TimelineWeek>;

export const TimelineResponse = z.object({
  from: IsoDate,
  to: IsoDate,
  /** Oldest week first; weeks without items are left out. */
  weeks: z.array(TimelineWeek),
});
export type TimelineResponse = z.infer<typeof TimelineResponse>;

// --- Errors --------------------------------------------------------------------------------

/**
 * `beating`: seen before and now at most half as frequent per text; `recurring`: still showing
 * up at a similar or higher rate; `once`: a single occurrence, too early to call.
 */
export const ErrorTrend = z.enum(["beating", "recurring", "once"]);
export type ErrorTrend = z.infer<typeof ErrorTrend>;

export const MonthCount = z.object({ month: MonthKey, count: Count });
export type MonthCount = z.infer<typeof MonthCount>;

export const UnitRef = z.object({ unit: z.number().int().positive(), title: z.string() });
export type UnitRef = z.infer<typeof UnitRef>;

const WindowCount = z.object({ count: Count, submissions: Count });

export const ErrorTypeTrend = z.object({
  type: z.string(),
  total: Count,
  /** Older reviewed texts vs the most recent ones (see `recentWindow`). */
  before: WindowCount,
  recent: WindowCount,
  trend: ErrorTrend,
  units: z.array(UnitRef),
  months: z.array(MonthCount),
});
export type ErrorTypeTrend = z.infer<typeof ErrorTypeTrend>;

export const UnitErrors = UnitRef.extend({ total: Count, months: z.array(MonthCount) });
export type UnitErrors = z.infer<typeof UnitErrors>;

export const ErrorsResponse = z.object({
  /** Reviewed texts considered. */
  submissions: Count,
  /** Size of the "recent" window: min(5, half of the reviewed texts). */
  recentWindow: Count,
  /** Months with errors, oldest first. */
  months: z.array(MonthKey),
  /** Most frequent first. */
  types: z.array(ErrorTypeTrend),
  units: z.array(UnitErrors),
  /** Top 3 "errors you are beating". */
  beating: z.array(ErrorTypeTrend).max(3),
  /** Top 3 "still recurring". */
  recurring: z.array(ErrorTypeTrend).max(3),
});
export type ErrorsResponse = z.infer<typeof ErrorsResponse>;

// --- Monthly mirror ------------------------------------------------------------------------

/** A word the learner glossed or saved while reading, with its card state today. */
export const MirrorWordStatus = z.enum(["mature", "learning", "new", "not_saved"]);
export type MirrorWordStatus = z.infer<typeof MirrorWordStatus>;

export const MirrorWord = z.object({ word: z.string(), status: MirrorWordStatus });
export type MirrorWord = z.infer<typeof MirrorWord>;

export const MirrorArticle = z.object({
  articleId: z.string(),
  title: z.string(),
  readOn: IsoDate,
  daysAgo: Count,
  text: z.string(),
  words: z.array(MirrorWord),
  /** Words glossed or saved back then. */
  unknownThen: Count,
  /** Of those, the words without a mature card today. */
  unknownNow: Count,
});
export type MirrorArticle = z.infer<typeof MirrorArticle>;

export const MirrorPost = z.object({
  submissionId: z.string(),
  title: z.string(),
  format: z.string().nullable(),
  writtenOn: IsoDate,
  text: z.string(),
  scores: ScoresView,
  overall: z.number().int(),
  errorCount: Count,
  errorTypes: z.array(z.string()),
});
export type MirrorPost = z.infer<typeof MirrorPost>;

export const MirrorWriting = z.object({
  first: MirrorPost,
  /** `null` while the first post is the only reviewed one. */
  latest: MirrorPost.nullable(),
  /** Latest minus first, per dimension plus `overall`; empty without `latest`. */
  deltas: z.array(
    z.object({ dimension: z.union([ScoreDimension, z.literal("overall")]), change: z.number() }),
  ),
});
export type MirrorWriting = z.infer<typeof MirrorWriting>;

export const MirrorUnit = UnitRef.extend({ completedOn: IsoDate, canDo: z.array(z.string()) });
export type MirrorUnit = z.infer<typeof MirrorUnit>;

export const MirrorReflection = z.object({
  month: MonthKey,
  text: z.string(),
  savedAt: z.iso.datetime({ offset: true }),
});
export type MirrorReflection = z.infer<typeof MirrorReflection>;

export const MirrorResponse = z.object({
  month: MonthKey,
  /** e.g. "October 2026". */
  label: z.string(),
  article: MirrorArticle.nullable(),
  writing: MirrorWriting.nullable(),
  units: z.array(MirrorUnit),
  reflectionPrompt: z.string(),
  reflection: MirrorReflection.nullable(),
  seen: z.boolean(),
});
export type MirrorResponse = z.infer<typeof MirrorResponse>;

export const MirrorDueResponse = z.object({
  due: z.boolean(),
  month: MonthKey,
  reason: z.enum(["due", "already_seen", "not_enough_history"]),
  /** Days since the first recorded learning event. */
  historyDays: Count,
});
export type MirrorDueResponse = z.infer<typeof MirrorDueResponse>;

export const MirrorSeenResponse = z.object({ month: MonthKey, seen: z.literal(true) });
export type MirrorSeenResponse = z.infer<typeof MirrorSeenResponse>;

export const ReflectionRequest = z.object({ text: z.string().trim().min(1).max(2000) });
export type ReflectionRequest = z.infer<typeof ReflectionRequest>;

// --- Can-do log ----------------------------------------------------------------------------

/** `mirror`: written from the monthly mirror (stored source widened in T18). */
export const CanDoSource = z.enum(["learner", "suggested", "mirror"]);
export type CanDoSource = z.infer<typeof CanDoSource>;

export const CanDoEntry = z.object({
  id: z.string(),
  text: z.string(),
  source: CanDoSource,
  createdAt: z.iso.datetime({ offset: true }),
});
export type CanDoEntry = z.infer<typeof CanDoEntry>;

export const CanDoListResponse = z.object({ entries: z.array(CanDoEntry) });
export type CanDoListResponse = z.infer<typeof CanDoListResponse>;

export const CreateCanDoRequest = z.object({ text: z.string().trim().min(1).max(280) });
export type CreateCanDoRequest = z.infer<typeof CreateCanDoRequest>;
