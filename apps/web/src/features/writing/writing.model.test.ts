import { describe, expect, it } from "vitest";
import { errorStatusLabel, sparklinePoints } from "./writing.model.ts";

describe("sparklinePoints", () => {
  it("maps 0–100 scores onto the box, oldest on the left", () => {
    expect(sparklinePoints([0, 50, 100], 100, 40)).toBe("0,40 50,20 100,0");
  });

  it("centers a single score and returns nothing without scores", () => {
    expect(sparklinePoints([75], 100, 40)).toBe("50,10");
    expect(sparklinePoints([], 100, 40)).toBe("");
  });
});

describe("errorStatusLabel", () => {
  it("names every status", () => {
    expect(errorStatusLabel("open")).toBe("To fix");
    expect(errorStatusLabel("fixed")).toBe("Fixed");
    expect(errorStatusLabel("changed")).toBe("Changed, still wrong");
    expect(errorStatusLabel("remaining")).toBe("Not changed yet");
  });
});
