// Pure aggregations behind /api/progress. Inputs are store records, outputs the shared views.

import {
  type DimensionTrend,
  type ErrorsResponse,
  type ErrorTypeTrend,
  FORMAT_LABELS,
  type MirrorArticle,
  type MirrorDueResponse,
  type MirrorPost,
  type MirrorUnit,
  type MirrorWord,
  type MirrorWordStatus,
  type MirrorWriting,
  type MissionFormat,
  type MonthCount,
  type ProgressItem,
  type ProgressSummary,
  SCORE_DIMENSIONS,
  type ScoresView,
  type TimelineWeek,
  type UnitErrors,
  type UnitRef,
} from "@english-course/shared";
import { isMature, isNew, parseState } from "../vocabulary/srs.ts";
import { daysBetween, localDate, monthOf, monthRange, previousMonth, weekStart } from "./dates.ts";
import type {
  CanDoRecord,
  ErrorRecord,
  EventRecord,
  ReadingRecord,
  SubmissionRecord,
  UnitRecord,
  WordCardRecord,
} from "./progress.store.ts";

const DAY_MS = 86_400_000;

/** Last reviewed texts shown per score dimension. */
export const SCORE_TREND_SIZE = 10;
/** The "recent" error window holds at most this many reviewed texts… */
export const RECENT_WINDOW_MAX = 5;
/** …and the mirror becomes due once there is this much history. */
export const MIRROR_MIN_HISTORY_DAYS = 14;

export const REFLECTION_PROMPT =
  "Look at the words you didn't know, your first post and the units you finished. " +
  "What can you do in English now that you couldn't do at the start of the month? " +
  "Write one short paragraph.";

const round1 = (n: number) => Math.round(n * 10) / 10;
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** Writing scores when all four dimensions are present. */
export function scoresOf(value: unknown): ScoresView | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const out: Partial<ScoresView> = {};
  for (const dimension of SCORE_DIMENSIONS) {
    const score = num(record[dimension]);
    if (score === null) return null;
    out[dimension] = Math.round(score);
  }
  return out as ScoresView;
}

const overallOf = (s: ScoresView) =>
  Math.round((s.grammar + s.clarity + s.vocabulary + s.naturalness) / 4);

const formatLabel = (format: unknown): string => {
  const key = str(format);
  return (key && FORMAT_LABELS[key as MissionFormat]) ?? key ?? "text";
};

export type WordPhase = Exclude<MirrorWordStatus, "not_saved">;

export function cardPhase(state: unknown): WordPhase {
  const parsed = parseState(state);
  if (isMature(parsed)) return "mature";
  return isNew(parsed) ? "new" : "learning";
}

const PHASE_RANK: Record<WordPhase, number> = { new: 0, learning: 1, mature: 2 };

/** Best phase per word (a word saved twice counts by its most advanced card). */
export function wordPhases(cards: readonly WordCardRecord[]): Map<string, WordPhase> {
  const phases = new Map<string, WordPhase>();
  for (const card of cards) {
    const phase = cardPhase(card.state);
    const current = phases.get(card.word);
    if (!current || PHASE_RANK[phase] > PHASE_RANK[current]) phases.set(card.word, phase);
  }
  return phases;
}

// --- Summary -------------------------------------------------------------------------------

export function reviewedSubmissions(submissions: readonly SubmissionRecord[]) {
  return submissions.flatMap((s) => {
    const scores = scoresOf(s.scores);
    return scores ? [{ ...s, scores }] : [];
  });
}

export function scoreTrends(submissions: readonly SubmissionRecord[]): DimensionTrend[] {
  const last = reviewedSubmissions(submissions).slice(-SCORE_TREND_SIZE);
  return SCORE_DIMENSIONS.map((dimension) => {
    const values = last.map((s) => s.scores[dimension]);
    const first = values[0];
    const latest = values.at(-1);
    return {
      dimension,
      values,
      average: values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null,
      change:
        values.length > 1 && first !== undefined && latest !== undefined ? latest - first : null,
    };
  });
}

