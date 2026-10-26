import { z } from "zod";

/**
 * Session modes (spec §3.1, methodology §4): `full` = the 25-min daily block,
 * `slump` = the 10-min low-effort block after lunch, `minimum` = the 5-min "never zero" variant.
 */
export const TodayMode = z.enum(["full", "slump", "minimum"]);
export type TodayMode = z.infer<typeof TodayMode>;

export const MODE_MINUTES: Record<TodayMode, number> = { full: 25, slump: 10, minimum: 5 };

export const Daypart = z.enum(["morning", "afternoon", "evening"]);
export type Daypart = z.infer<typeof Daypart>;

export const PlanBlockKind = z.enum(["unit", "reading", "vocabulary", "writing", "recall"]);
export type PlanBlockKind = z.infer<typeof PlanBlockKind>;

export const PlanBlock = z.object({
  kind: PlanBlockKind,
  title: z.string(),
  minutes: z.number().int().min(3),
  /** In-app route that opens exactly this work. */
  deepLink: z.string(),
  /** Why this block is in the plan, shown under the title. */
  reason: z.string(),
});
export type PlanBlock = z.infer<typeof PlanBlock>;

export const TodayPlan = z.object({
  mode: TodayMode,
  budgetMin: z.number().int().positive(),
  blocks: z.array(PlanBlock).min(1).max(3),
});
export type TodayPlan = z.infer<typeof TodayPlan>;

export const StudySessionView = z.object({
  id: z.string(),
  mode: TodayMode,
  budgetMin: z.number().int().positive(),
  plan: TodayPlan,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  bonusMin: z.number().int().nonnegative(),
});
export type StudySessionView = z.infer<typeof StudySessionView>;

export const StoryTeaser = z.object({
  unit: z.number().int().positive(),
  chapterTitle: z.string(),
  teaser: z.string(),
});
export type StoryTeaser = z.infer<typeof StoryTeaser>;

/** `GET /api/today`: the plan for now, plus what the Today screen frames it with. */
export const TodayOverview = z.object({
  now: z.string(),
  daypart: Daypart,
  weekend: z.boolean(),
  suggestedMode: TodayMode,
  plan: TodayPlan,
  teaser: StoryTeaser.nullable(),
  parkingOpen: z.number().int().nonnegative(),
  /** Sessions started today, oldest first (ended ones and the active one). */
  sessionsToday: z.array(StudySessionView),
  /** The open session, if it still has time left (the client restores it after a reload). */
  activeSession: StudySessionView.nullable(),
});
export type TodayOverview = z.infer<typeof TodayOverview>;

export const StartSessionRequest = z.object({ mode: TodayMode });
export type StartSessionRequest = z.infer<typeof StartSessionRequest>;

export const EndReason = z.enum(["timer", "user"]);
export type EndReason = z.infer<typeof EndReason>;

export const EndSessionRequest = z.object({
  reason: EndReason,
  /** Extra minutes taken after the timer ran out (see `bonusAllowed`). */
  bonusMinutes: z.number().int().min(0).max(120).optional(),
  /** Plan blocks the learner finished. */
  blocksDone: z.number().int().min(0).max(3).optional(),
});
export type EndSessionRequest = z.infer<typeof EndSessionRequest>;

export const ParkingItemView = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
  createdAt: z.string(),
});
export type ParkingItemView = z.infer<typeof ParkingItemView>;

export const PARKING_TEXT_MAX = 280;
const ParkingText = z.string().trim().min(1).max(PARKING_TEXT_MAX);

export const ParkingListResponse = z.object({ items: z.array(ParkingItemView) });
export type ParkingListResponse = z.infer<typeof ParkingListResponse>;

export const CreateParkingRequest = z.object({ text: ParkingText });
export type CreateParkingRequest = z.infer<typeof CreateParkingRequest>;

export const UpdateParkingRequest = z
  .object({ text: ParkingText.optional(), done: z.boolean().optional() })
  .refine((v) => v.text !== undefined || v.done !== undefined, "Nothing to update");
export type UpdateParkingRequest = z.infer<typeof UpdateParkingRequest>;

export const DeleteParkingResponse = z.object({ deleted: z.literal(true) });
