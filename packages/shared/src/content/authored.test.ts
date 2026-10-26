import { describe, expect, it } from "vitest";
import story from "../../../../content/authored/block-1/story.json" with { type: "json" };
import extras1 from "../../../../content/authored/units/unit-001.extras.json" with { type: "json" };
import timeline1 from "../../../../content/authored/units/unit-001.timeline.json" with {
  type: "json",
};
import extras2 from "../../../../content/authored/units/unit-002.extras.json" with { type: "json" };
import timeline2 from "../../../../content/authored/units/unit-002.timeline.json" with {
  type: "json",
};
import extras3 from "../../../../content/authored/units/unit-003.extras.json" with { type: "json" };
import timeline3 from "../../../../content/authored/units/unit-003.timeline.json" with {
  type: "json",
};
import extras4 from "../../../../content/authored/units/unit-004.extras.json" with { type: "json" };
import timeline4 from "../../../../content/authored/units/unit-004.timeline.json" with {
  type: "json",
};
import extras5 from "../../../../content/authored/units/unit-005.extras.json" with { type: "json" };
import timeline5 from "../../../../content/authored/units/unit-005.timeline.json" with {
  type: "json",
};
import extras6 from "../../../../content/authored/units/unit-006.extras.json" with { type: "json" };
import timeline6 from "../../../../content/authored/units/unit-006.timeline.json" with {
  type: "json",
};
import { Story, TimelineExpected, UnitExtrasFile, UnitTimelineFile } from "./authored.ts";

const block1 = Story.parse(story);
const extras = [extras1, extras2, extras3, extras4, extras5, extras6].map((raw) =>
  UnitExtrasFile.parse(raw),
);
const timelines = [timeline1, timeline2, timeline3, timeline4, timeline5, timeline6].map((raw) =>
  UnitTimelineFile.parse(raw),
);

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe("block 1 story", () => {
  it("has one chapter per unit 1–6, in order", () => {
    expect(block1.chapters.map((c) => [c.position, c.unitId])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 6],
    ]);
  });

  it.each(block1.chapters)("$id is 180–300 words with a teaser", (chapter) => {
    expect(wordCount(chapter.body)).toBeGreaterThanOrEqual(180);
    expect(wordCount(chapter.body)).toBeLessThanOrEqual(300);
    expect(chapter.teaser.length).toBeGreaterThan(20);
  });

  it.each(block1.chapters)("$id marks ≥ 6 exact grammar spans of its unit", (chapter) => {
    const own = chapter.grammarSpans.filter((span) => span.unitId === chapter.unitId);
    expect(own.length).toBeGreaterThanOrEqual(6);
    for (const span of chapter.grammarSpans) {
      expect(chapter.body, span.text).toContain(span.text);
    }
  });
});

describe("unit extras", () => {
  it("covers units 1–6 with a puzzle, analogy, 3–5 pitfalls and can-do statements", () => {
    expect(extras.map((e) => e.unitId)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const e of extras) {
      expect(e.pitfalls.length).toBeGreaterThanOrEqual(3);
      expect(e.pitfalls.every((p) => p.wrong !== p.right)).toBe(true);
    }
  });
});

describe("timeline items", () => {
  it("has 4–6 items per unit with ids matching the unit", () => {
    expect(timelines.map((t) => t.unitId)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const t of timelines) {
      expect(t.items.length).toBeGreaterThanOrEqual(4);
      expect(t.items.length).toBeLessThanOrEqual(6);
      for (const item of t.items) expect(item.id.startsWith(`tl-${t.unitId}-`)).toBe(true);
    }
  });

  it("keeps every handle on the [-1, 1] axis", () => {
    for (const item of timelines.flatMap((t) => t.items)) {
      const { start, end, interruptAt } = item.expected;
      for (const v of [start, end, interruptAt]) {
        if (v !== undefined) {
          expect(v).toBeGreaterThanOrEqual(-1);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("defaults the tolerance when a file omits it", () => {
    const parsed = UnitTimelineFile.parse({
      unitId: 1,
      items: [
        {
          id: "tl-1-9",
          sentence: "It’s raining.",
          expected: { kind: "ongoing-now", start: -0.1, end: 0.1 },
          explanationEs: "Ahora.",
        },
      ],
    });
    expect(parsed.items[0]?.tolerance).toBe(0.15);
  });

  it.each([
    [{ kind: "span", start: -0.5 }, "needs an end"],
    [{ kind: "span", start: -0.5, end: 0.2 }, "finished"],
    [{ kind: "ongoing-now", start: 0.1, end: 0.3 }, "before now"],
    [{ kind: "interrupted", start: -0.5, end: -0.2 }, "interruptAt"],
    [{ kind: "interrupted", start: -0.5, end: -0.2, interruptAt: -0.6 }, "inside"],
    [{ kind: "point", start: -0.5, interruptAt: -0.4 }, "only valid"],
    [{ kind: "point", start: -1.5 }, ""],
  ])("rejects inconsistent shape %j", (shape, message) => {
    const result = TimelineExpected.safeParse(shape);
    expect(result.success).toBe(false);
    if (!result.success && message) expect(result.error.message).toContain(message);
  });
});
