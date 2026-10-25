import { describe, expect, it } from "vitest";
import { canonicalize, expandOptionalWords, normalize } from "./normalize.ts";

describe("normalize", () => {
  it.each([
    ["  Is   losing.  ", "is losing"],
    ["’m looking", "'m looking"],
    ["‘s getting", "'s getting"],
    ["“Hello” there!", '"hello" there'],
    ["Which newspaper do you read?", "which newspaper do you read"],
    ["AM LOOKING", "am looking"],
    ["What are you doing? I’m thinking.", "what are you doing? i'm thinking"],
  ])("normalize(%j) = %j", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe("canonicalize (generic contraction fallback)", () => {
  it.each([
    ["’m looking", "am looking"],
    ["I'm coming", "i am coming"],
    ["’re making", "are making"],
    ["aren’t speaking", "are not speaking"],
    ["’re not speaking", "are not speaking"],
    ["isn't working", "is not working"],
    ["don’t watch", "do not watch"],
    ["can't remember", "can not remember"],
    ["cannot remember", "can not remember"],
    ["won't go", "will not go"],
    ["shan't go", "shall not go"],
    ["they've gone", "they have gone"],
    ["we'll see", "we will see"],
    ["it's getting", "it is getting"],
    ["’s", "is"],
    ["she's been", "she has been"],
    ["he's got", "he has got"],
    ["I'd go", "i would go"],
    ["you'd better", "you had better"],
    ["I'd finished", "i had finished"],
    ["let's go", "let us go"],
  ])("canonicalize(%j) = %j", (input, expected) => {
    expect(canonicalize(input)).toBe(expected);
  });

  it("does not expand a noun's 's (likely possessive)", () => {
    expect(canonicalize("Liz's sister")).toBe("liz's sister");
  });
});

describe("expandOptionalWords", () => {
  it("accepts the text with and without each parenthesized word", () => {
    expect(expandOptionalWords("took her (about) half an hour").sort()).toEqual([
      "took her about half an hour",
      "took her half an hour",
    ]);
  });

  it("combines several optional groups", () => {
    expect(expandOptionalWords("(the) car (is) red")).toHaveLength(4);
  });

  it("returns text without parentheses unchanged", () => {
    expect(expandOptionalWords("did you stay")).toEqual(["did you stay"]);
  });
});
