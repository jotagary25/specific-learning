import { describe, expect, it } from "vitest";
import { isMature, isNew, parseState, phaseOf, review, scheduleNew, storedState } from "./srs.ts";

const NOW = new Date("2026-10-25T13:00:00.000Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe("srs", () => {
  it("treats {} as a new, unscheduled card", () => {
    expect(isNew({})).toBe(true);
    expect(phaseOf({})).toBe("new");
    expect(isNew(scheduleNew(NOW).state)).toBe(true);
    expect(scheduleNew(NOW).due.getTime()).toBe(NOW.getTime());
  });

  it("schedules a new card rated Good into the future", () => {
    const next = review({}, 3, NOW);
    expect(next.due.getTime()).toBeGreaterThan(NOW.getTime());
    expect(next.state.reps).toBe(1);
    expect(isNew(next.state)).toBe(false);
  });

  it("keeps a card rated Again in learning, due within minutes", () => {
    const next = review({}, 1, NOW);
    expect(phaseOf(next.state)).toBe("learning");
    expect(next.due.getTime() - NOW.getTime()).toBeLessThanOrEqual(10 * MINUTE);
  });

  it("grows the interval with repeated Good reviews and becomes mature", () => {
    let current = review({}, 3, NOW);
    let now = NOW;
    for (let i = 0; i < 8; i++) {
      now = current.due;
      current = review(current.state, 3, now);
    }
    expect(phaseOf(current.state)).toBe("review");
    expect(current.due.getTime() - now.getTime()).toBeGreaterThan(21 * DAY);
    expect(isMature(current.state)).toBe(true);
  });

  it("round-trips the state through JSON with ISO dates", () => {
    const first = review({}, 3, NOW);
    const stored = JSON.parse(JSON.stringify(first.state));
    expect(typeof stored.due).toBe("string");
    expect(parseState(stored)).toEqual(first.state);
    const again = review(parseState(stored), 3, first.due);
    expect(again.state.reps).toBe(2);
    expect(again.due.getTime()).toBeGreaterThan(first.due.getTime());
  });

  it("reads null, legacy {} and junk as a new card and drops a legacy suspended flag", () => {
    expect(parseState(null)).toEqual({});
    expect(parseState({})).toEqual({});
    expect(parseState({ foo: 1 })).toEqual({});
    expect(isNew(parseState({ suspended: true }))).toBe(true);
    const scheduled = JSON.parse(JSON.stringify(review({}, 3, NOW).state));
    expect(parseState({ ...scheduled, suspended: true })).not.toHaveProperty("suspended");
  });

  it("stores a new card as null and a scheduled one as its FSRS fields", () => {
    expect(storedState({})).toBeNull();
    const next = review({}, 3, NOW).state;
    expect(storedState(next)).toEqual(next);
  });
});
