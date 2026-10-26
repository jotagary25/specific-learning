import { describe, expect, it } from "vitest";
import { correspondingSentence, sentenceAround, splitSentences } from "./writing.text.ts";

describe("splitSentences", () => {
  it("splits on sentence punctuation and line breaks", () => {
    expect(splitSentences("AI is here. Is it good?\nYes!  Maybe")).toEqual([
      "AI is here.",
      "Is it good?",
      "Yes!",
      "Maybe",
    ]);
  });
});

describe("sentenceAround", () => {
  const text = "Yesterday I readed a book. It was great.";

  it("returns the sentence that contains the span", () => {
    expect(sentenceAround(text, "readed")).toBe("Yesterday I readed a book.");
  });

  it("returns null when the span is not in the text", () => {
    expect(sentenceAround(text, "goed")).toBeNull();
  });
});

describe("correspondingSentence", () => {
  it("finds the learner's corrected version of a sentence by word overlap", () => {
    const fixed = "It was great. Yesterday I read a book about robots.";
    expect(correspondingSentence(fixed, "Yesterday I readed a book.")).toBe(
      "Yesterday I read a book about robots.",
    );
  });

  it("returns null when nothing in the revised text resembles the sentence", () => {
    expect(correspondingSentence("Totally different words here.", "She go home.")).toBeNull();
  });
});
