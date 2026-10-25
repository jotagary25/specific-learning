import { AiFunctionId } from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { AI_FUNCTIONS, isThinkSupported, normalizeThink } from "./ai-functions.ts";

const levels = { values: ["low", "medium", "high"], default: "medium" };
const onOff = { values: [true, false], default: true };
const onOnly = { values: [true], default: true };

describe("AI function catalog", () => {
  it("has a default for every function in the spec catalog", () => {
    expect(Object.keys(AI_FUNCTIONS).sort()).toEqual([...AiFunctionId.options].sort());
  });
});

describe("isThinkSupported", () => {
  it("accepts null, exact values and booleans for models without metadata", () => {
    expect(isThinkSupported(null, levels)).toBe(true);
    expect(isThinkSupported("high", levels)).toBe(true);
    expect(isThinkSupported("extreme", levels)).toBe(false);
    expect(isThinkSupported(true, levels)).toBe(false);
    expect(isThinkSupported(false, onOff)).toBe(true);
    expect(isThinkSupported(true, null)).toBe(true);
    expect(isThinkSupported("high", null)).toBe(false);
  });
});

describe("normalizeThink", () => {
  it("keeps supported values", () => {
    expect(normalizeThink("high", levels)).toBe("high");
    expect(normalizeThink(false, onOff)).toBe(false);
  });

  it("maps levels to on/off for boolean-only models", () => {
    expect(normalizeThink("high", onOff)).toBe(true);
    expect(normalizeThink("medium", onOff)).toBe(true);
    expect(normalizeThink("low", onOff)).toBe(false);
    expect(normalizeThink("low", onOnly)).toBe(true);
  });

  it("falls back to the model default otherwise", () => {
    expect(normalizeThink(true, levels)).toBeNull();
    expect(normalizeThink("extreme", levels)).toBeNull();
    expect(normalizeThink("high", null)).toBeNull();
  });
});
