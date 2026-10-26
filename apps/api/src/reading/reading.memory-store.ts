// In-memory ReadingStore for tests. Single-learner fake: user ids are accepted and ignored
// (isolation is covered by the DB integration test).

import { randomUUID } from "node:crypto";
import type { ArticleAnnotations, FocusUnit } from "@english-course/shared";
import type { ArticleRecord, ReadingStore, SessionRecord } from "./reading.store.ts";

export type MemoryReadingStore = ReadingStore & {
  articles: ArticleRecord[];
  sessions: SessionRecord[];
  cards: Array<{
    id: string;
    articleId: string;
    word: string;
    front: string;
    back: string;
    ref: Record<string, unknown>;
  }>;
  events: Array<{ type: string; payload: Record<string, unknown> }>;
  unit: FocusUnit | null;
};

const clone = <T>(value: T): T => structuredClone(value);

export function createMemoryReadingStore(
  unit: FocusUnit | null = {
    id: 1,
    title: "Present continuous",
    grammarFocus: "Present continuous (I am doing)",
  },
): MemoryReadingStore {
  const articles: ArticleRecord[] = [];
  const sessions: SessionRecord[] = [];
  const cards: MemoryReadingStore["cards"] = [];
  const events: MemoryReadingStore["events"] = [];
  const completedIds = () => new Set(sessions.filter((s) => s.completedAt).map((s) => s.articleId));

  const store: MemoryReadingStore = {
    articles,
    sessions,
    cards,
    events,
    unit,

    async getArticleForDate(_userId, date) {
      return clone(articles.find((a) => a.selectedFor === date));
    },
    async getArticle(_userId, id) {
      return clone(articles.find((a) => a.id === id));
    },
    async listDailyArticles(_userId) {
      const done = completedIds();
      return articles
        .filter((a) => a.selectedFor)
        .sort((a, b) => String(b.selectedFor).localeCompare(String(a.selectedFor)))
        .map((a) => ({ ...clone(a), completed: done.has(a.id) }));
    },
    async recentArticles(_userId, beforeDate, limit) {
      return articles
        .filter((a) => a.selectedFor && a.selectedFor < beforeDate)
        .sort((a, b) => String(b.selectedFor).localeCompare(String(a.selectedFor)))
        .slice(0, limit)
        .map(clone);
    },
    async usedUrls(_userId, urls) {
      return new Set(urls.filter((url) => articles.some((a) => a.url === url)));
    },
    async insertArticle(_userId, value) {
      const existing = articles.find((a) => a.selectedFor && a.selectedFor === value.selectedFor);
      if (existing) return { article: clone(existing), created: false };
      const record = { ...clone(value), id: randomUUID() };
      articles.push(record);
      return { article: clone(record), created: true };
    },
    async setAnnotations(id, annotations: ArticleAnnotations) {
      const found = articles.find((a) => a.id === id);
      if (found) found.annotations = clone(annotations);
    },
    async currentUnit(_userId) {
      return store.unit;
    },
    async knownWords(_userId) {
      return [...new Set(cards.map((c) => c.word))];
    },
    async savedWords(_userId, articleId) {
      return cards.filter((c) => c.articleId === articleId).map((c) => c.word);
    },
    async getSession(_userId, articleId) {
      return clone(sessions.find((s) => s.articleId === articleId));
    },
    async saveSession(_userId, session) {
      if (session.id) {
        const index = sessions.findIndex((s) => s.id === session.id);
        sessions[index] = clone(session);
        return clone(session);
      }
      const record = { ...clone(session), id: randomUUID() };
      sessions.push(record);
      return clone(record);
    },
    async findWordCard(_userId, articleId, word) {
      return cards.find((c) => c.articleId === articleId && c.word === word.toLowerCase())?.id;
    },
    async insertWordCard(_userId, value) {
      const id = randomUUID();
      cards.push({ ...clone(value), id, word: value.word.toLowerCase() });
      return id;
    },
    async completeSession(_userId, sessionId, payload) {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session || session.completedAt) return false;
      session.completedAt = new Date();
      events.push({ type: "reading_completed", payload });
      return true;
    },
    async insertEvent(_userId, type, payload) {
      events.push({ type, payload });
    },
  };
  return store;
}
