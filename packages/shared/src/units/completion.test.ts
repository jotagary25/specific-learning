import { describe, expect, it } from "vitest";
import { unitCompletion } from "./completion.ts";
import type { ItemOutcome } from "./schemas.ts";

const correct: ItemOutcome = {
  isExample: false,
  result: { status: "correct", blanks: [{ verdict: "correct" }], score: 1 },
};
const almost: ItemOutcome = {
  isExample: false,
  result: { status: "correct", blanks: [{ verdict: "almost", matched: "x" }], score: 1 },
};
const wrong: ItemOutcome = {
  isExample: false,
  result: { status: "incorrect", blanks: [{ verdict: "incorrect" }], score: 0 },
};
const pendingAi: ItemOutcome = {
  isExample: false,
  result: { status: "needs-ai", blanks: [], score: 0 },
};
const example: ItemOutcome = { ...wrong, isExample: true };

const repeat = (outcome: ItemOutcome, times: number) =>
  Array.from({ length: times }, () => outcome);

describe("unitCompletion", () => {
  it("is not completed at 79%", () => {
    const summary = unitCompletion([...repeat(correct, 79), ...repeat(wrong, 21)]);
    expect(summary.ratio).toBeCloseTo(0.79);
    expect(summary.completed).toBe(false);
  });

  it("is completed at exactly 80%", () => {
    const summary = unitCompletion([...repeat(correct, 80), ...repeat(wrong, 20)]);
    expect(summary.ratio).toBe(0.8);
    expect(summary.completed).toBe(true);
  });

  it("counts almost as correct but reports it separately", () => {
    const summary = unitCompletion([...repeat(correct, 2), ...repeat(almost, 2), wrong]);
    expect(summary).toMatchObject({ graded: 5, correct: 4, almost: 2, completed: true });
  });

  it("excludes examples and unresolved needs-ai items", () => {
    const summary = unitCompletion([correct, ...repeat(example, 5), ...repeat(pendingAi, 3)]);
    expect(summary).toMatchObject({ graded: 1, pending: 3, ratio: 1, completed: true });
  });

  it("counts needs-ai items once the AI has resolved them", () => {
    const resolved: ItemOutcome = { isExample: false, result: wrong.result };
    const summary = unitCompletion([...repeat(correct, 3), resolved]);
    expect(summary).toMatchObject({ graded: 4, ratio: 0.75, completed: false });
  });

  it("uses partial scores", () => {
    const partial: ItemOutcome = {
      isExample: false,
      result: {
        status: "partial",
        blanks: [{ verdict: "correct" }, { verdict: "incorrect" }],
        score: 0.5,
      },
    };
    expect(unitCompletion([correct, partial]).ratio).toBe(0.75);
  });

  it("is not completed with nothing graded", () => {
    expect(unitCompletion([pendingAi])).toMatchObject({ graded: 0, ratio: 0, completed: false });
  });
});
