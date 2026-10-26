import { describe, expect, it } from "vitest";
import { presentCard } from "./cards.ts";
import { review } from "./srs.ts";
import {
  createMemoryVocabularyStore,
  type MemoryVocabularyStore,
} from "./vocabulary.memory-store.ts";
import { createVocabulary, DEFAULT_NEW_PER_DAY, NEW_PER_DAY_KEY } from "./vocabulary.service.ts";
import type { NewCard } from "./vocabulary.store.ts";

/** Memory fakes ignore the user; services still need one. */
const USER = "test-user";

const NOW = new Date("2026-10-25T13:30:00");
const HOUR = 3_600_000;

function setup(settings: Record<string, unknown> = {}) {
  const store = createMemoryVocabularyStore();
  let now = NOW;
  const vocabulary = createVocabulary({
    store,
    settings: { getSetting: async (_userId, key) => settings[key] },
    now: () => now,
  });
  return {
    store,
    vocabulary,
    setNow: (date: Date) => {
      now = date;
    },
  };
}

const wordCard = (word: string, overrides: Partial<NewCard> = {}): NewCard => ({
  source: "word",
  front: `${word}\nSmall firms ${word} in busy cities.`,
  back: `prosperar (verb) — to grow well\nExample: Plants ${word} here.`,
  ref: {
    articleId: "a1",
    word,
    sentence: `Small firms ${word} in busy cities.`,
    articleTitle: "Robots",
  },
  state: {},
  due: NOW,
  ...overrides,
});

/** A card already in the review phase, due `hoursAgo` hours before NOW. */
function scheduledCard(word: string, hoursAgo: number): NewCard {
  let next = review({}, 3, new Date(NOW.getTime() - 30 * 24 * HOUR));
  next = review(next.state, 3, next.due);
  return wordCard(word, { state: next.state, due: new Date(NOW.getTime() - hoursAgo * HOUR) });
}

async function addNew(store: MemoryVocabularyStore, count: number) {
  for (let i = 0; i < count; i++) await store.insertCard(USER, wordCard(`new${i}`));
}

describe("queue", () => {
  it("puts due cards first, earliest due first, then new cards", async () => {
    const { store, vocabulary } = setup();
    await addNew(store, 2);
    const later = await store.insertCard(USER, scheduledCard("later", 1));
    const earlier = await store.insertCard(USER, scheduledCard("earlier", 5));
    await store.insertCard(USER, {
      ...scheduledCard("future", 0),
      due: new Date(NOW.getTime() + HOUR),
    });

    const queue = await vocabulary.queue(USER, 10);
    expect(queue.cards.map((c) => c.id).slice(0, 2)).toEqual([earlier.id, later.id]);
    expect(queue.cards.slice(2).map((c) => c.phase)).toEqual(["new", "new"]);
    expect(queue.cards).toHaveLength(4);
  });

  it("caps new cards per day (default 5) and counts the ones introduced today", async () => {
    const { store, vocabulary } = setup();
    await addNew(store, 8);
    const first = await vocabulary.queue(USER, 10);
    expect(first.cards).toHaveLength(DEFAULT_NEW_PER_DAY);
    expect(first.newPerDay).toBe(5);

    for (const card of first.cards.slice(0, 2))
      await vocabulary.review(USER, card.id, { rating: 3 });
    const second = await vocabulary.queue(USER, 10);
    expect(second.newToday).toBe(2);
    expect(second.cards.filter((c) => c.phase === "new")).toHaveLength(3);
  });

  it("reads the new-card allowance from the srs.newPerDay setting", async () => {
    const { store, vocabulary } = setup({ [NEW_PER_DAY_KEY]: 1 });
    await addNew(store, 3);
    expect((await vocabulary.queue(USER, 10)).cards).toHaveLength(1);
  });

  it("respects the limit and reports the due backlog", async () => {
    const { store, vocabulary } = setup();
    for (let i = 0; i < 4; i++) await store.insertCard(USER, scheduledCard(`w${i}`, i + 1));
    await addNew(store, 2);
    const queue = await vocabulary.queue(USER, 3);
    expect(queue.cards).toHaveLength(3);
    expect(queue.cards.every((c) => c.phase === "review")).toBe(true);
    expect(queue.dueRemaining).toBe(1);
  });

  it("skips suspended cards", async () => {
    const { store, vocabulary } = setup();
    const card = await store.insertCard(USER, wordCard("thrive"));
    await vocabulary.update(USER, card.id, { suspended: true });
    expect((await vocabulary.queue(USER, 10)).cards).toHaveLength(0);
    await vocabulary.update(USER, card.id, { suspended: false });
    expect((await vocabulary.queue(USER, 10)).cards).toHaveLength(1);
  });

  it("keeps suspension in its own field, out of the FSRS state, across reviews", async () => {
    const { store, vocabulary } = setup();
    const card = await store.insertCard(USER, wordCard("thrive"));
    const view = await vocabulary.update(USER, card.id, { suspended: true });
    expect(view.suspended).toBe(true);
    expect(store.cards[0]).toMatchObject({ suspended: true, state: {} });

    await vocabulary.review(USER, card.id, { rating: 3 });
    expect(store.cards[0]?.suspended).toBe(true);
    expect(store.cards[0]?.state).not.toHaveProperty("suspended");
    expect((await vocabulary.stats(USER)).suspended).toBe(1);
  });
});

