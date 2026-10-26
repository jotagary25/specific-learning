import { describe, expect, it } from "vitest";
import { nextStep, reachable, tokenize } from "./reading.model.ts";

const entry = (term: string) => ({
  term,
  lemma: term,
  partOfSpeech: "noun",
  glossEs: "x",
  definitionEn: "x",
  example: "x",
});

describe("tokenize", () => {
  it("keeps the paragraph text and tags glossary terms, including phrases", () => {
    const paragraph = "The power plant is running out of fuel, plantations aside.";
    const tokens = tokenize(paragraph, [entry("plant"), entry("running out of")]);
    expect(tokens.map((t) => t.text).join("")).toBe(paragraph);
    const tagged = tokens
      .filter((t) => t.glossIndex !== undefined)
      .map((t) => [t.text, t.glossIndex]);
    expect(tagged).toEqual([
      ["plant", 0],
      ["running", 1],
      ["out", 1],
      ["of", 1],
    ]);
    expect(tokens.find((t) => t.text === "plantations")?.glossIndex).toBeUndefined();
  });
});

describe("steps", () => {
  it("advances and limits revisits to reached steps", () => {
    expect(nextStep("predict")).toBe("read");
    expect(nextStep("opinion")).toBe("done");
    expect(reachable("questions")).toEqual(["predict", "read", "questions"]);
    expect(reachable("done")).toHaveLength(6);
  });
});
