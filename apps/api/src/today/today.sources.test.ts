import type { UnitListEntry } from "@english-course/shared";
import { describe, expect, it } from "vitest";
import type { SessionRecord as ReadingSession } from "../reading/reading.store.ts";
import { createTodaySources, pickCurrentUnit, type TodaySourcesDeps } from "./today.sources.ts";

const entry = (number: number, over: Partial<UnitListEntry> = {}): UnitListEntry => ({
  number,
  title: `Unit ${number}`,
  subtitle: "",
  status: "not-started",
  score: null,
  priority: false,
  ...over,
});

describe("pickCurrentUnit", () => {
  it("prefers a unit raised by writing errors, even a completed one", () => {
    const units = [
      entry(1, { status: "completed" }),
      entry(2),
      entry(4, { priority: true, status: "completed" }),
    ];
    expect(pickCurrentUnit(units)?.number).toBe(4);
  });

  it("otherwise picks the lowest unit not completed", () => {
    const units = [
      entry(3),
      entry(1, { status: "completed" }),
      entry(2, { status: "in-progress" }),
    ];
    expect(pickCurrentUnit(units)?.number).toBe(2);
  });

  it("returns nothing when every unit is completed", () => {
    expect(pickCurrentUnit([entry(1, { status: "completed" })])).toBeUndefined();
  });
});

describe("recall pending", () => {
  const session = (entries: ReadingSession["entries"], completed = true): ReadingSession => ({
    id: "s",
    articleId: "a",
    prediction: null,
    opinion: null,
    entries,
    spots: [],
    completedAt: completed ? new Date() : null,
  });

  const sourcesWith = (readingSession: ReadingSession | undefined) => {
    const deps: TodaySourcesDeps = {
      units: {
        list: async () => ({ blocks: [] }),
        detail: async () => Promise.reject(new Error()),
      },
      reading: { today: async () => ({ date: "2026-10-26", reading: null, editorEnabled: true }) },
      readingStore: {
        getArticleForDate: async (_userId, date) =>
          date === "2026-10-25" ? ({ id: "a" } as never) : undefined,
        getSession: async () => readingSession,
      },
      vocabulary: {
        stats: async () => ({ dueToday: 0, newAvailable: 9, newToday: 3 }) as never,
        queue: async () => ({ cards: [], dueRemaining: 0, newPerDay: 5, newToday: 3 }),
      },
      writing: { current: async () => ({ mission: null, submission: null }) as never },
    };
    return createTodaySources(deps);
  };
  const now = new Date(Date.UTC(2026, 9, 26, 7));
  const question = { question: "What did bees do?", expected: "Dance" } as never;

  it.each([
    ["no session for yesterday's article", undefined, false],
    ["yesterday's article not finished", session([], false), false],
    ["finished, recall not started", session([]), true],
    [
      "questions partly answered",
      session([
        { type: "recall-questions", questions: [question, question] },
        { type: "recall-answer", qid: 0, answer: "x", grade: null },
      ]),
      true,
    ],
    [
      "all questions answered",
      session([
        { type: "recall-questions", questions: [question] },
        { type: "recall-answer", qid: 0, answer: "x", grade: null },
      ]),
      false,
    ],
  ] as const)("%s", async (_, readingSession, expected) => {
    const state = await sourcesWith(readingSession as ReadingSession | undefined).state(
      "test-user",
      now,
      "UTC",
    );
    expect(state.recallPending).toBe(expected);
    // New cards are limited by what is left of today's allowance (5 per day, 3 used).
    expect(state.srs).toEqual({ due: 0, fresh: 2 });
    expect(state.unit).toBeNull();
  });

  it("reads yesterday in the user's zone", async () => {
    // 02:00 UTC on the 26th is the 25th in La Paz: yesterday there is the 24th (no article).
    const sources = sourcesWith(session([]));
    const at = new Date("2026-10-26T02:00:00Z");
    expect((await sources.state("test-user", at, "UTC")).recallPending).toBe(true);
    expect((await sources.state("test-user", at, "America/La_Paz")).recallPending).toBe(false);
  });
});
