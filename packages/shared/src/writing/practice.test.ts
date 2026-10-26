import { describe, expect, it } from "vitest";
import { checkPracticeAnswer } from "./practice.ts";

const item = {
  sourceId: "e1",
  type: "fix_sentence" as const,
  instructionEs: "Corrige la frase",
  prompt: "She go to work.",
  answer: "She goes to work.",
  acceptedAlternatives: ["She is going to work."],
};

describe("checkPracticeAnswer", () => {
  it("accepts the answer and its alternatives with the shared normalization", () => {
    expect(checkPracticeAnswer(item, "she goes to work")).toBe("correct");
    expect(checkPracticeAnswer(item, "She's going to work.")).toBe("correct");
  });

  it("rejects wrong answers", () => {
    expect(checkPracticeAnswer(item, "She go to work.")).toBe("incorrect");
  });
});
