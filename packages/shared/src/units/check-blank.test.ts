import { describe, expect, it } from "vitest";
import { checkBlank } from "./check-blank.ts";

const LOOKING = ["’m looking", "am looking"];

describe("checkBlank: correct", () => {
  it.each([
    ["’m looking", LOOKING],
    ["'m looking", LOOKING],
    ["am looking", LOOKING],
    ["AM LOOKING", LOOKING],
    ["  am   looking. ", LOOKING],
    ["do not watch", ["don’t watch"]],
    ["is", ["’s"]],
    ["can not remember", ["can’t remember"]],
    ["cannot remember", ["can’t remember"]],
    ["took her half an hour", ["took her (about) half an hour"]],
    ["took her about half an hour", ["took her (about) half an hour"]],
  ])("%j is correct for %j", (input, alternatives) => {
    expect(checkBlank(input, alternatives).verdict).toBe("correct");
  });

  it("reports which alternative matched", () => {
    expect(checkBlank("am looking", LOOKING)).toEqual({
      verdict: "correct",
      matched: "am looking",
    });
  });
});

describe("checkBlank: wildcard ' . . . '", () => {
  const MISTAKE = ["’m always making the same mistake.", ". . . that mistake."];

  it.each([
    "’m always making the same mistake",
    "am always making that mistake.",
    "'m always repeating that mistake",
  ])("%j matches", (input) => {
    expect(checkBlank(input, MISTAKE).verdict).toBe("correct");
  });

  it("rejects text that does not end like the wildcard alternative", () => {
    expect(checkBlank("make mistakes", MISTAKE).verdict).toBe("incorrect");
  });
});

describe("checkBlank: almost", () => {
  it.each([
    ["lookng typo", "am lookng", LOOKING],
    ["transposition", "am lokoing", LOOKING],
    ["missing apostrophe", "dont watch", ["don’t watch"]],
    ["extra apostrophe", "is'nt working", ["isn’t working", "is not working"]],
    ["mid-word doubled consonant", "stoped", ["stopped"]],
    ["missing space", "islosing", ["is losing"]],
  ])("%s: %j is almost", (_rule, input, alternatives) => {
    expect(checkBlank(input, alternatives).verdict).toBe("almost");
  });
});

describe("checkBlank: never almost when the grammar form changes", () => {
  it.each([
    ["different form of the target verb", "look", LOOKING],
    ["auxiliary is vs are", "is", ["are"]],
    ["auxiliary inside a longer answer", "is staying", ["’re staying", "are staying"]],
    ["auxiliary one letter away", "has looking", ["was looking"]],
    ["third-person -s dropped", "open", ["opens"]],
    ["third-person -s added", "takes", ["take"]],
    ["-d ending added", "lived", ["live"]],
    ["final s/d swapped", "rised", ["rises"]],
    ["vowel change (irregular past)", "throw", ["threw"]],
    ["short answer typo (< 5 chars)", "hed", ["had"]],
    ["apostrophe makes a different word", "were going", ["we’re going"]],
    ["empty input", "", LOOKING],
  ])("%s: %j is incorrect", (_rule, input, alternatives) => {
    expect(checkBlank(input, alternatives).verdict).toBe("incorrect");
  });
});
