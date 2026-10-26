import type {
  ArticleAnnotations,
  ArticleSourceKind,
  CefrLevel,
  ComprehensionGrade,
  FocusUnit,
  GlossWordOutput,
  ReadingStep,
  RecallQuestionsOutput,
  SpotAttemptView,
} from "@english-course/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import { article, event, readingSession, srsCard, unit } from "../shared/db/schema/index.ts";

export type ArticleRecord = {
  id: string;
  source: ArticleSourceKind;
  url: string;
  title: string;
  authors: string[];
  outlet: string | null;
  license: string | null;
  publishedAt: Date | null;
  text: string;
  topic: string | null;
  estLevel: CefrLevel | null;
  /** YYYY-MM-DD, the day it was the daily article. */
  selectedFor: string | null;
  annotations: ArticleAnnotations | null;
};

export type NewArticle = Omit<ArticleRecord, "id">;

/**
 * Session state that has no dedicated column yet (see the T10 schema notes): kept as tagged
 * entries in `reading_session.answers`.
 */
export type SessionEntry =
  | { type: "step"; step: ReadingStep }
  | { type: "question"; qid: number; answer: string; grade: ComprehensionGrade | null }
  | { type: "gloss"; word: string; gloss: GlossWordOutput }
  | { type: "retell"; text: string; grade: ComprehensionGrade | null }
  | { type: "spots-revealed" }
  | { type: "recall-questions"; questions: RecallQuestionsOutput["questions"] }
  | { type: "recall-answer"; qid: number; answer: string; grade: ComprehensionGrade | null };

export type SessionRecord = {
  id: string | null;
  articleId: string;
  prediction: string | null;
  opinion: string | null;
  entries: SessionEntry[];
  spots: SpotAttemptView[];
  completedAt: Date | null;
};

export type WordCardInput = {
  articleId: string;
  word: string;
  front: string;
  back: string;
  ref: Record<string, unknown>;
};

/** Persistence port of the Reading feature. */
export interface ReadingStore {
  getArticleForDate(date: string): Promise<ArticleRecord | undefined>;
  getArticle(id: string): Promise<ArticleRecord | undefined>;
  /** Daily articles (selected_for set), newest day first, with whether the session completed. */
  listDailyArticles(): Promise<Array<ArticleRecord & { completed: boolean }>>;
  /** Daily articles before `date`, newest first. */
  recentArticles(beforeDate: string, limit: number): Promise<ArticleRecord[]>;
  /** The subset of `urls` already stored. */
  usedUrls(urls: string[]): Promise<Set<string>>;
  /** Inserts the daily article; when the day already has one, returns it with `created: false`. */
  insertArticle(value: NewArticle): Promise<{ article: ArticleRecord; created: boolean }>;
  setAnnotations(id: string, annotations: ArticleAnnotations): Promise<void>;
  /** The learner's lowest not-completed unit (the last unit once all are done). */
  currentUnit(): Promise<FocusUnit | null>;
  /** Words already saved from any article (lower case). */
  knownWords(): Promise<string[]>;
  /** Words saved from one article (lower case). */
  savedWords(articleId: string): Promise<string[]>;
  getSession(articleId: string): Promise<SessionRecord | undefined>;
  saveSession(session: SessionRecord): Promise<SessionRecord>;
  findWordCard(articleId: string, word: string): Promise<string | undefined>;
  insertWordCard(value: WordCardInput): Promise<string>;
  /** Sets completed_at and writes the event in one transaction, only once. */
  completeSession(sessionId: string, payload: Record<string, unknown>): Promise<boolean>;
  insertEvent(type: string, payload: Record<string, unknown>): Promise<void>;
}

export const emptySession = (articleId: string): SessionRecord => ({
  id: null,
  articleId,
  prediction: null,
  opinion: null,
  entries: [],
  spots: [],
  completedAt: null,
});

/** Unit as a grammar target; book subtitles may already carry their parentheses. */
export function unitFocus(row: { id: number; title: string; subtitle: string }): FocusUnit {
  const subtitle = row.subtitle.trim();
  const wrapped = /^\(.*\)$/.test(subtitle) ? subtitle : `(${subtitle})`;
  return {
    id: row.id,
    title: row.title,
    grammarFocus: subtitle ? `${row.title} ${wrapped}` : row.title,
  };
}

function toArticle(row: typeof article.$inferSelect): ArticleRecord {
  return {
    id: row.id,
    source: row.source,
    url: row.url,
    title: row.title,
    authors: row.authors,
    outlet: row.outlet,
    license: row.license,
    publishedAt: row.publishedAt,
    text: row.text,
    topic: row.topic,
    estLevel: (row.estLevel as CefrLevel | null) ?? null,
    selectedFor: row.selectedFor,
    annotations: (row.annotations as ArticleAnnotations | null) ?? null,
  };
}

function toSession(row: typeof readingSession.$inferSelect): SessionRecord {
  return {
    id: row.id,
    articleId: row.articleId,
    prediction: row.prediction,
    opinion: row.opinion,
    entries: (row.answers ?? []) as unknown as SessionEntry[],
    spots: (row.spots ?? []) as unknown as SpotAttemptView[],
    completedAt: row.completedAt,
  };
}

const wordOfRef = sql<string>`lower(${srsCard.ref}->>'word')`;

