// Today planner (spec §3.1, methodology §4 "daily rhythm"). Pure: the caller gathers a
// snapshot of the learner's state; this module turns it into an ordered, time-boxed plan.
//
// Rules:
// - Dayparts (local time in the user's zone): morning 05:00–11:59, afternoon 12:00–16:59,
//   evening otherwise.
// - Mode suggestion: morning → `full` (`minimum` once a session is done today); afternoon →
//   `slump`; evening → `slump` (`minimum` once a session is done today).
// - Profile: `minimum` mode → one block; `full` in the morning → deep; evening → evening;
//   everything else (afternoon, or `slump` in the morning) → light.
// - Deep: an SRS warm-up (3–5 min) when reviews are due, then the main task, then secondaries.
//   Main task: writing when a mission is open and idle ≥2 days (or never worked), or on the
//   weekly writing day (default Saturday, in the user's zone); otherwise rotate by day: odd turns → unit (default),
//   even turns → today's article if unread. Turn = weekday + sessions already done today, so a
//   second session the same morning switches the main task. Secondaries, in order: yesterday's
//   recall, the unit, today's article (light), new SRS cards (when there was no warm-up).
// - Light: SRS (≤10 cards), today's article (light) or recall, then the unit if time is left.
// - Evening: recall + SRS; today's article if nothing else; the unit only when it is the only
//   pending thing.
// - Minimum (5 min): SRS if reviews are due, else the current unit's exercises, else recall.
// - Always: 1–3 blocks, each ≥3 min, minutes sum to the budget, never zero blocks (free
//   practice on /units when nothing is pending).

import {
  type Daypart,
  MODE_MINUTES,
  type PlanBlock,
  type ReadingStep,
  type TodayMode,
  type TodayPlan,
  type UnitStep,
} from "@english-course/shared";
import { localHour, localWeekday } from "../shared/clock.ts";

export type PlannerSnapshot = {
  now: Date;
  /** The user's IANA zone: dayparts and weekdays are read in it. */
  timeZone: string;
  mode: TodayMode;
  /** Reviews due today and new cards still allowed today. */
  srs: { due: number; fresh: number };
  /** Today's article; `null` when the editor has not picked one. */
  reading: { title: string; step: ReadingStep } | null;
  /** Yesterday's article was finished and its recall is not done. */
  recallPending: boolean;
  /** Priority unit (raised by writing errors) or the lowest unit not completed. */
  unit: {
    number: number;
    title: string;
    nextStep: UnitStep;
    itemsLeft: number;
    priority: boolean;
    completed: boolean;
  } | null;
  writing: {
    missionOpen: boolean;
    title: string | null;
    /** Whole days since the last writing activity; `null` = never. */
    daysSinceLastWork: number | null;
    /** Weekly writing day, 0 = Sunday … 6 = Saturday. */
    writingDay: number;
  };
  sessionsDoneToday: number;
};

export const MAX_BLOCKS = 3;
export const MIN_BLOCK_MIN = 3;
const SRS_SESSION_CARDS = 10;
const CARDS_PER_MIN = 2;
const WRITING_IDLE_DAYS = 2;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function daypartOf(now: Date, timeZone: string): Daypart {
  const hour = localHour(now, timeZone);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

export function suggestMode(now: Date, timeZone: string, sessionsDoneToday: number): TodayMode {
  const part = daypartOf(now, timeZone);
  if (part === "afternoon") return "slump";
  if (sessionsDoneToday > 0) return "minimum";
  return part === "morning" ? "full" : "slump";
}

/** A block before fitting: it takes `min` minutes, grows to `ideal`, then to `max`. */
type Candidate = Omit<PlanBlock, "minutes"> & { min: number; ideal: number; max: number };

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);

