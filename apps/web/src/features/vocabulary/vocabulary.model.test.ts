import type { QueueCard } from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { addRating, emptyTally, feedbackFor, ratingFromKey } from "./vocabulary.model.ts";

const production: QueueCard = {
  id: "c1",
  source: "word",
  direction: "production",
  phase: "review",
  task: "Type the missing word",
  prompt: "Small firms _____ here.",
  highlight: null,
  hintEs: "prosperar",
  answers: ["thrive"],
  back: "prosperar (verb)",
  context: null,
};

const fix: QueueCard = {
  ...production,
  id: "c2",
  source: "own_error",
  direction: "fix",
  prompt: "She go home.",
  answers: ["She goes home."],
};

describe("feedbackFor", () => {
  it("suggests Good, Hard or Again from the typed answer", () => {
    expect(feedbackFor(production, "Thrive").suggested).toBe(3);
    expect(feedbackFor({ ...production, answers: ["recycling"] }, "recylcing")).toMatchObject({
      verdict: "almost",
      suggested: 2,
    });
    expect(feedbackFor(production, "grow")).toMatchObject({ verdict: "incorrect", suggested: 1 });
  });

  it("adds a diff only for own-error cards that are not exact", () => {
    expect(feedbackFor(production, "grow").diff).toBeNull();
    expect(feedbackFor(fix, "she goes home").diff).toBeNull();
    expect(feedbackFor(fix, "She go home.").diff).toEqual([
      { text: "She", kind: "same" },
      { text: "go", kind: "removed" },
      { text: "goes", kind: "added" },
      { text: "home.", kind: "same" },
    ]);
  });
});

describe("tally", () => {
  it("counts reviews by rating", () => {
    const tally = [3, 1, 3, 4].reduce((t, r) => addRating(t, r as 1 | 2 | 3 | 4), emptyTally());
    expect(tally).toEqual({ reviewed: 4, again: 1, hard: 0, good: 2, easy: 1 });
  });

  it("maps keys 1–4 to ratings", () => {
    expect(ratingFromKey("2")).toBe(2);
    expect(ratingFromKey("5")).toBeNull();
  });
});
