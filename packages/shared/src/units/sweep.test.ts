import { describe, expect, it } from "vitest";
import { checkItem } from "./check-item.ts";
import { expandOptionalWords } from "./normalize.ts";
import { realItems } from "./test-support.ts";

// Every graded, deterministic item must accept each of its own key alternatives
// (optional "(word)" groups expanded, as a learner would type them).
// Catches mismatches between the importer's parsed keys and the checker.
const gradedItems = realItems.filter(
  ({ item }) => !item.isExample && item.answer && !item.answer.needsAi,
);

describe("answer-key sweep (units 1–6)", () => {
  it("covers the imported graded items", () => {
    expect(gradedItems.length).toBeGreaterThan(130);
  });

  it("accepts every key alternative of every graded item", () => {
    const failures: string[] = [];
    for (const { id, item } of gradedItems) {
      const blanks = (item.answer?.blanks ?? []).map((alts) => alts.flatMap(expandOptionalWords));
      const width = Math.max(...blanks.map((alternatives) => alternatives.length));
      for (let pick = 0; pick < width; pick++) {
        const inputs = blanks.map((alts) => alts[Math.min(pick, alts.length - 1)] ?? "");
        const result = checkItem(item, inputs);
        const exact = result.blanks.every((blank) => blank.verdict === "correct");
        if (result.status !== "correct" || !exact) failures.push(`${id} ${JSON.stringify(inputs)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("accepts the 'OK' answer of ok-or-fix items in every accepted spelling", () => {
    const okItems = gradedItems.filter(({ item }) => item.answer?.raw === "OK");
    expect(okItems.length).toBeGreaterThan(0);
    for (const { item } of okItems) {
      for (const input of ["OK", "ok", "Okay", "correct"]) {
        expect(checkItem(item, [input]).status).toBe("correct");
      }
    }
  });
});