function srsBlock(s: PlannerSnapshot, maxMin: number, warmUp = false): Candidate | undefined {
  const cards = Math.min(s.srs.due + s.srs.fresh, SRS_SESSION_CARDS);
  if (cards === 0) return undefined;
  const ideal = clamp(Math.ceil(cards / CARDS_PER_MIN), MIN_BLOCK_MIN, maxMin);
  const reason =
    s.srs.due > 0
      ? `${s.srs.due} review${s.srs.due === 1 ? "" : "s"} due${warmUp ? ": a quick warm-up" : ""}`
      : `${s.srs.fresh} new word${s.srs.fresh === 1 ? "" : "s"} ready`;
  return {
    kind: "vocabulary",
    title: `Review ${cards} card${cards === 1 ? "" : "s"}`,
    deepLink: "/vocabulary",
    reason,
    min: MIN_BLOCK_MIN,
    ideal,
    max: maxMin,
  };
}

const articleUnread = (s: PlannerSnapshot) => s.reading !== null && s.reading.step !== "done";

function readingBlock(s: PlannerSnapshot, size: "main" | "light"): Candidate | undefined {
  if (!s.reading || !articleUnread(s)) return undefined;
  const started = s.reading.step !== "predict";
  const reason = started
    ? `Continue today's article at the ${s.reading.step} step`
    : size === "main"
      ? "Today's article is waiting: the full active-reading flow"
      : "Today's article: read it with the glossary, no pressure";
  return {
    kind: "reading",
    title: `Read: ${s.reading.title}`,
    deepLink: "/reading",
    reason,
    ...(size === "main" ? { min: 8, ideal: 15, max: 60 } : { min: 3, ideal: 6, max: 60 }),
  };
}

function recallBlock(s: PlannerSnapshot): Candidate | undefined {
  if (!s.recallPending) return undefined;
  return {
    kind: "recall",
    title: "Recall yesterday's article",
    deepLink: "/reading",
    reason: "Retrieving it a day later is what makes it stick",
    min: MIN_BLOCK_MIN,
    ideal: MIN_BLOCK_MIN,
    max: 5,
  };
}

const STEP_LABELS: Record<UnitStep, string> = {
  story: "the story chapter",
  puzzle: "the puzzle",
  theory: "the theory",
  timeline: "the timeline",
  exercises: "the exercises",
};

function unitBlock(
  s: PlannerSnapshot,
  size: "main" | "secondary",
  step?: UnitStep,
): Candidate | undefined {
  if (!s.unit) return undefined;
  const next = step ?? s.unit.nextStep;
  const left =
    s.unit.itemsLeft > 0 && next === "exercises" ? ` (${s.unit.itemsLeft} items left)` : "";
  const reason = s.unit.priority
    ? `Raised by your writing errors: review ${STEP_LABELS[next]}${left}`
    : `Next: ${STEP_LABELS[next]}${left}`;
  return {
    kind: "unit",
    title: `Unit ${s.unit.number}: ${s.unit.title}`,
    deepLink: `/units/${s.unit.number}?step=${next}`,
    reason,
    ...(size === "main" ? { min: 8, ideal: 15, max: 60 } : { min: 5, ideal: 6, max: 60 }),
  };
}

function writingDue(s: PlannerSnapshot): "idle" | "day" | undefined {
  const w = s.writing;
  if (w.missionOpen && (w.daysSinceLastWork === null || w.daysSinceLastWork >= WRITING_IDLE_DAYS)) {
    return "idle";
  }
  return localWeekday(s.now, s.timeZone) === w.writingDay ? "day" : undefined;
}

function writingBlock(s: PlannerSnapshot, why: "idle" | "day"): Candidate {
  const w = s.writing;
  const reason =
    why === "day"
      ? `${WEEKDAYS[w.writingDay]} is your writing day`
      : w.daysSinceLastWork === null
        ? "Your writing mission has not been started yet"
        : `No writing for ${w.daysSinceLastWork} days: keep the mission moving`;
  return {
    kind: "writing",
    title: w.missionOpen && w.title ? `Write: ${w.title}` : "Start this week's writing mission",
    deepLink: "/writing",
    reason,
    min: 8,
    ideal: 15,
    max: 60,
  };
}

