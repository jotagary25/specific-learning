import { describe, expect, it } from "vitest";
import { damerauLevenshtein } from "./distance.ts";

describe("damerauLevenshtein", () => {
  it.each([
    ["looking", "looking", 0],
    ["lookng", "looking", 1],
    ["lookingg", "looking", 1],
    ["lokoing", "looking", 1],
    ["lookimg", "looking", 1],
    ["is", "are", 3],
    ["", "abc", 3],
    ["abc", "", 3],
    ["ca", "abc", 3],
  ])("distance(%j, %j) = %i", (a, b, expected) => {
    expect(damerauLevenshtein(a, b)).toBe(expected);
  });
});
