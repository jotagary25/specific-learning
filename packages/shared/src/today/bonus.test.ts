import { describe, expect, it } from "vitest";
import { bonusAllowed, bonusTotalValid, isWeekend } from "./bonus.ts";

describe("bonus rule", () => {
  it("allows one 5-min bonus on weekdays", () => {
    expect(bonusAllowed(false, 0)).toBe(true);
    expect(bonusAllowed(false, 5)).toBe(false);
    expect(bonusTotalValid(false, 5)).toBe(true);
    expect(bonusTotalValid(false, 10)).toBe(false);
  });

  it("allows repeated bonuses on weekends up to the cap", () => {
    expect(bonusAllowed(true, 5)).toBe(true);
    expect(bonusAllowed(true, 30)).toBe(true);
    expect(bonusAllowed(true, 120)).toBe(false);
    expect(bonusTotalValid(true, 30)).toBe(true);
    expect(bonusTotalValid(true, 125)).toBe(false);
  });

  it("rejects bonuses that are not 5-min steps", () => {
    expect(bonusTotalValid(true, 3)).toBe(false);
    expect(bonusTotalValid(false, -5)).toBe(false);
  });

  it("detects weekends in local time", () => {
    expect(isWeekend(new Date(2026, 9, 24, 10))).toBe(true); // Saturday
    expect(isWeekend(new Date(2026, 9, 25, 10))).toBe(true); // Sunday
    expect(isWeekend(new Date(2026, 9, 26, 10))).toBe(false); // Monday
  });
});
