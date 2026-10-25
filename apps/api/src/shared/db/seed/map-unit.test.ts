import type { Unit } from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { itemId, mapUnit } from "./map-unit.ts";

const unit: Unit = {
  number: 1,
  title: "Present Continuous",
  subtitle: "(I am doing)",
  block: { id: 1, title: "Present and Past", range: { from: 1, to: 6 } },
  theory: [{ letter: "A", html: "<p>Sarah is driving.</p>" }],
  exercises: [
    {
      id: "1.1",
      instruction: "Complete the sentences.",
      evaluation: "auto",
      wordBank: [{ text: "look", used: false }],
      items: [
        {
          num: "1.",
          isExample: true,
          lines: [[{ type: "example", text: "'re working" }]],
        },
        {
          num: "2.",
          isExample: false,
          lines: [[{ type: "blank", id: "1.1-2-1", size: "long" }]],
          answer: {
            raw: "’m looking (am looking)",
            blanks: [["’m looking", "am looking"]],
            kind: "blanks",
            needsAi: false,
          },
        },
      ],
    },
    {
      id: "1.2",
      instruction: "Write about yourself.",
      evaluation: "ai",
      passage: "A short passage.",
      answerNote: "Answers will vary.",
      items: [
        {
          num: "1.",
          isExample: false,
          lines: [[{ type: "blank", id: "1.2-1-1", size: "long" }]],
          answer: { raw: "Answers will vary.", blanks: [], kind: "open", needsAi: true },
        },
        {
          num: "2.",
          isExample: false,
          lines: [[{ type: "blank", id: "1.2-2-1", size: "long" }]],
          answer: {
            raw: "is (are) … going",
            blanks: [["is"]],
            kind: "blanks",
            needsAi: true,
            aiReason: "one key part for two blanks",
          },
        },
      ],
    },
  ],
};

describe("itemId", () => {
  it("joins the exercise code and the item number without its trailing dot", () => {
    expect(itemId("1.1", "2.")).toBe("1.1-2");
    expect(itemId("6.2", "12")).toBe("6.2-12");
  });
});

describe("mapUnit", () => {
  const rows = mapUnit(unit);

  it("maps the block with its unit range", () => {
    expect(rows.block).toEqual({ id: 1, title: "Present and Past", unitFrom: 1, unitTo: 6 });
  });

  it("maps only the content columns of the unit (no learner progress)", () => {
    expect(rows.unit).toEqual({
      id: 1,
      blockId: 1,
      title: "Present Continuous",
      subtitle: "(I am doing)",
      theory: unit.theory,
    });
  });

  it("maps exercises in book order with optional fields as null", () => {
    expect(rows.exercises).toEqual([
      {
        id: "1.1",
        unitId: 1,
        position: 0,
        instruction: "Complete the sentences.",
        evaluation: "auto",
        wordBank: [{ text: "look", used: false }],
        passage: null,
        answerNote: null,
      },
      {
        id: "1.2",
        unitId: 1,
        position: 1,
        instruction: "Write about yourself.",
        evaluation: "ai",
        wordBank: null,
        passage: "A short passage.",
        answerNote: "Answers will vary.",
      },
    ]);
  });

  it("maps items with stable ids and positions within their exercise", () => {
    expect(rows.items.map((i) => [i.id, i.exerciseId, i.num, i.position])).toEqual([
      ["1.1-1", "1.1", "1.", 0],
      ["1.1-2", "1.1", "2.", 1],
      ["1.2-1", "1.2", "1.", 0],
      ["1.2-2", "1.2", "2.", 1],
    ]);
  });

  it("keeps examples without an answer key", () => {
    const example = rows.items[0];
    expect(example?.isExample).toBe(true);
    expect(example?.answer).toBeNull();
    expect(example?.isOpen).toBe(false);
  });

  it("flags items the AI must decide as open", () => {
    expect(rows.items.map((i) => i.isOpen)).toEqual([false, false, true, true]);
  });

  it("keeps lines and the answer key verbatim", () => {
    const item = rows.items[1];
    expect(item?.lines).toEqual(unit.exercises[0]?.items[1]?.lines);
    expect(item?.answer).toEqual(unit.exercises[0]?.items[1]?.answer);
  });
});