describe("review", () => {
  it("persists a review row and moves due into the future on Good", async () => {
    const { store, vocabulary } = setup();
    const card = await store.insertCard(USER, wordCard("thrive"));
    const result = await vocabulary.review(USER, card.id, { rating: 3, answer: "thrive" });
    expect(new Date(result.due).getTime()).toBeGreaterThan(NOW.getTime());
    expect(store.reviews).toEqual([
      { cardId: card.id, rating: 3, reviewedAt: NOW, answer: "thrive" },
    ]);
    const saved = await store.getCard(USER, card.id);
    expect(saved?.state.reps).toBe(1);
    expect(saved?.due.toISOString()).toBe(result.due);
  });

  it("answers not_found for an unknown card", async () => {
    const { vocabulary } = setup();
    await expect(vocabulary.review(USER, crypto.randomUUID(), { rating: 3 })).rejects.toMatchObject(
      {
        code: "not_found",
      },
    );
  });
});

describe("card presentation", () => {
  it("asks new word cards as recognition with the word highlighted", async () => {
    const { store } = setup();
    const card = presentCard(await store.insertCard(USER, wordCard("thrive")));
    expect(card).toMatchObject({
      direction: "recognition",
      prompt: "Small firms thrive in busy cities.",
      highlight: "thrive",
      answers: null,
      context: "Robots",
    });
  });

  it("asks review-phase word cards as a cloze with the Spanish gloss", async () => {
    const { store } = setup();
    const card = presentCard(await store.insertCard(USER, scheduledCard("thrive", 1)));
    expect(card).toMatchObject({
      direction: "production",
      prompt: "Small firms _____ in busy cities.",
      hintEs: "prosperar",
      answers: ["thrive"],
    });
  });

  it("asks own-error cards to fix the learner's sentence, with its date", async () => {
    const { vocabulary, store } = setup();
    const { cardId } = await vocabulary.createOwnErrorCard(USER, {
      original: "She go to work every day.",
      corrected: "She goes to work every day.",
      hintEs: "Tercera persona: -s",
      writtenAt: "2026-10-20T09:00:00.000Z",
    });
    const card = presentCard((await store.getCard(USER, cardId)) ?? (undefined as never));
    expect(card).toMatchObject({
      direction: "fix",
      prompt: "She go to work every day.",
      answers: ["She goes to work every day."],
      hintEs: "Tercera persona: -s",
      context: "Written on 2026-10-20",
    });
  });
});

describe("createCardFromMissedItem", () => {
  it("creates one unit_item card per item, typed when it has one blank", async () => {
    const { vocabulary, store } = setup();
    store.items.push({
      itemId: "1.1-2",
      unitId: 1,
      instruction: "Complete the sentences.",
      isExample: false,
      lines: [
        [
          { type: "text", text: "Please be quiet. I" },
          { type: "blank", id: "b1", size: "short" },
          { type: "text", text: "." },
        ],
      ],
      answer: {
        raw: "'m working",
        blanks: [["'m working", "am working"]],
        kind: "blanks",
        needsAi: false,
      },
    });
    const first = await vocabulary.createCardFromMissedItem(USER, "1.1-2");
    const again = await vocabulary.createCardFromMissedItem(USER, "1.1-2");
    expect(first?.created).toBe(true);
    expect(again).toEqual({ cardId: first?.cardId, created: false });
    const card = presentCard(
      (await store.getCard(USER, first?.cardId ?? "")) ?? (undefined as never),
    );
    expect(card).toMatchObject({
      source: "unit_item",
      direction: "production",
      prompt: "Please be quiet. I _____.",
      answers: ["'m working", "am working"],
      context: "Unit 1",
    });
  });

  it("skips examples and open items", async () => {
    const { vocabulary, store } = setup();
    store.items.push({
      itemId: "ex",
      unitId: 1,
      instruction: "Example",
      isExample: true,
      lines: [],
      answer: null,
    });
    expect(await vocabulary.createCardFromMissedItem(USER, "ex")).toBeNull();
    await expect(vocabulary.createCardFromMissedItem(USER, "missing")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("stats and sessions", () => {
  it("counts due, new, learned and recent reviews", async () => {
    const { store, vocabulary } = setup();
    await addNew(store, 2);
    await store.insertCard(USER, scheduledCard("old", 2));
    const fresh = await store.insertCard(USER, wordCard("fresh"));
    await vocabulary.review(USER, fresh.id, { rating: 3 });

    const stats = await vocabulary.stats(USER);
    expect(stats).toMatchObject({
      total: 4,
      newAvailable: 2,
      learned: 2,
      newToday: 1,
      reviewsLast30Days: 1,
      reviewsByDay: [{ date: "2026-10-25", count: 1 }],
    });
    expect(stats.dueToday).toBeGreaterThanOrEqual(1);
  });

  it("writes one srs_session_completed event with the counts", async () => {
    const { store, vocabulary } = setup();
    const counts = { reviewed: 3, again: 1, hard: 0, good: 2, easy: 0, seconds: 240 };
    expect(await vocabulary.completeSession(USER, counts)).toEqual({ recorded: true });
    expect(store.events).toEqual([{ type: "srs_session_completed", payload: counts }]);
  });
});
