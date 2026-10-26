import type { TutorContext } from "@english-course/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { createMemoryUnitsStore, type MemoryUnitsStore } from "../units/units.memory-store.ts";
import { createUnits } from "../units/units.service.ts";
import { createMemoryVocabularyStore } from "../vocabulary/vocabulary.memory-store.ts";
import { createVocabulary } from "../vocabulary/vocabulary.service.ts";
import { createTutorTools, htmlToText, MAX_TOOL_RESULT_CHARS, truncate } from "./tools.ts";

const ctx = (context: TutorContext = { kind: "free", ref: "" }) => ({
  conversationId: "c-1",
  context,
});

let units: ReturnType<typeof createUnits>;
let store: MemoryUnitsStore;
beforeAll(async () => {
  store = await createMemoryUnitsStore();
  units = createUnits({ store });
});

describe("get_item", () => {
  it("never returns the answer key until every item of the exercise was attempted", async () => {
    const tools = createTutorTools({ units });
    const locked = await tools.run("get_item", { itemId: "1.1-2" }, ctx());
    expect(locked.tool).toEqual({ name: "get_item", label: "looked at item 1.1-2", ok: true });
    const lockedBody = JSON.parse(locked.content);
    expect(lockedBody).toMatchObject({ unit: 1, exercise: "1.1", isExample: false });
    expect(lockedBody.answerKey).toMatch(/^LOCKED/);
    expect(lockedBody.item).toContain("[blank 1]");

    // Attempt every graded item of exercise 1.1 (right or wrong does not matter for the gate).
    const content = await store.getUnitContent(1);
    const graded = (content?.items ?? []).filter(
      (i) => i.exerciseId === "1.1" && !i.isExample && i.answer,
    );
    expect(graded.length).toBeGreaterThan(1);
    for (const item of graded) {
      const blanks = item.lines.flat().filter((s) => s.type === "blank").length;
      await units.attempt(
        1,
        item.id,
        Array.from({ length: Math.max(1, blanks) }, () => "x"),
      );
    }

    const open = JSON.parse((await tools.run("get_item", { itemId: "1.1-2" }, ctx())).content);
    expect(open.answerKey).toMatchObject({ raw: expect.any(String), blanks: expect.any(Array) });
    expect(open.learner).toMatchObject({ attempts: 1, latestInputs: ["x"] });
  });

  it("validates the item id and reports unknown items as tool errors", async () => {
    const tools = createTutorTools({ units });
    expect((await tools.run("get_item", { itemId: "drop table" }, ctx())).content).toMatch(
      /^Error: invalid arguments for get_item/,
    );
    const missing = await tools.run("get_item", { itemId: "1.9-9" }, ctx());
    expect(missing.tool.ok).toBe(false);
    expect(missing.content).toBe("Error: get_item failed: Item 1.9-9 not found");
  });
});

describe("get_unit_theory", () => {
  it("returns plain-text sections, optionally one, truncated to the result budget", async () => {
    const tools = createTutorTools({ units });
    const all = await tools.run("get_unit_theory", { unitNumber: 1 }, ctx());
    expect(all.content.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
    expect(all.content).not.toMatch(/<[a-z]+[ >]/i);
    const b = JSON.parse(
      (await tools.run("get_unit_theory", { unitNumber: 1, section: "b" }, ctx())).content,
    );
    expect(b.sections.map((s: { section: string }) => s.section)).toEqual(["B"]);
  });
});

describe("write tools", () => {
  it("create a word card once, park items and save doubts", async () => {
    const cards = createMemoryVocabularyStore();
    const parked: string[] = [];
    const doubts: Array<{ text: string; context: Record<string, unknown> }> = [];
    const tools = createTutorTools({
      wordCards: cards,
      vocabulary: createVocabulary({ store: cards }),
      today: {
        addParking: async (text) => {
          parked.push(text);
          return { id: "p-1", text, done: false, createdAt: "2026-10-25T09:00:00.000Z" };
        },
      },
      saveDoubt: async (text, context) => {
        doubts.push({ text, context });
        return { id: "d-1" };
      },
      now: () => new Date("2026-10-25T09:00:00Z"),
    });
    const card = { word: "Rollout", sentence: "The rollout took a week.", meaningEs: "despliegue" };
    const created = await tools.run("create_vocab_card", card, ctx());
    expect(created.tool).toEqual({
      name: "create_vocab_card",
      label: 'saved "Rollout" as a card',
      ok: true,
    });
    expect(JSON.parse(created.content)).toMatchObject({ created: true });
    expect(JSON.parse((await tools.run("create_vocab_card", card, ctx())).content)).toMatchObject({
      created: false,
    });
    const [saved] = await cards.listCards({});
    expect(saved).toMatchObject({
      source: "word",
      front: "Rollout\nThe rollout took a week.",
      back: "despliegue",
    });
    expect(saved?.ref).toMatchObject({ word: "rollout", origin: "tutor", conversationId: "c-1" });

    const found = JSON.parse(
      (await tools.run("search_my_cards", { query: "rollout" }, ctx())).content,
    );
    expect(found.found).toBe(1);

    await tools.run("add_parking_item", { text: "Look up the Apollo 13 film" }, ctx());
    expect(parked).toEqual(["Look up the Apollo 13 film"]);

    const context: TutorContext = { kind: "unit", ref: "2" };
    await tools.run("save_doubt", { text: "¿do vs does?" }, ctx(context));
    expect(doubts).toEqual([
      {
        text: "¿do vs does?",
        context: { screen: "tutor", conversationId: "c-1", tutorContext: context },
      },
    ]);
  });

  it("only offers the tools whose services are wired", () => {
    expect(createTutorTools({}).definitions).toEqual([]);
    const { definitions } = createTutorTools({ units });
    expect(definitions.map((d) => d.name)).toEqual(["get_unit_theory", "get_item"]);
    expect(definitions[0]?.parameters).toMatchObject({
      type: "object",
      required: ["unitNumber"],
    });
  });
});

describe("helpers", () => {
  it("truncate long results and strip theory HTML", () => {
    expect(truncate("a".repeat(5000))).toHaveLength(MAX_TOOL_RESULT_CHARS);
    expect(truncate("short")).toBe("short");
    expect(htmlToText("<p>I&rsquo;m <b>working</b></p><ul><li>now</li></ul>")).toBe(
      "I’m working\nnow",
    );
  });
});
