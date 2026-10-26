import { describe, expect, it } from "vitest";
import { highlightSpans } from "./highlight.ts";

describe("highlightSpans", () => {
  it("maps exact substrings to marked segments in text order", () => {
    const { segments, missing } = highlightSpans("She go to work and he have a car.", [
      { id: "b", span: "he have" },
      { id: "a", span: "go" },
    ]);
    expect(missing).toEqual([]);
    expect(segments).toEqual([
      { text: "She ", errorId: null },
      { text: "go", errorId: "a" },
      { text: " to work and ", errorId: null },
      { text: "he have", errorId: "b" },
      { text: " a car.", errorId: null },
    ]);
  });

  it("reports spans that are not in the text and leaves the text unmarked", () => {
    const { segments, missing } = highlightSpans("I fixed it.", [{ id: "e1", span: "I fix it" }]);
    expect(missing).toEqual(["e1"]);
    expect(segments).toEqual([{ text: "I fixed it.", errorId: null }]);
  });

  it("skips overlapping matches and uses the next free occurrence of repeated spans", () => {
    const { segments, missing } = highlightSpans("is is is", [
      { id: "e1", span: "is is" },
      { id: "e2", span: "is" },
      { id: "e3", span: "s i" },
    ]);
    expect(segments.filter((s) => s.errorId)).toEqual([
      { text: "is is", errorId: "e1" },
      { text: "is", errorId: "e2" },
    ]);
    expect(missing).toEqual(["e3"]);
    expect(segments.map((s) => s.text).join("")).toBe("is is is");
  });

  it("ignores empty spans and handles empty text", () => {
    expect(highlightSpans("", [{ id: "e1", span: " " }])).toEqual({
      segments: [],
      missing: ["e1"],
    });
  });
});
