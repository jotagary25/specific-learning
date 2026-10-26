import type {
  CanDoEntry,
  CanDoListResponse,
  CanDoSource,
  ErrorsResponse,
  MirrorDueResponse,
  MirrorReflection,
  MirrorResponse,
  MirrorSeenResponse,
  ProgressSummary,
  TimelineResponse,
} from "@english-course/shared";
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
import { addDays, localDate, monthLabel, monthOf, monthRange, startOfDay } from "./dates.ts";
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

export type ProgressDeps = { store: ProgressStore; now?: () => Date };

const canDoView = (c: CanDoRecord): CanDoEntry => ({
  id: c.id,
  text: c.text,
  source: (c.source === "suggested" ? "suggested" : "learner") satisfies CanDoSource,
  createdAt: c.createdAt.toISOString(),
});

const monthOfEvent = (e: EventRecord) =>
  typeof e.payload.month === "string" ? e.payload.month : null;

export function createProgress(deps: ProgressDeps) {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());

  async function seenMonths(): Promise<Set<string>> {
    const events = await store.listEvents({ types: [MIRROR_VIEWED, MIRROR_REFLECTION] });
    return new Set(events.flatMap((e) => monthOfEvent(e) ?? []));
  }

  function ensurePastMonth(month: string) {
    if (month > monthOf(now())) {
      throw new ProgressError("future_month", "The mirror only looks back, not ahead");
    }
  }

  return {
    async summary(): Promise<ProgressSummary> {
      const at = now();
      const [units, cards, submissions, readings, sessionEvents] = await Promise.all([
        store.listUnits(),
        store.listWordCards(),
        store.listSubmissions(),
        store.listReadings(),
        store.listEvents({
          types: ["session_completed"],
          from: new Date(at.getTime() - 30 * DAY_MS),
        }),
      ]);
      return summarize({ units, cards, submissions, readings, sessionEvents, now: at });
    },

    /** `from`/`to` are inclusive local days (YYYY-MM-DD). */
    async timeline(range: { from?: string; to?: string } = {}): Promise<TimelineResponse> {
      const to = range.to ?? localDate(now());
      const from = range.from ?? addDays(to, -(DEFAULT_TIMELINE_DAYS - 1));
      if (from > to) throw new ProgressError("invalid_range", "from must not be after to");
      if (from < addDays(to, -(MAX_TIMELINE_DAYS - 1))) {
        throw new ProgressError(
          "invalid_range",
          `The timeline spans at most ${MAX_TIMELINE_DAYS} days`,
        );
      }
      const start = startOfDay(from);
      const end = startOfDay(addDays(to, 1));
      const [events, canDos, units] = await Promise.all([
        store.listEvents({ from: start, to: end }),
        store.listCanDo(),
        store.listUnits(),
      ]);
      return { from, to, weeks: buildTimeline({ events, canDos, units, from: start, to: end }) };
    },

    async errors(): Promise<ErrorsResponse> {
      const [submissions, errors, units] = await Promise.all([
        store.listSubmissions(),
        store.listErrors(),
        store.listUnits(),
      ]);
      return classifyErrors({ submissions, errors, units });
    },

    async mirror(month: string): Promise<MirrorResponse> {
      ensurePastMonth(month);
      const at = now();
      const { end } = monthRange(month);
      const [readings, cards, submissions, errors, units, mirrorEvents] = await Promise.all([
        store.listReadings(),
        store.listWordCards(),
        store.listSubmissions(),
        store.listErrors(),
        store.listUnits(),
        store.listEvents({ types: [MIRROR_VIEWED, MIRROR_REFLECTION] }),
      ]);
      const reading = pickMirrorReading(readings, month);
      const text = reading ? await store.getArticleText(reading.articleId) : undefined;
      const ofMonth = mirrorEvents.filter((e) => monthOfEvent(e) === month);
      const lastReflection = ofMonth.filter((e) => e.type === MIRROR_REFLECTION).at(-1);
      const reflectionText = lastReflection?.payload.text;
      return {
        month,
        label: monthLabel(month),
        article: reading ? mirrorArticle(reading, text ?? "", cards, at) : null,
        writing: compareWriting(submissions, errors, end),
        units: mirrorUnits(units, month),
        reflectionPrompt: REFLECTION_PROMPT,
        reflection:
          lastReflection && typeof reflectionText === "string"
            ? { month, text: reflectionText, savedAt: lastReflection.createdAt.toISOString() }
            : null,
        seen: ofMonth.length > 0,
      };
    },

    /** Marks a month's mirror as seen (once). */
    async markMirrorSeen(month: string): Promise<MirrorSeenResponse> {
      ensurePastMonth(month);
      if (!(await seenMonths()).has(month)) await store.insertEvent(MIRROR_VIEWED, { month });
      return { month, seen: true };
    },

    /** Stores the learner's reflection as a `mirror_reflection` event; the latest one wins. */
    async saveReflection(month: string, text: string): Promise<MirrorReflection> {
      ensurePastMonth(month);
      const saved = await store.insertEvent(MIRROR_REFLECTION, { month, text });
      return { month, text, savedAt: saved.createdAt.toISOString() };
    },

    async mirrorDue(): Promise<MirrorDueResponse> {
      const [first, seen] = await Promise.all([
        store.firstEventAt([MIRROR_VIEWED, MIRROR_REFLECTION]),
        seenMonths(),
      ]);
      return mirrorDue(now(), first, seen);
    },

    async listCanDo(): Promise<CanDoListResponse> {
      return { entries: (await store.listCanDo()).map(canDoView) };
    },

    async addCanDo(text: string): Promise<CanDoEntry> {
      return canDoView(await store.insertCanDo(text));
    },
  };
}

export type Progress = ReturnType<typeof createProgress>;
