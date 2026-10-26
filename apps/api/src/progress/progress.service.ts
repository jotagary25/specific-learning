import {
  type CanDoEntry,
  type CanDoListResponse,
  CanDoSource,
  type ErrorsResponse,
  type MirrorDueResponse,
  type MirrorReflection,
  type MirrorResponse,
  type MirrorSeenResponse,
  type ProgressSummary,
  type TimelineResponse,
} from "@english-course/shared";
import { type TimeZoneOf, utcTimeZone } from "../settings/preferences.ts";
import {
  addDays,
  localDate,
  localMonth,
  monthLabel,
  monthRange,
  startOfDay,
} from "../shared/clock.ts";
import {
  buildTimeline,
  classifyErrors,
  compareWriting,
  mirrorArticle,
  mirrorDue,
  mirrorUnits,
  pickMirrorReading,
  REFLECTION_PROMPT,
  summarize,
} from "./aggregate.ts";
import type { CanDoRecord, EventRecord, ProgressStore } from "./progress.store.ts";

const DAY_MS = 86_400_000;
/** Default timeline span: the last 12 weeks. */
export const DEFAULT_TIMELINE_DAYS = 84;
export const MAX_TIMELINE_DAYS = 366;

export const MIRROR_VIEWED = "mirror_viewed";
export const MIRROR_REFLECTION = "mirror_reflection";

export class ProgressError extends Error {
  override readonly name = "ProgressError";
  readonly code: "invalid_range" | "future_month";

  constructor(code: ProgressError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type ProgressDeps = {
  store: ProgressStore;
  now?: () => Date;
  /** The user's IANA zone (UTC by default): days, weeks and months are local to it. */
  timeZoneOf?: TimeZoneOf;
};

const canDoView = (c: CanDoRecord): CanDoEntry => ({
  id: c.id,
  text: c.text,
  source: CanDoSource.safeParse(c.source).data ?? "learner",
  createdAt: c.createdAt.toISOString(),
});

const monthOfEvent = (e: EventRecord) =>
  typeof e.payload.month === "string" ? e.payload.month : null;

export function createProgress(deps: ProgressDeps) {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  const timeZoneOf = deps.timeZoneOf ?? utcTimeZone;

  async function seenMonths(userId: string): Promise<Set<string>> {
    const events = await store.listEvents(userId, { types: [MIRROR_VIEWED, MIRROR_REFLECTION] });
    return new Set(events.flatMap((e) => monthOfEvent(e) ?? []));
  }

  async function ensurePastMonth(userId: string, month: string) {
    if (month > localMonth(now(), await timeZoneOf(userId))) {
      throw new ProgressError("future_month", "The mirror only looks back, not ahead");
    }
  }

  return {
    async summary(userId: string): Promise<ProgressSummary> {
      const at = now();
      const [units, cards, submissions, readings, sessionEvents] = await Promise.all([
        store.listUnits(userId),
        store.listWordCards(userId),
        store.listSubmissions(userId),
        store.listReadings(userId),
        store.listEvents(userId, {
          types: ["session_completed"],
          from: new Date(at.getTime() - 30 * DAY_MS),
        }),
      ]);
      return summarize({ units, cards, submissions, readings, sessionEvents, now: at });
    },

    /** `from`/`to` are inclusive local days (YYYY-MM-DD). */
    async timeline(
      userId: string,
      range: { from?: string; to?: string } = {},
    ): Promise<TimelineResponse> {
      const zone = await timeZoneOf(userId);
      const to = range.to ?? localDate(now(), zone);
      const from = range.from ?? addDays(to, -(DEFAULT_TIMELINE_DAYS - 1));
      if (from > to) throw new ProgressError("invalid_range", "from must not be after to");
      if (from < addDays(to, -(MAX_TIMELINE_DAYS - 1))) {
        throw new ProgressError(
          "invalid_range",
          `The timeline spans at most ${MAX_TIMELINE_DAYS} days`,
        );
      }
      const start = startOfDay(from, zone);
      const end = startOfDay(addDays(to, 1), zone);
      const [events, canDos, units] = await Promise.all([
        store.listEvents(userId, { from: start, to: end }),
        store.listCanDo(userId),
        store.listUnits(userId),
      ]);
      return {
        from,
        to,
        weeks: buildTimeline({ events, canDos, units, from: start, to: end, timeZone: zone }),
      };
    },

    async errors(userId: string): Promise<ErrorsResponse> {
      const [submissions, errors, units, timeZone] = await Promise.all([
        store.listSubmissions(userId),
        store.listErrors(userId),
        store.listUnits(userId),
        timeZoneOf(userId),
      ]);
      return classifyErrors({ submissions, errors, units, timeZone });
    },

    async mirror(userId: string, month: string): Promise<MirrorResponse> {
      await ensurePastMonth(userId, month);
      const at = now();
      const zone = await timeZoneOf(userId);
      const { end } = monthRange(month, zone);
      const [readings, cards, submissions, errors, units, mirrorEvents] = await Promise.all([
        store.listReadings(userId),
        store.listWordCards(userId),
        store.listSubmissions(userId),
        store.listErrors(userId),
        store.listUnits(userId),
        store.listEvents(userId, { types: [MIRROR_VIEWED, MIRROR_REFLECTION] }),
      ]);
      const reading = pickMirrorReading(readings, month, zone);
      const text = reading ? await store.getArticleText(reading.articleId) : undefined;
      const ofMonth = mirrorEvents.filter((e) => monthOfEvent(e) === month);
      const lastReflection = ofMonth.filter((e) => e.type === MIRROR_REFLECTION).at(-1);
      const reflectionText = lastReflection?.payload.text;
      return {
        month,
        label: monthLabel(month),
        article: reading ? mirrorArticle(reading, text ?? "", cards, at, zone) : null,
        writing: compareWriting(submissions, errors, end, zone),
        units: mirrorUnits(units, month, zone),
        reflectionPrompt: REFLECTION_PROMPT,
        reflection:
          lastReflection && typeof reflectionText === "string"
            ? { month, text: reflectionText, savedAt: lastReflection.createdAt.toISOString() }
            : null,
        seen: ofMonth.length > 0,
      };
    },

    /** Marks a month's mirror as seen (once). */
    async markMirrorSeen(userId: string, month: string): Promise<MirrorSeenResponse> {
      await ensurePastMonth(userId, month);
      if (!(await seenMonths(userId)).has(month))
        await store.insertEvent(userId, MIRROR_VIEWED, { month });
      return { month, seen: true };
    },

    /** Stores the learner's reflection as a `mirror_reflection` event; the latest one wins. */
    async saveReflection(userId: string, month: string, text: string): Promise<MirrorReflection> {
      await ensurePastMonth(userId, month);
      const saved = await store.insertEvent(userId, MIRROR_REFLECTION, { month, text });
      return { month, text, savedAt: saved.createdAt.toISOString() };
    },

    async mirrorDue(userId: string): Promise<MirrorDueResponse> {
      const [first, seen, zone] = await Promise.all([
        store.firstEventAt(userId, [MIRROR_VIEWED, MIRROR_REFLECTION]),
        seenMonths(userId),
        timeZoneOf(userId),
      ]);
      return mirrorDue(now(), first, seen, zone);
    },

    async listCanDo(userId: string): Promise<CanDoListResponse> {
      return { entries: (await store.listCanDo(userId)).map(canDoView) };
    },

    async addCanDo(userId: string, text: string): Promise<CanDoEntry> {
      return canDoView(await store.insertCanDo(userId, text));
    },
  };
}

export type Progress = ReturnType<typeof createProgress>;
