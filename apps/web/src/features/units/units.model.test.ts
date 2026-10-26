import type { AttemptResponse, UnitDetail } from "@english-course/shared";
import { describe, expect, it } from "vitest";
import {
  describeValue,
  initialPlacement,
  valueFromKey,
  valueFromPointer,
} from "./timeline-geometry.ts";
import { unitFixture } from "./units.fixture.ts";
import { applyAttempt, highlightBody, stepsFor, verdictOf } from "./units.model.ts";

describe("stepsFor", () => {
  it("lists only the steps the unit has content for", () => {
    expect(stepsFor(unitFixture())).toEqual(["story", "puzzle", "theory", "timeline", "exercises"]);
    const bare: UnitDetail = { ...unitFixture(), story: null, extras: null, timeline: [] };
    expect(stepsFor(bare)).toEqual(["theory", "exercises"]);
  });
});

describe("highlightBody", () => {
  it("marks the first occurrence of each span and splits paragraphs", () => {
    const paragraphs = highlightBody(
      "They are flying.\n\nThe ship is flying fast. They are flying.",
      [
        { text: "are flying", unitId: 1, note: "now" },
        { text: "is flying", unitId: 1, note: "now" },
      ],
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.map((p) => [p.text, Boolean(p.span)])).toEqual([
      ["They ", false],
      ["are flying", true],
      [".", false],
    ]);
    expect(paragraphs[1]?.filter((p) => p.span).map((p) => p.text)).toEqual(["is flying"]);
  });

  it("ignores spans missing from the body", () => {
    expect(highlightBody("Hello", [{ text: "nope", unitId: 1, note: "x" }])).toEqual([
      [{ text: "Hello" }],
    ]);
  });
});

describe("verdictOf", () => {
  it("maps checker results to visual verdicts", () => {
    expect(verdictOf({ status: "correct", blanks: [{ verdict: "correct" }], score: 1 })).toBe(
      "correct",
    );
    expect(verdictOf({ status: "correct", blanks: [{ verdict: "almost" }], score: 1 })).toBe(
      "almost",
    );
    expect(verdictOf({ status: "partial", blanks: [], score: 0.5 })).toBe("incorrect");
    expect(verdictOf({ status: "needs-ai", blanks: [], score: 0 })).toBe("needs-ai");
  });
});

describe("applyAttempt", () => {
  it("updates the item progress, completion and status", () => {
    const response: AttemptResponse = {
      itemId: "1.1-2",
      status: "correct",
      result: { status: "correct", blanks: [{ verdict: "correct" }], score: 1 },
      method: "deterministic",
      attemptNo: 1,
      completion: { graded: 1, correct: 1, almost: 0, pending: 0, ratio: 0.9, completed: true },
      unitCompleted: true,
      canDoEs: ["Puedo…"],
    };
    const next = applyAttempt(unitFixture(), response, ["am looking"]);
    expect(next.progress.status).toBe("completed");
    expect(next.progress.completion.ratio).toBe(0.9);
    expect(next.progress.items).toEqual([
      {
        itemId: "1.1-2",
        attempts: 1,
        latest: { inputs: ["am looking"], result: response.result, method: "deterministic" },
      },
    ]);
  });
});

describe("timeline geometry", () => {
  it("maps pointer positions to the axis and clamps", () => {
    const rect = { left: 100, width: 200 };
    expect(valueFromPointer(100, rect)).toBe(-1);
    expect(valueFromPointer(200, rect)).toBe(0);
    expect(valueFromPointer(250, rect)).toBe(0.5);
    expect(valueFromPointer(900, rect)).toBe(1);
  });

  it("moves handles with the keyboard", () => {
    expect(valueFromKey(0, "ArrowLeft")).toBe(-0.05);
    expect(valueFromKey(0.98, "ArrowRight")).toBe(1);
    expect(valueFromKey(0, "Home")).toBe(-1);
    expect(valueFromKey(0, "a")).toBeUndefined();
  });

  it("starts every kind away from the past so nothing is correct by default", () => {
    expect(initialPlacement("interrupted")).toMatchObject({ interruptAt: 0.5 });
    expect(initialPlacement("point").end).toBeUndefined();
    expect(describeValue(0)).toBe("now");
    expect(describeValue(-0.8)).toBe("far in the past");
  });
});
