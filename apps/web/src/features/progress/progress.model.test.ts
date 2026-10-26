import { describe, expect, it } from "vitest";
import {
  errorTypeLabel,
  highlightSegments,
  minutesLabel,
  monthName,
  shiftMonth,
  signed,
} from "./progress.model.ts";

describe("progress model", () => {
  it("shifts months across years and names them", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthName("2026-10")).toBe("October 2026");
  });

  it("formats minutes, signed changes and error types", () => {
    expect(minutesLabel(45)).toBe("45 min");
    expect(minutesLabel(60)).toBe("1 h");
    expect(minutesLabel(75)).toBe("1 h 15 min");
    expect(signed(12)).toBe("+12");
    expect(signed(-3)).toBe("−3");
    expect(signed(0)).toBe("±0");
    expect(errorTypeLabel("third_person_s")).toBe("Third person s");
  });

  it("highlights whole words only, case-insensitively", () => {
    const segments = highlightSegments("Wield it; they wielded power. Loom looms.", [
      { word: "wield", status: "mature" },
      { word: "loom", status: "not_saved" },
    ]);
    expect(segments.filter((s) => s.status).map((s) => [s.text, s.status])).toEqual([
      ["Wield", "mature"],
      ["Loom", "not_saved"],
    ]);
    expect(segments.map((s) => s.text).join("")).toBe("Wield it; they wielded power. Loom looms.");
  });

  it("returns the plain text without words", () => {
    expect(highlightSegments("Plain.", [])).toEqual([{ text: "Plain.", status: null }]);
  });
});
