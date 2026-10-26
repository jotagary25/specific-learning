import { describe, expect, it } from "vitest";
import {
  ADVANCE_AFTER,
  ADVANCE_MIN_AVERAGE,
  formatForLevel,
  lengthStatus,
  levelProgress,
  overallScore,
} from "./format.ts";

describe("writing formats", () => {
  it("maps levels 1–4 to tweet → thread → linkedin → article and clamps others", () => {
    expect([1, 2, 3, 4].map(formatForLevel)).toEqual(["tweet", "thread", "linkedin", "article"]);
    expect(formatForLevel(0)).toBe("tweet");
    expect(formatForLevel(9)).toBe("article");
  });

  it("flags texts outside the word range and tweets over 280 characters", () => {
    const limits = { minWords: 3, maxWords: 5, maxChars: 20 };
    expect(lengthStatus("one two", limits).state).toBe("short");
    expect(lengthStatus("one two three", limits).state).toBe("ok");
    expect(lengthStatus("one two three four five six", limits).state).toBe("long");
    expect(lengthStatus("abcdefghij abcdefghijk", { ...limits, minWords: 1 }).state).toBe("long");
  });

  it("averages the four scores into the overall score", () => {
    expect(overallScore({ grammar: 70, clarity: 80, vocabulary: 75, naturalness: 76 })).toBe(75);
  });
});

describe("level progression", () => {
  it(`advances after ${ADVANCE_AFTER} completed missions in the format averaging ≥ ${ADVANCE_MIN_AVERAGE}`, () => {
    expect(levelProgress(1, [80, 75, 70]).advance).toBe(true);
    expect(levelProgress(1, [80, 75]).advance).toBe(false);
    expect(levelProgress(1, [80, 70, 70]).advance).toBe(false);
  });

  it("uses only the latest three scores (newest first)", () => {
    expect(levelProgress(2, [90, 90, 90, 10]).advance).toBe(true);
    expect(levelProgress(2, [10, 90, 90, 90]).advance).toBe(false);
  });

  it("never advances past the last level and reports the running average", () => {
    expect(levelProgress(4, [100, 100, 100]).advance).toBe(false);
    expect(levelProgress(1, [80, 70])).toMatchObject({ completed: 2, needed: 3, average: 75 });
    expect(levelProgress(1, []).average).toBeNull();
  });
});