/** Minutes of finished Today sessions (`session_completed` events). */
export function studyMinutes(events: readonly EventRecord[], since: Date): number {
  return events
    .filter((e) => e.type === "session_completed" && e.createdAt >= since)
    .reduce((sum, e) => sum + Math.max(0, num(e.payload.minutes) ?? 0), 0);
}

export function summarize(input: {
  units: readonly UnitRecord[];
  cards: readonly WordCardRecord[];
  submissions: readonly SubmissionRecord[];
  readings: readonly ReadingRecord[];
  sessionEvents: readonly EventRecord[];
  now: Date;
}): ProgressSummary {
  const { units, cards, submissions, readings, sessionEvents, now } = input;
  const phases = [...wordPhases(cards).values()];
  const countPhase = (p: WordPhase) => phases.filter((x) => x === p).length;
  return {
    units: {
      total: units.length,
      completed: units.filter((u) => u.status === "completed").length,
      inProgress: units.filter((u) => u.status === "in_progress").length,
      needsReview: units.filter((u) => u.status === "needs_review").length,
    },
    words: {
      saved: phases.length,
      new: countPhase("new"),
      learning: countPhase("learning"),
      mature: countPhase("mature"),
    },
    writing: {
      reviewed: reviewedSubmissions(submissions).length,
      dimensions: scoreTrends(submissions),
    },
    minutes: {
      last7Days: studyMinutes(sessionEvents, new Date(now.getTime() - 7 * DAY_MS)),
      last30Days: studyMinutes(sessionEvents, new Date(now.getTime() - 30 * DAY_MS)),
    },
    articlesRead: new Set(readings.filter((r) => r.completedAt).map((r) => r.articleId)).size,
  };
}

// --- Timeline ------------------------------------------------------------------------------

const unitLabel = (units: ReadonlyMap<number, UnitRecord>, n: number) => {
  const found = units.get(n);
  return found ? `unit ${n}: ${found.title}` : `unit ${n}`;
};

/** One timeline item per event; `undefined` for events that are not evidence on their own. */
export function eventItem(
  e: EventRecord,
  units: ReadonlyMap<number, UnitRecord>,
): ProgressItem | undefined {
  const p = e.payload;
  const base = {
    at: e.createdAt.toISOString(),
    detail: null,
    link: null,
    canDo: [] as string[],
    scores: null,
  };
  switch (e.type) {
    case "unit_completed": {
      const n = num(p.unitId);
      if (n === null) return undefined;
      const ratio = num(p.ratio);
      return {
        ...base,
        kind: "unit_completed",
        title: `Completed ${unitLabel(units, n)}`,
        detail: ratio === null ? null : `First-attempt score ${Math.round(ratio * 100)}%`,
        link: `/units/${n}`,
        canDo: units.get(n)?.canDo ?? [],
      };
    }
    case "reading_completed": {
      const words = num(p.wordCount);
      const saved = num(p.savedWords);
      const parts = [
        words === null ? null : `${words} words`,
        saved === null ? null : `${saved} ${saved === 1 ? "word" : "words"} saved`,
      ].filter(Boolean);
      const id = str(p.articleId);
      return {
        ...base,
        kind: "reading_completed",
        title: `Read “${str(p.title) ?? "an article"}”`,
        detail: parts.length ? parts.join(" · ") : null,
        link: id ? `/reading/${id}` : null,
      };
    }
    case "reading_recall_completed":
      return { ...base, kind: "recall_completed", title: "Recalled yesterday's article" };
    case "writing_completed": {
      const scores = scoresOf(p.scores);
      const overall = num(p.overall);
      const errors = num(p.errorCount) ?? 0;
      const fixed = num(p.fixedCount) ?? 0;
      return {
        ...base,
        kind: "writing_completed",
        title: `Finished a ${formatLabel(p.format)}${overall === null ? "" : ` (overall ${overall})`}`,
        detail: errors > 0 ? `Fixed ${fixed} of ${errors} errors` : null,
        link: "/writing/history",
        scores,
      };
    }
    case "writing_level_up":
      return {
        ...base,
        kind: "writing_level_up",
        title: `Writing level ${num(p.to) ?? "up"}: ${formatLabel(p.format)}s from now on`,
        link: "/writing",
      };
    case "srs_session_completed": {
      const reviewed = num(p.reviewed) ?? 0;
      const seconds = num(p.seconds);
      return {
        ...base,
        kind: "srs_session",
        title: `Reviewed ${reviewed} ${reviewed === 1 ? "card" : "cards"}`,
        detail: seconds === null ? null : `${Math.max(1, Math.round(seconds / 60))} min`,
        link: "/vocabulary",
      };
    }
    case "session_completed": {
      const minutes = num(p.minutes) ?? 0;
      const done = num(p.blocksDone);
      const planned = num(p.blocksPlanned);
      return {
        ...base,
        kind: "study_session",
        title: `Studied ${minutes} min`,
        detail: done !== null && planned !== null ? `${done} of ${planned} blocks done` : null,
      };
    }
    case "mirror_reflection": {
      const month = str(p.month);
      return {
        ...base,
        kind: "mirror_reflection",
        title: "Wrote the monthly mirror reflection",
        detail: month,
        link: month ? `/progress/mirror/${month}` : null,
      };
    }
    default:
      return undefined;
  }
}