function freePractice(): Candidate {
  return {
    kind: "unit",
    title: "Free practice",
    deepLink: "/units",
    reason: "Nothing is pending: pick any unit you enjoyed and redo its exercises",
    min: MIN_BLOCK_MIN,
    ideal: 60,
    max: 60,
  };
}

const present = (list: Array<Candidate | undefined>): Candidate[] =>
  list.filter((c): c is Candidate => c !== undefined);

function deepCandidates(s: PlannerSnapshot): Candidate[] {
  const warmUp = s.srs.due > 0 ? srsBlock(s, 5, true) : undefined;
  const writing = writingDue(s);
  const unitTurn = (localWeekday(s.now, s.timeZone) + s.sessionsDoneToday) % 2 === 1;
  const main =
    (writing ? writingBlock(s, writing) : undefined) ??
    (unitTurn
      ? (unitBlock(s, "main") ?? readingBlock(s, "main"))
      : (readingBlock(s, "main") ?? unitBlock(s, "main"))) ??
    (s.writing.missionOpen ? writingBlock(s, "idle") : undefined) ??
    srsBlock(s, 60);
  const secondaries = present([
    recallBlock(s),
    main?.kind === "unit" ? undefined : unitBlock(s, "secondary"),
    main?.kind === "reading" ? undefined : readingBlock(s, "light"),
    warmUp || main?.kind === "vocabulary" ? undefined : srsBlock(s, 8),
  ]);
  return present([warmUp, main, ...secondaries]);
}

function lightCandidates(s: PlannerSnapshot): Candidate[] {
  return present([
    srsBlock(s, 5),
    readingBlock(s, "light"),
    recallBlock(s),
    unitBlock(s, "secondary"),
  ]);
}

function eveningCandidates(s: PlannerSnapshot): Candidate[] {
  const light = present([recallBlock(s), srsBlock(s, 5)]);
  if (light.length > 0) return light;
  return present([readingBlock(s, "light") ?? unitBlock(s, "secondary")]);
}

function minimumCandidate(s: PlannerSnapshot): Candidate | undefined {
  if (s.srs.due > 0) return srsBlock(s, 5);
  return unitBlock(s, "secondary", "exercises") ?? recallBlock(s);
}

/** Picks up to 3 candidates whose minimums fit, then grows them to ideal, then to max. */
function fitToBudget(budget: number, candidates: Candidate[]): PlanBlock[] {
  const picked: Candidate[] = [];
  let used = 0;
  for (const c of candidates) {
    if (picked.length === MAX_BLOCKS) break;
    if (used + c.min > budget) continue;
    picked.push(c);
    used += c.min;
  }
  if (picked.length === 0) picked.push({ ...freePractice(), min: budget });

  const minutes = picked.map((c) => c.min);
  let left = budget - minutes.reduce((sum, m) => sum + m, 0);
  for (const limit of ["ideal", "max"] as const) {
    picked.forEach((c, i) => {
      const grow = Math.min(left, Math.max(0, c[limit] - (minutes[i] ?? 0)));
      minutes[i] = (minutes[i] ?? 0) + grow;
      left -= grow;
    });
  }
  // Budget still left (few short blocks): the first block absorbs it.
  minutes[0] = (minutes[0] ?? 0) + left;

  return picked.map(({ min: _, ideal: __, max: ___, ...block }, i) => ({
    ...block,
    minutes: minutes[i] ?? MIN_BLOCK_MIN,
  }));
}

export function planToday(s: PlannerSnapshot): TodayPlan {
  const budgetMin = MODE_MINUTES[s.mode];
  const part = daypartOf(s.now, s.timeZone);
  let candidates: Candidate[];
  if (s.mode === "minimum") {
    candidates = present([minimumCandidate(s)]).slice(0, 1);
  } else if (part === "morning" && s.mode === "full") {
    candidates = deepCandidates(s);
  } else if (part === "evening") {
    candidates = eveningCandidates(s);
  } else {
    candidates = lightCandidates(s);
  }
  if (candidates.length === 0) candidates = [freePractice()];
  return { mode: s.mode, budgetMin, blocks: fitToBudget(budgetMin, candidates) };
}
