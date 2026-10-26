import { type PlanBlockKind, TodayPlan } from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { daypartOf, type PlannerSnapshot, planToday, suggestMode } from "./planner.ts";

// 2026-10-26 is a Monday. Dates are built in local time, so the tests do not depend on TZ.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
const MON = 26;
const TUE = 27;
const SAT = 31;
const SUN = 25;

const base = (over: Partial<PlannerSnapshot> = {}): PlannerSnapshot => ({
  now: at(MON, 6, 30),
  mode: "full",
  srs: { due: 12, fresh: 3 },
  reading: { title: "Why bees dance", step: "predict" },
  recallPending: false,
  unit: {
    number: 2,
    title: "Present simple",
    nextStep: "exercises",
    itemsLeft: 14,
    priority: false,
    completed: false,
  },
  writing: { missionOpen: false, title: null, daysSinceLastWork: null, writingDay: 6 },
  sessionsDoneToday: 0,
  ...over,
});

const unit = (over: Partial<NonNullable<PlannerSnapshot["unit"]>> = {}) => ({
  ...(base().unit as NonNullable<PlannerSnapshot["unit"]>),
  ...over,
});

const kinds = (snapshot: PlannerSnapshot) => planToday(snapshot).blocks.map((b) => b.kind);
const total = (snapshot: PlannerSnapshot) =>
  planToday(snapshot).blocks.reduce((sum, b) => sum + b.minutes, 0);

const nothingPending: Partial<PlannerSnapshot> = {
  srs: { due: 0, fresh: 0 },
  reading: null,
  recallPending: false,
  unit: null,
};

