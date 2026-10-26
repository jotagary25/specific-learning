import { describe, expect, it } from "vitest";
import type { TimelineExpected } from "../content/index.ts";
import { checkTimelinePlacement } from "./timeline.ts";

const ongoing: TimelineExpected = { kind: "ongoing-now", start: -0.2, end: 0.2 };
const span: TimelineExpected = { kind: "span", start: -0.6, end: -0.3 };
const interrupted: TimelineExpected = {
  kind: "interrupted",
  start: -0.7,
  end: -0.4,
  interruptAt: -0.55,
};

describe("checkTimelinePlacement", () => {
  it("accepts a placement of the same kind with every handle inside the tolerance", () => {
    const result = checkTimelinePlacement(ongoing, 0.15, {
      kind: "ongoing-now",
      start: -0.3,
      end: 0.1,
    });
    expect(result).toEqual({
      correct: true,
      kindCorrect: true,
      handles: { start: true, end: true },
    });
  });

  it("rejects a different kind even when the handles match", () => {
    const result = checkTimelinePlacement(ongoing, 0.15, { kind: "state", start: -0.2, end: 0.2 });
    expect(result.correct).toBe(false);
    expect(result.kindCorrect).toBe(false);
  });

  it("flags each handle that is outside the tolerance", () => {
    const result = checkTimelinePlacement(span, 0.2, { kind: "span", start: -0.95, end: -0.35 });
    expect(result.correct).toBe(false);
    expect(result.handles).toEqual({ start: false, end: true });
  });

  it("treats the tolerance boundary as inclusive", () => {
    const result = checkTimelinePlacement(span, 0.2, { kind: "span", start: -0.8, end: -0.1 });
    expect(result.correct).toBe(true);
  });

  it("checks only the start of a point", () => {
    const point: TimelineExpected = { kind: "point", start: -0.5 };
    expect(checkTimelinePlacement(point, 0.2, { kind: "point", start: -0.4 }).correct).toBe(true);
    expect(checkTimelinePlacement(point, 0.2, { kind: "point", start: 0.1 }).handles).toEqual({
      start: false,
    });
  });

  it("requires an ongoing-now action to still be running at now", () => {
    // Inside the tolerance, but the learner finished it before now.
    const result = checkTimelinePlacement(ongoing, 0.3, {
      kind: "ongoing-now",
      start: -0.2,
      end: -0.05,
    });
    expect(result.correct).toBe(false);
    expect(result.handles.end).toBe(false);
  });

  it("requires a span to be finished before now", () => {
    const result = checkTimelinePlacement(span, 0.4, { kind: "span", start: -0.6, end: 0.05 });
    expect(result.correct).toBe(false);
    expect(result.handles.end).toBe(false);
  });

  it("checks the interruption point and keeps it inside the action", () => {
    expect(
      checkTimelinePlacement(interrupted, 0.2, {
        kind: "interrupted",
        start: -0.65,
        end: -0.4,
        interruptAt: -0.5,
      }).correct,
    ).toBe(true);
    const missing = checkTimelinePlacement(interrupted, 0.2, {
      kind: "interrupted",
      start: -0.65,
      end: -0.4,
    });
    expect(missing.handles.interruptAt).toBe(false);
    const outside = checkTimelinePlacement(interrupted, 0.2, {
      kind: "interrupted",
      start: -0.6,
      end: -0.45,
      interruptAt: -0.4,
    });
    expect(outside.correct).toBe(false);
  });

  it("swaps reversed handles before checking", () => {
    const result = checkTimelinePlacement(span, 0.2, { kind: "span", start: -0.3, end: -0.6 });
    expect(result.correct).toBe(true);
  });

  it("treats a missing end as wrong for kinds that need one", () => {
    const result = checkTimelinePlacement(span, 0.2, { kind: "span", start: -0.6 });
    expect(result.handles.end).toBe(false);
    expect(result.correct).toBe(false);
  });
});
