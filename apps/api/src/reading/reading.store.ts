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
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import {
  article,
  dailyArticle,
  event,
  readingSession,
  srsCard,
  unit,
  unitProgress,
} from "../shared/db/schema/index.ts";

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
  /** YYYY-MM-DD, the day it was this user's daily article (`daily_article`). */
  selectedFor: string | null;
  /** The user's annotations (personalised to their unit and known words, `daily_article`). */
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

/**
 * Persistence port of the Reading feature. Articles are a shared pool of unmodified text and
 * metadata; which article a user reads on a day and its annotations (`daily_article`),
 * sessions, word cards and events belong to one user.
 */
export interface ReadingStore {
  getArticleForDate(userId: string, date: string): Promise<ArticleRecord | undefined>;
  /** One of the user's daily articles; articles never assigned to the user are not found. */
  getArticle(userId: string, id: string): Promise<ArticleRecord | undefined>;
  /** The user's daily articles, newest day first, with whether their session completed. */
  listDailyArticles(userId: string): Promise<Array<ArticleRecord & { completed: boolean }>>;
  /** The user's daily articles before `date`, newest first. */
  recentArticles(userId: string, beforeDate: string, limit: number): Promise<ArticleRecord[]>;
  /** The subset of `urls` the user already had as a daily article. */
  usedUrls(userId: string, urls: string[]): Promise<Set<string>>;
  /**
   * Stores the article in the shared pool (reusing it when the URL is already there) and makes
   * it the user's article for `value.selectedFor`, with the user's annotations. When the user's
   * day already has one, returns it with `created: false`.
   */
  insertArticle(
    userId: string,
    value: NewArticle & { selectedFor: string },
  ): Promise<{ article: ArticleRecord; created: boolean }>;
  /** The user's annotations of one of their daily articles. */
  setAnnotations(userId: string, articleId: string, annotations: ArticleAnnotations): Promise<void>;
  /** The user's lowest not-completed unit (the last unit once all are done). */
  currentUnit(userId: string): Promise<FocusUnit | null>;
  /** Words the user already saved from any article (lower case). */
  knownWords(userId: string): Promise<string[]>;
  /** Words the user saved from one article (lower case). */
  savedWords(userId: string, articleId: string): Promise<string[]>;
  getSession(userId: string, articleId: string): Promise<SessionRecord | undefined>;
  saveSession(userId: string, session: SessionRecord): Promise<SessionRecord>;
  findWordCard(userId: string, articleId: string, word: string): Promise<string | undefined>;
  insertWordCard(userId: string, value: WordCardInput): Promise<string>;
  /** Sets completed_at and writes the event in one transaction, only once. */
  completeSession(
    userId: string,
    sessionId: string,
    payload: Record<string, unknown>,
  ): Promise<boolean>;
  insertEvent(userId: string, type: string, payload: Record<string, unknown>): Promise<void>;
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

type DailyRow = {
  article: typeof article.$inferSelect;
  date: string;
  annotations: Record<string, unknown> | null;
};

function toArticle(row: DailyRow): ArticleRecord {
  const { article: a } = row;
  return {
    id: a.id,
    source: a.source,
    url: a.url,
    title: a.title,
    authors: a.authors,
    outlet: a.outlet,
    license: a.license,
    publishedAt: a.publishedAt,
    text: a.text,
    topic: a.topic,
    estLevel: (a.estLevel as CefrLevel | null) ?? null,
    selectedFor: row.date,
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
const UUID = /^[0-9a-f-]{36}$/i;

const dailyColumns = {
  article,
  date: dailyArticle.date,
  annotations: dailyArticle.annotations,
};

export function createDrizzleReadingStore(db: Db): ReadingStore {
  /** Daily-article rows with their article; callers add the user filter in `where`. */
  const dailyOf = () =>
    db
      .select(dailyColumns)
      .from(dailyArticle)
      .innerJoin(article, eq(article.id, dailyArticle.articleId))
      .$dynamic();

  async function getArticleForDate(userId: string, date: string) {
    const [row] = await dailyOf()
      .where(and(eq(dailyArticle.userId, userId), eq(dailyArticle.date, date)))
      .limit(1);
    return row ? toArticle(row) : undefined;
  }

  const ownWordCards = (userId: string) =>
    and(eq(srsCard.userId, userId), eq(srsCard.source, "word"));

  return {
    getArticleForDate,

    async getArticle(userId, id) {
      if (!UUID.test(id)) return undefined;
      const [row] = await dailyOf()
        .where(and(eq(dailyArticle.userId, userId), eq(dailyArticle.articleId, id)))
        .orderBy(asc(dailyArticle.date))
        .limit(1);
      return row ? toArticle(row) : undefined;
    },

    async listDailyArticles(userId) {
      const rows = await db
        .select({ ...dailyColumns, completedAt: readingSession.completedAt })
        .from(dailyArticle)
        .innerJoin(article, eq(article.id, dailyArticle.articleId))
        .leftJoin(
          readingSession,
          and(eq(readingSession.articleId, article.id), eq(readingSession.userId, userId)),
        )
        .where(eq(dailyArticle.userId, userId))
        .orderBy(desc(dailyArticle.date));
      const byId = new Map<string, ArticleRecord & { completed: boolean }>();
      for (const row of rows) {
        const existing = byId.get(row.article.id);
        const completed = row.completedAt !== null;
        if (existing) existing.completed ||= completed;
        else byId.set(row.article.id, { ...toArticle(row), completed });
      }
      return [...byId.values()];
    },

    async recentArticles(userId, beforeDate, limit) {
      const rows = await dailyOf()
        .where(and(eq(dailyArticle.userId, userId), lt(dailyArticle.date, beforeDate)))
        .orderBy(desc(dailyArticle.date))
        .limit(limit);
      return rows.map((row) => toArticle(row));
    },

    async usedUrls(userId, urls) {
      if (urls.length === 0) return new Set();
      const rows = await db
        .select({ url: article.url })
        .from(dailyArticle)
        .innerJoin(article, eq(article.id, dailyArticle.articleId))
        .where(and(eq(dailyArticle.userId, userId), inArray(article.url, urls)));
      return new Set(rows.map((r) => r.url));
    },

    async insertArticle(userId, value) {
      return db.transaction(async (tx) => {
        // Shared pool, one row per URL: a second user picking it reuses the row as it is (the
        // no-op update makes `returning` yield the existing row).
        const [stored] = await tx
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
          })
          .onConflictDoUpdate({ target: article.url, set: { url: sql`excluded.url` } })
          .returning();
        if (!stored) throw new Error(`article ${value.url} upsert returned no row`);
        const linked = await tx
          .insert(dailyArticle)
          .values({
            userId,
            date: value.selectedFor,
            articleId: stored.id,
            annotations: value.annotations as Record<string, unknown> | null,
          })
          .onConflictDoNothing()
          .returning({ date: dailyArticle.date, annotations: dailyArticle.annotations });
        const [created] = linked;
        if (created) return { article: toArticle({ article: stored, ...created }), created: true };
        const [existing] = await tx
          .select(dailyColumns)
          .from(dailyArticle)
          .innerJoin(article, eq(article.id, dailyArticle.articleId))
          .where(and(eq(dailyArticle.userId, userId), eq(dailyArticle.date, value.selectedFor)));
        if (!existing) throw new Error(`daily article for ${value.selectedFor} vanished`);
        return { article: toArticle(existing), created: false };
      });
    },

    async setAnnotations(userId, articleId, annotations) {
      await db
        .update(dailyArticle)
        .set({ annotations: annotations as Record<string, unknown> })
        .where(and(eq(dailyArticle.userId, userId), eq(dailyArticle.articleId, articleId)));
    },

    async currentUnit(userId) {
      const columns = { id: unit.id, title: unit.title, subtitle: unit.subtitle };
      const [open] = await db
        .select(columns)
        .from(unit)
        .leftJoin(
          unitProgress,
          and(eq(unitProgress.unitId, unit.id), eq(unitProgress.userId, userId)),
        )
        .where(isNull(unitProgress.completedAt))
        .orderBy(asc(unit.id))
        .limit(1);
      if (open) return unitFocus(open);
      const [last] = await db.select(columns).from(unit).orderBy(desc(unit.id)).limit(1);
      return last ? unitFocus(last) : null;
    },

    async knownWords(userId) {
      const rows = await db
        .selectDistinct({ word: wordOfRef })
        .from(srsCard)
        .where(ownWordCards(userId));
      return rows.map((r) => r.word).filter(Boolean);
    },

    async savedWords(userId, articleId) {
      const rows = await db
        .select({ word: wordOfRef })
        .from(srsCard)
        .where(and(ownWordCards(userId), sql`${srsCard.ref}->>'articleId' = ${articleId}`))
        .orderBy(asc(srsCard.createdAt));
      return rows.map((r) => r.word).filter(Boolean);
    },

    async getSession(userId, articleId) {
      const [row] = await db
        .select()
        .from(readingSession)
        .where(and(eq(readingSession.userId, userId), eq(readingSession.articleId, articleId)))
        .orderBy(asc(readingSession.startedAt))
        .limit(1);
      return row ? toSession(row) : undefined;
    },

    async saveSession(userId, session) {
      const values = {
        prediction: session.prediction,
        opinion: session.opinion,
        answers: session.entries as unknown as Record<string, unknown>[],
        spots: session.spots as unknown as Record<string, unknown>[],
      };
      if (session.id) {
        await db
          .update(readingSession)
          .set(values)
          .where(and(eq(readingSession.id, session.id), eq(readingSession.userId, userId)));
        return session;
      }
      const [row] = await db
        .insert(readingSession)
        .values({ userId, articleId: session.articleId, ...values })
        .returning();
      if (!row) throw new Error("reading session insert returned no row");
      return toSession(row);
    },

    async findWordCard(userId, articleId, word) {
      const [row] = await db
        .select({ id: srsCard.id })
        .from(srsCard)
        .where(
          and(
            ownWordCards(userId),
            sql`${srsCard.ref}->>'articleId' = ${articleId}`,
            sql`${wordOfRef} = ${word.toLowerCase()}`,
          ),
        )
        .limit(1);
      return row?.id;
    },

    async insertWordCard(userId, value) {
      const [row] = await db
        .insert(srsCard)
        .values({
          userId,
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

    async completeSession(userId, sessionId, payload) {
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(readingSession)
          .set({ completedAt: sql`now()` })
          .where(
            and(
              eq(readingSession.id, sessionId),
              eq(readingSession.userId, userId),
              isNull(readingSession.completedAt),
            ),
          )
          .returning({ id: readingSession.id });
        if (updated.length === 0) return false;
        await tx.insert(event).values({ userId, type: "reading_completed", payload });
        return true;
      });
    },

    async insertEvent(userId, type, payload) {
      await db.insert(event).values({ userId, type, payload });
    },
  };
}