describe("daypartOf / suggestMode", () => {
  it.each([
    [6, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [16, "afternoon"],
    [17, "evening"],
    [23, "evening"],
    [2, "evening"],
  ] as const)("%i:00 is %s", (hour, part) => {
    expect(daypartOf(at(MON, hour))).toBe(part);
  });

  it.each([
    [at(MON, 6), 0, "full"],
    [at(MON, 6), 1, "minimum"],
    [at(MON, 14), 0, "slump"],
    [at(MON, 14), 2, "slump"],
    [at(MON, 21), 0, "slump"],
    [at(MON, 21), 1, "minimum"],
  ] as const)("suggests the mode for %s with %i sessions done", (now, done, mode) => {
    expect(suggestMode(now, done)).toBe(mode);
  });
});

describe("planToday invariants", () => {
  const nows = [at(MON, 6), at(MON, 14), at(MON, 21), at(SAT, 9), at(SUN, 15)];
  const modes = ["full", "slump", "minimum"] as const;
  const states: Array<[string, Partial<PlannerSnapshot>]> = [
    ["default", {}],
    ["nothing pending", nothingPending],
    ["only srs", { ...nothingPending, srs: { due: 2, fresh: 0 } }],
    ["only recall", { ...nothingPending, recallPending: true }],
    [
      "open mission",
      {
        writing: { missionOpen: true, title: "A tweet", daysSinceLastWork: 3, writingDay: 6 },
      },
    ],
  ];
  const budgets = { full: 25, slump: 10, minimum: 5 };

  for (const now of nows) {
    for (const mode of modes) {
      for (const [label, over] of states) {
        it(`${now.toString().slice(0, 21)} × ${mode} × ${label}`, () => {
          const plan = planToday(base({ ...over, now, mode }));
          expect(TodayPlan.parse(plan)).toEqual(plan);
          expect(plan.budgetMin).toBe(budgets[mode]);
          expect(plan.blocks.reduce((s, b) => s + b.minutes, 0)).toBe(budgets[mode]);
          expect(plan.blocks.length).toBeGreaterThanOrEqual(1);
          expect(plan.blocks.length).toBeLessThanOrEqual(3);
          for (const block of plan.blocks) expect(block.minutes).toBeGreaterThanOrEqual(3);
          if (mode === "minimum") expect(plan.blocks).toHaveLength(1);
        });
      }
    }
  }
});

describe("morning deep block (full mode before 12:00)", () => {
  const cases: Array<[string, Partial<PlannerSnapshot>, PlanBlockKind[]]> = [
    ["Monday: unit main with SRS warm-up", { now: at(MON, 6) }, ["vocabulary", "unit", "reading"]],
    ["Tuesday: reading main", { now: at(TUE, 6) }, ["vocabulary", "reading", "unit"]],
    [
      "Tuesday, article already read: unit main",
      { now: at(TUE, 6), reading: { title: "Bees", step: "done" } },
      ["vocabulary", "unit"],
    ],
    [
      "Saturday (writing day): writing main",
      { now: at(SAT, 7) },
      ["vocabulary", "writing", "unit"],
    ],
    [
      "open mission idle for 2 days: writing main",
      {
        writing: { missionOpen: true, title: "A thread", daysSinceLastWork: 2, writingDay: 6 },
      },
      ["vocabulary", "writing", "unit"],
    ],
    [
      "open mission worked yesterday: unit main",
      {
        writing: { missionOpen: true, title: "A thread", daysSinceLastWork: 1, writingDay: 6 },
      },
      ["vocabulary", "unit", "reading"],
    ],
    ["no cards due: no warm-up", { srs: { due: 0, fresh: 4 } }, ["unit", "reading", "vocabulary"]],
    [
      "a second session today shifts the rotation",
      { now: at(MON, 10), sessionsDoneToday: 1 },
      ["vocabulary", "reading", "unit"],
    ],
    [
      "recall pending is the light secondary",
      { recallPending: true },
      ["vocabulary", "unit", "recall"],
    ],
  ];

  it.each(cases)("%s", (_, over, expected) => {
    expect(kinds(base(over))).toEqual(expected);
    expect(total(base(over))).toBe(25);
  });

  it("keeps the warm-up at 3–5 minutes and gives the main task the most time", () => {
    const [warmUp, main] = planToday(base()).blocks;
    expect(warmUp?.minutes).toBeGreaterThanOrEqual(3);
    expect(warmUp?.minutes).toBeLessThanOrEqual(5);
    expect(main?.minutes).toBeGreaterThanOrEqual(12);
  });

  it("deep-links the unit to its next step", () => {
    const unit = planToday(base()).blocks.find((b) => b.kind === "unit");
    expect(unit?.deepLink).toBe("/units/2?step=exercises");
    expect(unit?.title).toContain("Unit 2");
  });

  it("explains a unit raised by writing errors", () => {
    const plan = planToday(
      base({ unit: unit({ priority: true, completed: true, nextStep: "exercises" }) }),
    );
    expect(plan.blocks.find((b) => b.kind === "unit")?.reason).toMatch(/writing errors/i);
  });
});

describe("afternoon slump (12:00–17:00)", () => {
  const cases: Array<[string, Partial<PlannerSnapshot>, PlanBlockKind[]]> = [
    ["SRS + article", { now: at(MON, 14), mode: "slump" }, ["vocabulary", "reading"]],
    [
      "SRS + recall when the article is done",
      {
        now: at(MON, 14),
        mode: "slump",
        reading: { title: "Bees", step: "done" },
        recallPending: true,
      },
      ["vocabulary", "recall"],
    ],
    [
      "full mode in the afternoon stays light, then the unit",
      { now: at(MON, 14), mode: "full" },
      ["vocabulary", "reading", "unit"],
    ],
    [
      "nothing light pending: the unit",
      { now: at(MON, 14), mode: "slump", srs: { due: 0, fresh: 0 }, reading: null },
      ["unit"],
    ],
  ];

  it.each(cases)("%s", (_, over, expected) => {
    expect(kinds(base(over))).toEqual(expected);
  });

  it("caps the SRS block at 10 cards", () => {
    const srs = planToday(base({ now: at(MON, 14), mode: "slump", srs: { due: 40, fresh: 5 } }))
      .blocks[0];
    expect(srs?.kind).toBe("vocabulary");
    expect(srs?.title).toBe("Review 10 cards");
    expect(srs?.minutes).toBeLessThanOrEqual(5);
  });
});

describe("evening (from 17:00)", () => {
  const cases: Array<[string, Partial<PlannerSnapshot>, PlanBlockKind[]]> = [
    [
      "recall + SRS",
      { now: at(MON, 21), mode: "slump", recallPending: true },
      ["recall", "vocabulary"],
    ],
    ["SRS only, no unit", { now: at(MON, 21), mode: "slump" }, ["vocabulary"]],
    [
      "unit only when it is the only pending thing",
      { now: at(MON, 21), mode: "slump", srs: { due: 0, fresh: 0 }, reading: null },
      ["unit"],
    ],
  ];

  it.each(cases)("%s", (_, over, expected) => {
    expect(kinds(base(over))).toEqual(expected);
  });
});

describe("minimum mode (5 min)", () => {
  const cases: Array<[string, Partial<PlannerSnapshot>, PlanBlockKind, string]> = [
    ["SRS when cards are due", {}, "vocabulary", "/vocabulary"],
    [
      "else the current unit's exercises",
      { srs: { due: 0, fresh: 5 }, unit: unit({ nextStep: "story" }) },
      "unit",
      "/units/2?step=exercises",
    ],
    [
      "else recall",
      { srs: { due: 0, fresh: 0 }, unit: null, recallPending: true },
      "recall",
      "/reading",
    ],
    ["else free practice", nothingPending, "unit", "/units"],
  ];

  it.each(cases)("%s", (_, over, kind, link) => {
    for (const now of [at(MON, 6), at(MON, 14), at(MON, 22)]) {
      const plan = planToday(base({ ...over, now, mode: "minimum" }));
      expect(plan.blocks).toHaveLength(1);
      expect(plan.blocks[0]?.kind).toBe(kind);
      expect(plan.blocks[0]?.deepLink).toBe(link);
      expect(plan.blocks[0]?.minutes).toBe(5);
    }
  });
});
