import {
  CardsListResponse,
  CardView,
  QueueResponse,
  ReviewResponse,
  StatsResponse,
} from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createTestAuth, loginCookie } from "../auth/auth.test-support.ts";
import { createMemoryVocabularyStore } from "./vocabulary.memory-store.ts";
import { createVocabulary } from "./vocabulary.service.ts";

const NOW = new Date("2026-10-25T13:30:00");

async function setup() {
  const store = createMemoryVocabularyStore();
  const vocabulary = createVocabulary({ store, now: () => NOW });
  const { auth } = await createTestAuth();
  const app = createApp({ pingDb: async () => true, auth, vocabulary });
  const cookie = await loginCookie(app);
  const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
    app.request(`/api/vocabulary${path}`, {
      method: init.method ?? "GET",
      headers: { cookie, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const card = await store.insertCard("test-user", {
    source: "word",
    front: "thrive\nSmall firms thrive here.",
    back: "prosperar (verb) — to grow well",
    ref: { word: "thrive", sentence: "Small firms thrive here." },
    state: {},
    due: NOW,
  });
  return { app, call, store, card };
}

describe("vocabulary routes", () => {
  it("requires a session", async () => {
    const { app } = await setup();
    expect((await app.request("/api/vocabulary/queue")).status).toBe(401);
  });

  it("serves the queue and records a Good review", async () => {
    const { call, store, card } = await setup();
    const queue = QueueResponse.parse(await (await call("/queue?limit=10")).json());
    expect(queue.cards.map((c) => c.id)).toEqual([card.id]);

    const res = await call(`/cards/${card.id}/review`, {
      method: "POST",
      body: { rating: 3, answer: "thrive" },
    });
    expect(res.status).toBe(200);
    const review = ReviewResponse.parse(await res.json());
    expect(new Date(review.due).getTime()).toBeGreaterThan(NOW.getTime());
    expect(store.reviews).toHaveLength(1);
    expect(QueueResponse.parse(await (await call("/queue")).json()).cards).toHaveLength(0);
  });

  it("rejects bad ratings, bad limits and unknown ids", async () => {
    const { call, card } = await setup();
    const bad = await call(`/cards/${card.id}/review`, { method: "POST", body: { rating: 5 } });
    expect(bad.status).toBe(400);
    expect((await call("/queue?limit=0")).status).toBe(400);
    expect((await call("/cards/nope/review", { method: "POST", body: { rating: 3 } })).status).toBe(
      404,
    );
    expect((await call(`/cards/${crypto.randomUUID()}`, { method: "DELETE" })).status).toBe(404);
  });

  it("lists, searches, edits, suspends and deletes cards", async () => {
    const { call, card } = await setup();
    const list = CardsListResponse.parse(await (await call("/cards?source=word&q=THRIVE")).json());
    expect(list.cards.map((c) => c.id)).toEqual([card.id]);
    const none = CardsListResponse.parse(await (await call("/cards?source=own_error")).json());
    expect(none.cards).toHaveLength(0);

    const edited = CardView.parse(
      await (
        await call(`/cards/${card.id}`, {
          method: "PATCH",
          body: { back: "prosperar", suspended: true },
        })
      ).json(),
    );
    expect(edited).toMatchObject({ back: "prosperar", suspended: true });
    expect((await call(`/cards/${card.id}`, { method: "PATCH", body: {} })).status).toBe(400);

    expect(await (await call(`/cards/${card.id}`, { method: "DELETE" })).json()).toEqual({
      deleted: true,
    });
    expect(CardsListResponse.parse(await (await call("/cards")).json()).cards).toHaveLength(0);
  });

  it("serves stats and records a finished session", async () => {
    const { call, store } = await setup();
    const stats = StatsResponse.parse(await (await call("/stats")).json());
    expect(stats).toMatchObject({ total: 1, newAvailable: 1, learned: 0 });

    const res = await call("/sessions", {
      method: "POST",
      body: { reviewed: 1, again: 0, hard: 0, good: 1, easy: 0 },
    });
    expect(await res.json()).toEqual({ recorded: true });
    expect(store.events.map((e) => e.type)).toEqual(["srs_session_completed"]);
  });
});