export function createDrizzleReadingStore(db: Db): ReadingStore {
  async function getArticleForDate(date: string) {
    const [row] = await db.select().from(article).where(eq(article.selectedFor, date)).limit(1);
    return row ? toArticle(row) : undefined;
  }

  return {
    getArticleForDate,

    async getArticle(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
      const [row] = await db.select().from(article).where(eq(article.id, id)).limit(1);
      return row ? toArticle(row) : undefined;
    },

    async listDailyArticles() {
      const rows = await db
        .select({ article, completedAt: readingSession.completedAt })
        .from(article)
        .leftJoin(readingSession, eq(readingSession.articleId, article.id))
        .where(isNotNull(article.selectedFor))
        .orderBy(desc(article.selectedFor));
      const byId = new Map<string, ArticleRecord & { completed: boolean }>();
      for (const row of rows) {
        const existing = byId.get(row.article.id);
        const completed = row.completedAt !== null;
        if (existing) existing.completed ||= completed;
        else byId.set(row.article.id, { ...toArticle(row.article), completed });
      }
      return [...byId.values()];
    },

    async recentArticles(beforeDate, limit) {
      const rows = await db
        .select()
        .from(article)
        .where(and(isNotNull(article.selectedFor), sql`${article.selectedFor} < ${beforeDate}`))
        .orderBy(desc(article.selectedFor))
        .limit(limit);
      return rows.map(toArticle);
    },

    async usedUrls(urls) {
      if (urls.length === 0) return new Set();
      const rows = await db
        .select({ url: article.url })
        .from(article)
        .where(inArray(article.url, urls));
      return new Set(rows.map((r) => r.url));
    },

    async insertArticle(value) {
      const [row] = await db
        .insert(article)
        .values({
          source: value.source,
          url: value.url,
          title: value.title,
          authors: value.authors,
          outlet: value.outlet,
          license: value.license,
          publishedAt: value.publishedAt,
          text: value.text,
          topic: value.topic,
          estLevel: value.estLevel,
          selectedFor: value.selectedFor,
          annotations: value.annotations as Record<string, unknown> | null,
        })
        .onConflictDoNothing()
        .returning();
      if (row) return { article: toArticle(row), created: true };
      const existing = value.selectedFor ? await getArticleForDate(value.selectedFor) : undefined;
      if (!existing) throw new Error(`article ${value.url} already stored`);
      return { article: existing, created: false };
    },

    async setAnnotations(id, annotations) {
      await db
        .update(article)
        .set({ annotations: annotations as Record<string, unknown> })
        .where(eq(article.id, id));
    },

    async currentUnit() {
      const columns = { id: unit.id, title: unit.title, subtitle: unit.subtitle };
      const [open] = await db
        .select(columns)
        .from(unit)
        .where(isNull(unit.completedAt))
        .orderBy(asc(unit.id))
        .limit(1);
      if (open) return unitFocus(open);
      const [last] = await db.select(columns).from(unit).orderBy(desc(unit.id)).limit(1);
      return last ? unitFocus(last) : null;
    },

    async knownWords() {
      const rows = await db
        .selectDistinct({ word: wordOfRef })
        .from(srsCard)
        .where(eq(srsCard.source, "word"));
      return rows.map((r) => r.word).filter(Boolean);
    },

    async savedWords(articleId) {
      const rows = await db
        .select({ word: wordOfRef })
        .from(srsCard)
        .where(and(eq(srsCard.source, "word"), sql`${srsCard.ref}->>'articleId' = ${articleId}`))
        .orderBy(asc(srsCard.createdAt));
      return rows.map((r) => r.word).filter(Boolean);
    },

    async getSession(articleId) {
      const [row] = await db
        .select()
        .from(readingSession)
        .where(eq(readingSession.articleId, articleId))
        .orderBy(asc(readingSession.startedAt))
        .limit(1);
      return row ? toSession(row) : undefined;
    },

    async saveSession(session) {
      const values = {
        prediction: session.prediction,
        opinion: session.opinion,
        answers: session.entries as unknown as Record<string, unknown>[],
        spots: session.spots as unknown as Record<string, unknown>[],
      };
      if (session.id) {
        await db.update(readingSession).set(values).where(eq(readingSession.id, session.id));
        return session;
      }
      const [row] = await db
        .insert(readingSession)
        .values({ articleId: session.articleId, ...values })
        .returning();
      if (!row) throw new Error("reading session insert returned no row");
      return toSession(row);
    },

    async findWordCard(articleId, word) {
      const [row] = await db
        .select({ id: srsCard.id })
        .from(srsCard)
        .where(
          and(
            eq(srsCard.source, "word"),
            sql`${srsCard.ref}->>'articleId' = ${articleId}`,
            sql`${wordOfRef} = ${word.toLowerCase()}`,
          ),
        )
        .limit(1);
      return row?.id;
    },

    async insertWordCard(value) {
      const [row] = await db
        .insert(srsCard)
        .values({
          source: "word",
          front: value.front,
          back: value.back,
          ref: { ...value.ref, articleId: value.articleId, word: value.word },
          // Not scheduled yet: the SRS feature (T11) creates the FSRS state on first review.
          state: {},
          due: sql`now()`,
        })
        .returning({ id: srsCard.id });
      if (!row) throw new Error("srs card insert returned no row");
      return row.id;
    },

    async completeSession(sessionId, payload) {
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(readingSession)
          .set({ completedAt: sql`now()` })
          .where(and(eq(readingSession.id, sessionId), isNull(readingSession.completedAt)))
          .returning({ id: readingSession.id });
        if (updated.length === 0) return false;
        await tx.insert(event).values({ type: "reading_completed", payload });
        return true;
      });
    },

    async insertEvent(type, payload) {
      await db.insert(event).values({ type, payload });
    },
  };
}
