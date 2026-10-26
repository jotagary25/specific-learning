import { describe, expect, it } from "vitest";
import { countWords, findQuote, matchSpot, paragraphsOf, sentenceAt } from "./text.ts";

const TEXT =
  "Scientists are studying the ice. They have been watching it for years.\n\nThe team is working in Greenland while the glacier melts.";
const QUOTES = ["are studying the ice", "is working in Greenland"];

describe("countWords", () => {
  it("counts words with apostrophes and hyphens as one", () => {
    expect(countWords("It's a well-known fact — 42 people agree.")).toBe(7);
    expect(countWords("")).toBe(0);
  });
});

describe("findQuote", () => {
  it("finds exact and whitespace/case-insensitive quotes", () => {
    expect(findQuote(TEXT, "are studying")).toEqual({ start: 11, end: 23 });
    expect(findQuote(TEXT, "the TEAM  is working")).not.toBeNull();
    expect(findQuote(TEXT, "not in the text")).toBeNull();
  });
});

describe("matchSpot", () => {
  it("matches a selection inside an annotated span", () => {
    expect(matchSpot(TEXT, { text: "are studying" }, QUOTES)).toBe(0);
    expect(matchSpot(TEXT, { text: " is working " }, QUOTES)).toBe(1);
  });

  it("matches a selection that mostly overlaps a span", () => {
    expect(matchSpot(TEXT, { text: "team is working" }, QUOTES)).toBe(1);
  });

  it("rejects selections outside every span or barely touching one", () => {
    expect(matchSpot(TEXT, { text: "have been watching" }, QUOTES)).toBeNull();
    expect(matchSpot(TEXT, { text: "Scientists are" }, QUOTES)).toBeNull();
    expect(matchSpot(TEXT, { text: "a" }, QUOTES)).toBeNull();
  });

  it("uses the offset when given", () => {
    const start = TEXT.indexOf("the glacier");
    expect(matchSpot(TEXT, { text: "the", start }, QUOTES)).toBeNull();
    const inside = TEXT.indexOf("the ice");
    expect(matchSpot(TEXT, { text: "the", start: inside }, QUOTES)).toBe(0);
  });
});

describe("sentenceAt", () => {
  it("returns the sentence containing the offset", () => {
    const paragraph = "First one. Second “quoted.” Third one!";
    expect(sentenceAt(paragraph, 2)).toBe("First one.");
    expect(sentenceAt(paragraph, 14)).toBe("Second “quoted.”");
    expect(sentenceAt(paragraph, paragraph.length - 2)).toBe("Third one!");
  });
});

describe("paragraphsOf", () => {
  it("splits on blank lines", () => {
    expect(paragraphsOf(TEXT)).toHaveLength(2);
  });
});