/**
 * Timeline weeks (oldest first) from events and the learner's own can-do entries in
 * [from, to). Suggested can-do entries already show up inside their unit's item.
 */
export function buildTimeline(input: {
  events: readonly EventRecord[];
  canDos: readonly CanDoRecord[];
  units: readonly UnitRecord[];
  from: Date;
  to: Date;
}): TimelineWeek[] {
  const units = new Map(input.units.map((u) => [u.id, u]));
  const inRange = (at: Date) => at >= input.from && at < input.to;
  const items: { at: Date; item: ProgressItem; minutes: number }[] = [];
  for (const e of input.events) {
    if (!inRange(e.createdAt)) continue;
    const item = eventItem(e, units);
    if (!item) continue;
    const minutes = e.type === "session_completed" ? Math.max(0, num(e.payload.minutes) ?? 0) : 0;
    items.push({ at: e.createdAt, item, minutes });
  }
  for (const c of input.canDos) {
    if (c.source !== "learner" || !inRange(c.createdAt)) continue;
    items.push({
      at: c.createdAt,
      minutes: 0,
      item: {
        at: c.createdAt.toISOString(),
        kind: "can_do",
        title: `Now I can: ${c.text}`,
        detail: null,
        link: null,
        canDo: [],
        scores: null,
      },
    });
  }
  items.sort((a, b) => a.at.getTime() - b.at.getTime());

  const weeks = new Map<string, TimelineWeek>();
  for (const { at, item, minutes } of items) {
    const key = weekStart(at);
    const week = weeks.get(key) ?? { weekStart: key, minutes: 0, items: [] };
    week.minutes += minutes;
    week.items.push(item);
    weeks.set(key, week);
  }
  return [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// --- Errors --------------------------------------------------------------------------------

/**
 * Error-trend rule (methodology §7 "check whether they are decreasing"):
 * reviewed texts are split into a recent window (the last min(5, ⌊n/2⌋) texts) and the
 * older ones. Per error type, rate = occurrences ÷ texts in the window.
 * - `once`: a single occurrence overall (too early to call a trend);
 * - `beating`: seen in the older texts and the recent rate is at most half the older rate
 *   (zero recent occurrences included);
 * - `recurring`: everything else (still as frequent, more frequent, or no older window yet).
 * Rates per text keep the rule fair when the learner writes more.
 */
export function classifyErrors(input: {
  submissions: readonly SubmissionRecord[];
  errors: readonly ErrorRecord[];
  units: readonly UnitRecord[];
}): ErrorsResponse {
  const reviewed = reviewedSubmissions(input.submissions);
  const n = reviewed.length;
  const recentWindow = Math.min(RECENT_WINDOW_MAX, Math.floor(n / 2));
  const recentIds = new Set(reviewed.slice(n - recentWindow).map((s) => s.id));
  const beforeIds = new Set(reviewed.slice(0, n - recentWindow).map((s) => s.id));
  const unitTitles = new Map(input.units.map((u) => [u.id, u.title]));
  const unitRef = (id: number): UnitRef => ({
    unit: id,
    title: unitTitles.get(id) ?? `Unit ${id}`,
  });

  const months = [...new Set(input.errors.map((e) => monthOf(e.createdAt)))].sort();
  const monthSeries = (list: readonly ErrorRecord[]): MonthCount[] =>
    months.map((month) => ({
      month,
      count: list.filter((e) => monthOf(e.createdAt) === month).length,
    }));

  const byType = new Map<string, ErrorRecord[]>();
  for (const e of input.errors) byType.set(e.type, [...(byType.get(e.type) ?? []), e]);

  const types: ErrorTypeTrend[] = [...byType.entries()].map(([type, list]) => {
    const before = list.filter((e) => beforeIds.has(e.submissionId)).length;
    const recent = list.filter((e) => recentIds.has(e.submissionId)).length;
    const beforeRate = beforeIds.size ? before / beforeIds.size : 0;
    const recentRate = recentIds.size ? recent / recentIds.size : 0;
    const trend =
      list.length < 2
        ? "once"
        : recentIds.size > 0 && before > 0 && recentRate <= beforeRate / 2
          ? "beating"
          : "recurring";
    const unitIds = [...new Set(list.flatMap((e) => (e.unitId === null ? [] : [e.unitId])))];
    return {
      type,
      total: list.length,
      before: { count: before, submissions: beforeIds.size },
      recent: { count: recent, submissions: recentIds.size },
      trend,
      units: unitIds.sort((a, b) => a - b).map(unitRef),
      months: monthSeries(list),
    };
  });
  types.sort((a, b) => b.total - a.total || a.type.localeCompare(b.type));

  const rate = (w: { count: number; submissions: number }) =>
    w.submissions ? w.count / w.submissions : 0;
  const beating = types
    .filter((t) => t.trend === "beating")
    .sort((a, b) => rate(b.before) - rate(b.recent) - (rate(a.before) - rate(a.recent)))
    .slice(0, 3);
  const recurring = types
    .filter((t) => t.trend === "recurring")
    .sort((a, b) => b.recent.count - a.recent.count || b.total - a.total)
    .slice(0, 3);

  const byUnit = new Map<number, ErrorRecord[]>();
  for (const e of input.errors) {
    if (e.unitId !== null) byUnit.set(e.unitId, [...(byUnit.get(e.unitId) ?? []), e]);
  }
  const units: UnitErrors[] = [...byUnit.entries()]
    .map(([id, list]) => ({ ...unitRef(id), total: list.length, months: monthSeries(list) }))
    .sort((a, b) => b.total - a.total || a.unit - b.unit);

  return { submissions: n, recentWindow, months, types, units, beating, recurring };
}

// --- Monthly mirror ------------------------------------------------------------------------

/**
 * The article the mirror re-shows: the first one read in the previous month (the previous
 * mirror period); without one, the first article ever read before the month ends.
 */
export function pickMirrorReading(
  readings: readonly ReadingRecord[],
  month: string,
): ReadingRecord | undefined {
  const prev = monthRange(previousMonth(month));
  const { end } = monthRange(month);
  return (
    readings.find((r) => r.startedAt >= prev.start && r.startedAt < prev.end) ??
    readings.find((r) => r.startedAt < end)
  );
}

/**
 * Words unknown back then (glossed or saved while reading that article) and their state
 * today. "Unknown now" = no mature card for the word (glossed-only words have no evidence).
 */
export function mirrorWords(
  reading: ReadingRecord,
  cards: readonly WordCardRecord[],
): { words: MirrorWord[]; unknownThen: number; unknownNow: number } {
  const phases = wordPhases(cards);
  const seen = new Set<string>();
  const words: MirrorWord[] = [];
  const add = (raw: string) => {
    const word = raw.trim().toLowerCase();
    if (!word || seen.has(word)) return;
    seen.add(word);
    words.push({ word, status: phases.get(word) ?? "not_saved" });
  };
  reading.glossed.forEach(add);
  for (const card of cards) if (card.articleId === reading.articleId) add(card.word);
  return {
    words,
    unknownThen: words.length,
    unknownNow: words.filter((w) => w.status !== "mature").length,
  };
}

export function mirrorArticle(
  reading: ReadingRecord,
  text: string,
  cards: readonly WordCardRecord[],
  now: Date,
): MirrorArticle {
  return {
    articleId: reading.articleId,
    title: reading.title,
    readOn: localDate(reading.startedAt),
    daysAgo: daysBetween(reading.startedAt, now),
    text,
    ...mirrorWords(reading, cards),
  };
}

/**
 * First reviewed post vs the latest one written before the month ends. Mission posts are
 * preferred; texts outside missions (reading retells) count only when there are no posts.
 */
export function compareWriting(
  submissions: readonly SubmissionRecord[],
  errors: readonly ErrorRecord[],
  monthEnd: Date,
): MirrorWriting | null {
  const reviewed = reviewedSubmissions(submissions).filter((s) => s.createdAt < monthEnd);
  const posts = reviewed.some((s) => s.missionId) ? reviewed.filter((s) => s.missionId) : reviewed;
  const first = posts[0];
  if (!first) return null;
  const last = posts.at(-1);
  const toPost = (s: (typeof posts)[number]): MirrorPost => {
    const own = errors.filter((e) => e.submissionId === s.id);
    return {
      submissionId: s.id,
      title: s.title ?? "Reading retell",
      format: s.format,
      writtenOn: localDate(s.createdAt),
      text: s.text,
      scores: s.scores,
      overall: overallOf(s.scores),
      errorCount: own.length,
      errorTypes: [...new Set(own.map((e) => e.type))],
    };
  };
  const firstPost = toPost(first);
  if (!last || last.id === first.id) return { first: firstPost, latest: null, deltas: [] };
  const latest = toPost(last);
  return {
    first: firstPost,
    latest,
    deltas: [
      ...SCORE_DIMENSIONS.map((dimension) => ({
        dimension,
        change: latest.scores[dimension] - firstPost.scores[dimension],
      })),
      { dimension: "overall" as const, change: latest.overall - firstPost.overall },
    ],
  };
}

export function mirrorUnits(units: readonly UnitRecord[], month: string): MirrorUnit[] {
  const { start, end } = monthRange(month);
  return units
    .flatMap((u) =>
      u.completedAt && u.completedAt >= start && u.completedAt < end
        ? [{ unit: u.id, title: u.title, completedOn: localDate(u.completedAt), canDo: u.canDo }]
        : [],
    )
    .sort((a, b) => a.completedOn.localeCompare(b.completedOn) || a.unit - b.unit);
}

/**
 * Mirror-due rule: the current month's mirror is due when it has not been seen yet
 * (no `mirror_viewed`/`mirror_reflection` event for the month) and the first learning event
 * is at least 14 days old.
 */
export function mirrorDue(
  now: Date,
  firstEventAt: Date | undefined,
  seenMonths: ReadonlySet<string>,
): MirrorDueResponse {
  const month = monthOf(now);
  const historyDays = firstEventAt ? daysBetween(firstEventAt, now) : 0;
  if (seenMonths.has(month)) return { due: false, month, reason: "already_seen", historyDays };
  if (historyDays < MIRROR_MIN_HISTORY_DAYS) {
    return { due: false, month, reason: "not_enough_history", historyDays };
  }
  return { due: true, month, reason: "due", historyDays };
}
