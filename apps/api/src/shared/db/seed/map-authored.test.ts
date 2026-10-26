import type { Story, UnitExtrasFile, UnitTimelineFile } from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { mapAuthored } from "./map-authored.ts";

const story: Story = {
  blockId: 1,
  title: "Apollo 13",
  pitchEs: "Una historia real.",
  sources: [{ title: "NASA", url: "https://www.nasa.gov/" }],
  chapters: [
    {
      id: "b1-c1",
      position: 1,
      unitId: 1,
      title: "Live from Space",
      body: "Three astronauts are flying to the Moon.",
      grammarSpans: [{ text: "are flying", unitId: 1, note: "In progress." }],
      teaser: "Something is about to happen.",
    },
  ],
};

const extras: UnitExtrasFile = {
  unitId: 1,
  puzzle: { sentenceA: "A", sentenceB: "B", question: "Why?", revealEs: "Porque." },
  analogyEs: "Un proceso RUNNING.",
  pitfalls: [
    { wrong: "It rains.", right: "It’s raining.", explanationEs: "Ahora." },
    { wrong: "I study now.", right: "I’m studying now.", explanationEs: "Ahora." },
    { wrong: "She working.", right: "She’s working.", explanationEs: "Falta be." },
  ],
  canDoEs: ["Puedo hablar de lo que pasa ahora."],
};

const timeline: UnitTimelineFile = {
  unitId: 1,
  items: [
    {
      id: "tl-1-1",
      sentence: "It’s raining.",
      expected: { kind: "ongoing-now", start: -0.1, end: 0.1 },
      tolerance: 0.15,
      explanationEs: "Ahora mismo.",
    },
  ],
};

const known = { blockIds: new Set([1]), unitIds: new Set([1, 2]) };

describe("mapAuthored", () => {
  it("maps chapters, timeline items and unit extras to rows", () => {
    const rows = mapAuthored({ stories: [story], extras: [extras], timelines: [timeline] }, known);

    expect(rows.chapters).toEqual([
      {
        id: "b1-c1",
        blockId: 1,
        unitId: 1,
        position: 1,
        storyTitle: "Apollo 13",
        title: "Live from Space",
        body: "Three astronauts are flying to the Moon.",
        grammarSpans: [{ text: "are flying", unitId: 1, note: "In progress." }],
        teaser: "Something is about to happen.",
      },
    ]);
    expect(rows.timelineItems).toEqual([
      {
        id: "tl-1-1",
        unitId: 1,
        position: 0,
        sentence: "It’s raining.",
        expectedShape: {
          expected: { kind: "ongoing-now", start: -0.1, end: 0.1 },
          tolerance: 0.15,
          explanationEs: "Ahora mismo.",
        },
      },
    ]);
    expect(rows.unitExtras).toEqual([
      {
        unitId: 1,
        extras: {
          puzzle: extras.puzzle,
          analogyEs: extras.analogyEs,
          pitfalls: extras.pitfalls,
          canDoEs: extras.canDoEs,
        },
      },
    ]);
  });

  it("rejects authored content for units that are not seeded", () => {
    expect(() =>
      mapAuthored({ stories: [], extras: [{ ...extras, unitId: 7 }], timelines: [] }, known),
    ).toThrow(/unit 7/);
    expect(() =>
      mapAuthored({ stories: [], extras: [], timelines: [{ ...timeline, unitId: 9 }] }, known),
    ).toThrow(/unit 9/);
  });

  it("rejects a story for an unknown block or a chapter for an unknown unit", () => {
    expect(() =>
      mapAuthored({ stories: [{ ...story, blockId: 2 }], extras: [], timelines: [] }, known),
    ).toThrow(/block 2/);
    const chapter = { ...story.chapters[0], unitId: 5 } as Story["chapters"][number];
    expect(() =>
      mapAuthored(
        { stories: [{ ...story, chapters: [chapter] }], extras: [], timelines: [] },
        known,
      ),
    ).toThrow(/unit 5/);
  });

  it("rejects grammar spans that are not in the chapter body", () => {
    const chapter = {
      ...story.chapters[0],
      grammarSpans: [{ text: "is flying", unitId: 1, note: "x" }],
    } as Story["chapters"][number];
    expect(() =>
      mapAuthored(
        { stories: [{ ...story, chapters: [chapter] }], extras: [], timelines: [] },
        known,
      ),
    ).toThrow(/is flying/);
  });

  it("rejects duplicate timeline ids", () => {
    const item = timeline.items[0];
    if (!item) throw new Error("fixture");
    expect(() =>
      mapAuthored(
        { stories: [], extras: [], timelines: [{ unitId: 1, items: [item, item] }] },
        known,
      ),
    ).toThrow(/tl-1-1/);
  });
});
