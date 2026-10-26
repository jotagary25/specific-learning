import { describe, expect, it } from "vitest";
import { blankWord, checkTypedAnswer, ratingForVerdict, wordDiff } from "./check.ts";

describe("checkTypedAnswer", () => {
  it("accepts the answer with case, spacing and trailing punctuation differences", () => {
    expect(checkTypedAnswer("  Thrive. ", ["thrive"])).toBe("correct");
  });

  it("marks a one-letter typo on a long word as almost", () => {
    expect(checkTypedAnswer("recylcing", ["recycling"])).toBe("almost");
  });

  it("marks a different word or an empty answer as incorrect", () => {
    expect(checkTypedAnswer("grow", ["thrive"])).toBe("incorrect");
    expect(checkTypedAnswer("   ", ["thrive"])).toBe("incorrect");
  });

  it("checks a corrected sentence with contractions expanded", () => {
    expect(checkTypedAnswer("I don't like it.", ["I do not like it"])).toBe("correct");
    expect(checkTypedAnswer("She go home.", ["She goes home."])).toBe("incorrect");
  });
});

describe("ratingForVerdict", () => {
  it("derives Good, Hard and Again", () => {
    expect(ratingForVerdict("correct")).toBe(3);
    expect(ratingForVerdict("almost")).toBe(2);
    expect(ratingForVerdict("incorrect")).toBe(1);
  });
});

describe("blankWord", () => {
  it("blanks the word in its sentence, keeping the surface form", () => {
    expect(blankWord("Small firms Thrive here.", "thrive")).toEqual({
      cloze: "Small firms _____ here.",
      surface: "Thrive",
    });
  });

  it("does not blank inside longer words and returns null when missing", () => {
    expect(blankWord("The plants grow.", "plant")).toBeNull();
    expect(blankWord("A plant and plants.", "plant")).toEqual({
      cloze: "A _____ and plants.",
      surface: "plant",
    });
  });
});

describe("wordDiff", () => {
  it("marks removed and added words against the expected sentence", () => {
    expect(wordDiff("She go to home", "She goes home")).toEqual([
      { text: "She", kind: "same" },
      { text: "go", kind: "removed" },
      { text: "to", kind: "removed" },
      { text: "goes", kind: "added" },
      { text: "home", kind: "same" },
    ]);
  });

  it("compares words ignoring case and trailing punctuation", () => {
    expect(wordDiff("i like it", "I like it.")).toEqual([
      { text: "I", kind: "same" },
      { text: "like", kind: "same" },
      { text: "it.", kind: "same" },
    ]);
  });
});
