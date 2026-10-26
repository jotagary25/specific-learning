// In-memory VocabularyStore for tests. Single-learner fake: user ids are accepted and ignored
// (isolation is covered by the DB integration test).

import { randomUUID } from "node:crypto";
import { isNew } from "./srs.ts";
import type { CardRecord, MissedItem, VocabularyStore } from "./vocabulary.store.ts";

export type MemoryVocabularyStore = VocabularyStore & {
  cards: CardRecord[];
  reviews: Array<{ cardId: string; rating: number; reviewedAt: Date; answer: string | null }>;
  items: MissedItem[];
  events: Array<{ type: string; payload: Record<string, unknown> }>;
};

const clone = <T>(value: T): T => structuredClone(value);

export function createMemoryVocabularyStore(): MemoryVocabularyStore {
  const cards: CardRecord[] = [];
  const reviews: MemoryVocabularyStore["reviews"] = [];
  const items: MissedItem[] = [];
  const events: MemoryVocabularyStore["events"] = [];
  const active = (c: CardRecord) => !c.suspended;
  const dueAt = (now: Date) =>
    cards
      .filter((c) => active(c) && !isNew(c.state) && c.due.getTime() <= now.getTime())
      .sort((a, b) => a.due.getTime() - b.due.getTime());

  return {
    cards,
    reviews,
    items,
    events,

    async listCards(_userId, filter) {
      const q = filter.q?.trim().toLowerCase();
      return cards
        .filter((c) => !filter.source || c.source === filter.source)
        .filter((c) => !q || `${c.front}\n${c.back}`.toLowerCase().includes(q))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(clone);
    },

    async getCard(_userId, id) {
      const card = cards.find((c) => c.id === id);
      return card ? clone(card) : undefined;
    },

    async findCardByRef(_userId, source, key, value) {
      const card = cards.find((c) => c.source === source && c.ref[key] === value);
      return card ? clone(card) : undefined;
    },

    async insertCard(_userId, value) {
      // Strictly increasing creation times keep "oldest first" deterministic.
      const last = cards.at(-1)?.createdAt.getTime() ?? 0;
      const card: CardRecord = {
        ...clone(value),
        suspended: false,
        id: randomUUID(),
        createdAt: new Date(Math.max(Date.now(), last + 1)),
      };
      cards.push(card);
      return clone(card);
    },

    async updateCard(_userId, id, patch) {
      const card = cards.find((c) => c.id === id);
      if (!card) return undefined;
      Object.assign(card, clone(patch));
      return clone(card);
    },

    async deleteCard(_userId, id) {
      const index = cards.findIndex((c) => c.id === id);
      if (index < 0) return false;
      cards.splice(index, 1);
      for (let i = reviews.length - 1; i >= 0; i--) {
        if (reviews[i]?.cardId === id) reviews.splice(i, 1);
      }
      return true;
    },

    async dueCards(_userId, now, limit) {
      return dueAt(now).slice(0, limit).map(clone);
    },

    async countDue(_userId, now) {
      return dueAt(now).length;
    },

    async newCards(_userId, limit) {
      return cards
        .filter((c) => active(c) && isNew(c.state))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, Math.max(0, limit))
        .map(clone);
    },

    async countFirstReviewsSince(_userId, since) {
      const first = new Map<string, number>();
      for (const r of reviews) {
        const t = r.reviewedAt.getTime();
        first.set(r.cardId, Math.min(first.get(r.cardId) ?? t, t));
      }
      return [...first.values()].filter((t) => t >= since.getTime()).length;
    },

    async reviewTimesSince(_userId, since) {
      return reviews
        .filter((r) => r.reviewedAt.getTime() >= since.getTime())
        .map((r) => new Date(r.reviewedAt));
    },

    async recordReview(_userId, id, rating, next, reviewedAt, answer) {
      const card = cards.find((c) => c.id === id);
      if (!card) return undefined;
      card.state = clone(next.state);
      card.due = new Date(next.due);
      reviews.push({
        cardId: id,
        rating,
        reviewedAt: new Date(reviewedAt),
        answer: answer ?? null,
      });
      return clone(card);
    },

    async getMissedItem(itemId) {
      const item = items.find((i) => i.itemId === itemId);
      return item ? clone(item) : undefined;
    },

    async insertEvent(_userId, type, payload) {
      events.push({ type, payload: clone(payload) });
    },
  };
}
