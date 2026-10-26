import { and, asc, desc, eq, gte, inArray, lt, min, notInArray, type SQL } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import {
  article,
  canDo,
  event,
  readingSession,
  srsCard,
  unit,
  unitProgress,
  writingError,
  writingMission,
  writingSubmission,
} from "../shared/db/schema/index.ts";

// Read-only views over the other features' tables. Progress only writes its own rows:
// learner can-do entries and mirror events (`mirror_viewed`, `mirror_reflection`).

export type EventRecord = { type: string; payload: Record<string, unknown>; createdAt: Date };

export type CanDoRecord = { id: string; text: string; source: string; createdAt: Date };

export type UnitRecord = {
  id: number;
  title: string;
  status: string;
  completedAt: Date | null;
  /** Authored "now I can…" statements of the unit. */
  canDo: string[];
};

/** A word card saved while reading; `state` is the raw FSRS jsonb. */
export type WordCardRecord = { word: string; articleId: string | null; state: unknown };

export type SubmissionRecord = {
  id: string;
  missionId: string | null;
  title: string | null;
  format: string | null;
  text: string;
  scores: Record<string, number> | null;
  createdAt: Date;
};

export type ErrorRecord = {
  submissionId: string;
  type: string;
  unitId: number | null;
  createdAt: Date;
};

export type ReadingRecord = {
  articleId: string;
  title: string;
  startedAt: Date;
  completedAt: Date | null;
  /** Words the learner asked a gloss for, in order. */
  glossed: string[];
};

export type EventFilter = { types?: string[]; from?: Date; to?: Date };

/** Persistence port of the Progress feature; every learner read and write is per user. */
export interface ProgressStore {
  /** Oldest first; `to` is exclusive. */
  listEvents(userId: string, filter?: EventFilter): Promise<EventRecord[]>;
  /** Time of the user's oldest event whose type is not in `exceptTypes`. */
  firstEventAt(userId: string, exceptTypes?: string[]): Promise<Date | undefined>;
  insertEvent(userId: string, type: string, payload: Record<string, unknown>): Promise<EventRecord>;
  /** Newest first. */
  listCanDo(userId: string): Promise<CanDoRecord[]>;
  insertCanDo(userId: string, text: string): Promise<CanDoRecord>;
  /** Shared units with the user's status and completion. */
  listUnits(userId: string): Promise<UnitRecord[]>;
  listWordCards(userId: string): Promise<WordCardRecord[]>;
  /** Oldest first. */
  listSubmissions(userId: string): Promise<SubmissionRecord[]>;
  /** Oldest first. */
  listErrors(userId: string): Promise<ErrorRecord[]>;
  /** Oldest first (by start). */
  listReadings(userId: string): Promise<ReadingRecord[]>;
  /** Shared article pool. */
  getArticleText(articleId: string): Promise<string | undefined>;
}

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** Gloss words from the tagged entries kept in `reading_session.answers`. */
export function glossedWords(answers: unknown): string[] {
  if (!Array.isArray(answers)) return [];
  const words: string[] = [];
  for (const entry of answers) {
    if (typeof entry !== "object" || entry === null) continue;
    const { type, word } = entry as { type?: unknown; word?: unknown };
    if (type === "gloss" && typeof word === "string" && word.trim()) words.push(word.trim());
  }
  return words;
}

function canDoOf(extras: unknown): string[] {
  const list = (extras as { canDoEs?: unknown } | null)?.canDoEs;
  return Array.isArray(list) ? list.filter((s): s is string => typeof s === "string") : [];
}

const canDoColumns = {
  id: canDo.id,
  text: canDo.text,
  source: canDo.source,
  createdAt: canDo.createdAt,
};

