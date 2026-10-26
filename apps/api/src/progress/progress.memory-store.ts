// In-memory ProgressStore for tests: fixture arrays that tests fill directly.

import { randomUUID } from "node:crypto";
import type {
  CanDoRecord,
  ErrorRecord,
  EventRecord,
  ProgressStore,
  ReadingRecord,
  SubmissionRecord,
  UnitRecord,
  WordCardRecord,
} from "./progress.store.ts";

export type MemoryProgressStore = ProgressStore & {
  events: EventRecord[];
  canDos: CanDoRecord[];
  units: UnitRecord[];
  cards: WordCardRecord[];
  submissions: SubmissionRecord[];
  errors: ErrorRecord[];
  readings: ReadingRecord[];
  articles: Map<string, string>;
};

const byTime = <T extends { createdAt: Date }>(a: T, b: T) =>
  a.createdAt.getTime() - b.createdAt.getTime();

export function createMemoryProgressStore(now: () => Date = () => new Date()): MemoryProgressStore {
  const store: MemoryProgressStore = {
    events: [],
    canDos: [],
    units: [],
    cards: [],
    submissions: [],
    errors: [],
    readings: [],
    articles: new Map(),

    async listEvents(filter = {}) {
      return store.events
        .filter(
          (e) =>
            (!filter.types || filter.types.includes(e.type)) &&
            (!filter.from || e.createdAt >= filter.from) &&
            (!filter.to || e.createdAt < filter.to),
        )
        .sort(byTime)
        .map((e) => structuredClone(e));
    },

    async firstEventAt(exceptTypes = []) {
      return [...store.events].filter((e) => !exceptTypes.includes(e.type)).sort(byTime)[0]
        ?.createdAt;
    },

    async insertEvent(type, payload) {
      const record = { type, payload: structuredClone(payload), createdAt: now() };
      store.events.push(record);
      return structuredClone(record);
    },

    async listCanDo() {
      return [...store.canDos].sort((a, b) => byTime(b, a)).map((c) => ({ ...c }));
    },

    async insertCanDo(text) {
      const record = { id: randomUUID(), text, source: "learner", createdAt: now() };
      store.canDos.push(record);
      return { ...record };
    },

    async listUnits() {
      return structuredClone(store.units);
    },

    async listWordCards() {
      return structuredClone(store.cards);
    },

    async listSubmissions() {
      return structuredClone([...store.submissions].sort(byTime));
    },

    async listErrors() {
      return structuredClone([...store.errors].sort(byTime));
    },

    async listReadings() {
      return structuredClone(
        [...store.readings].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()),
      );
    },

    async getArticleText(articleId) {
      return store.articles.get(articleId);
    },
  };
  return store;
}