export function createDrizzleProgressStore(db: Db): ProgressStore {
  return {
    async listEvents(userId, filter = {}) {
      const where: SQL[] = [eq(event.userId, userId)];
      if (filter.types) where.push(inArray(event.type, filter.types));
      if (filter.from) where.push(gte(event.createdAt, filter.from));
      if (filter.to) where.push(lt(event.createdAt, filter.to));
      return db
        .select({ type: event.type, payload: event.payload, createdAt: event.createdAt })
        .from(event)
        .where(and(...where))
        .orderBy(asc(event.createdAt), asc(event.id));
    },

    async firstEventAt(userId, exceptTypes = []) {
      const [row] = await db
        .select({ at: min(event.createdAt) })
        .from(event)
        .where(
          and(
            eq(event.userId, userId),
            exceptTypes.length ? notInArray(event.type, exceptTypes) : undefined,
          ),
        );
      return row?.at ?? undefined;
    },

    async insertEvent(userId, type, payload) {
      const [row] = await db
        .insert(event)
        .values({ userId, type, payload })
        .returning({ type: event.type, payload: event.payload, createdAt: event.createdAt });
      if (!row) throw new Error("event insert returned no row");
      return row;
    },

    async listCanDo(userId) {
      return db
        .select(canDoColumns)
        .from(canDo)
        .where(eq(canDo.userId, userId))
        .orderBy(desc(canDo.createdAt), desc(canDo.id));
    },

    async insertCanDo(userId, text) {
      const [row] = await db
        .insert(canDo)
        .values({ userId, text, source: "learner" })
        .returning(canDoColumns);
      if (!row) throw new Error("can_do insert returned no row");
      return row;
    },

    async listUnits(userId) {
      const rows = await db
        .select({
          id: unit.id,
          title: unit.title,
          status: unitProgress.status,
          completedAt: unitProgress.completedAt,
          extras: unit.extras,
        })
        .from(unit)
        .leftJoin(
          unitProgress,
          and(eq(unitProgress.unitId, unit.id), eq(unitProgress.userId, userId)),
        )
        .orderBy(asc(unit.id));
      return rows.map(({ extras, status, ...rest }) => ({
        ...rest,
        status: status ?? "new",
        canDo: canDoOf(extras),
      }));
    },

    async listWordCards(userId) {
      const rows = await db
        .select({ ref: srsCard.ref, state: srsCard.state })
        .from(srsCard)
        .where(and(eq(srsCard.userId, userId), eq(srsCard.source, "word")))
        .orderBy(asc(srsCard.createdAt));
      return rows.flatMap(({ ref, state }) => {
        const word = str(ref.word)?.trim().toLowerCase();
        return word ? [{ word, articleId: str(ref.articleId), state }] : [];
      });
    },

    async listSubmissions(userId) {
      return db
        .select({
          id: writingSubmission.id,
          missionId: writingSubmission.missionId,
          title: writingMission.title,
          format: writingMission.format,
          text: writingSubmission.textOriginal,
          scores: writingSubmission.scores,
          createdAt: writingSubmission.createdAt,
        })
        .from(writingSubmission)
        .leftJoin(writingMission, eq(writingMission.id, writingSubmission.missionId))
        .where(eq(writingSubmission.userId, userId))
        .orderBy(asc(writingSubmission.createdAt), asc(writingSubmission.id));
    },

    async listErrors(userId) {
      return db
        .select({
          submissionId: writingError.submissionId,
          type: writingError.type,
          unitId: writingError.unitId,
          createdAt: writingError.createdAt,
        })
        .from(writingError)
        .where(eq(writingError.userId, userId))
        .orderBy(asc(writingError.createdAt), asc(writingError.id));
    },

    async listReadings(userId) {
      const rows = await db
        .select({
          articleId: readingSession.articleId,
          title: article.title,
          startedAt: readingSession.startedAt,
          completedAt: readingSession.completedAt,
          answers: readingSession.answers,
        })
        .from(readingSession)
        .innerJoin(article, eq(article.id, readingSession.articleId))
        .where(eq(readingSession.userId, userId))
        .orderBy(asc(readingSession.startedAt), asc(readingSession.id));
      return rows.map(({ answers, ...rest }) => ({ ...rest, glossed: glossedWords(answers) }));
    },

    async getArticleText(articleId) {
      const [row] = await db
        .select({ text: article.text })
        .from(article)
        .where(eq(article.id, articleId))
        .limit(1);
      return row?.text;
    },
  };
}
