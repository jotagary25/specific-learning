import { and, asc, desc, eq, gte, inArray, lt, min, notInArray, type SQL } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import {
  article,
  canDo,
  event,
  readingSession,
  srsCard,
  unit,
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

/** Persistence port of the Progress feature. */
export interface ProgressStore {
  /** Oldest first; `to` is exclusive. */
  listEvents(filter?: EventFilter): Promise<EventRecord[]>;
  /** Time of the oldest event whose type is not in `exceptTypes`. */
  firstEventAt(exceptTypes?: string[]): Promise<Date | undefined>;
  insertEvent(type: string, payload: Record<string, unknown>): Promise<EventRecord>;
  /** Newest first. */
  listCanDo(): Promise<CanDoRecord[]>;
  insertCanDo(text: string): Promise<CanDoRecord>;
  listUnits(): Promise<UnitRecord[]>;
  listWordCards(): Promise<WordCardRecord[]>;
  /** Oldest first. */
  listSubmissions(): Promise<SubmissionRecord[]>;
  /** Oldest first. */
  listErrors(): Promise<ErrorRecord[]>;
  /** Oldest first (by start). */
  listReadings(): Promise<ReadingRecord[]>;
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

export function createDrizzleProgressStore(db: Db): ProgressStore {
  return {
    async listEvents(filter = {}) {
      const where: SQL[] = [];
      if (filter.types) where.push(inArray(event.type, filter.types));
      if (filter.from) where.push(gte(event.createdAt, filter.from));
      if (filter.to) where.push(lt(event.createdAt, filter.to));
      return db
        .select({ type: event.type, payload: event.payload, createdAt: event.createdAt })
        .from(event)
        .where(and(...where))
        .orderBy(asc(event.createdAt), asc(event.id));
    },

    async firstEventAt(exceptTypes = []) {
      const [row] = await db
        .select({ at: min(event.createdAt) })
        .from(event)
        .where(exceptTypes.length ? notInArray(event.type, exceptTypes) : undefined);
      return row?.at ?? undefined;
    },

    async insertEvent(type, payload) {
      const [row] = await db
        .insert(event)
        .values({ type, payload })
        .returning({ type: event.type, payload: event.payload, createdAt: event.createdAt });
      if (!row) throw new Error("event insert returned no row");
      return row;
    },

    async listCanDo() {
      return db.select().from(canDo).orderBy(desc(canDo.createdAt), desc(canDo.id));
    },

    async insertCanDo(text) {
      const [row] = await db.insert(canDo).values({ text, source: "learner" }).returning();
      if (!row) throw new Error("can_do insert returned no row");
      return row;
    },

    async listUnits() {
      const rows = await db
        .select({
          id: unit.id,
          title: unit.title,
          status: unit.status,
          completedAt: unit.completedAt,
          extras: unit.extras,
        })
        .from(unit)
        .orderBy(asc(unit.id));
      return rows.map(({ extras, ...rest }) => ({ ...rest, canDo: canDoOf(extras) }));
    },

    async listWordCards() {
      const rows = await db
        .select({ ref: srsCard.ref, state: srsCard.state })
        .from(srsCard)
        .where(eq(srsCard.source, "word"))
        .orderBy(asc(srsCard.createdAt));
      return rows.flatMap(({ ref, state }) => {
        const word = str(ref.word)?.trim().toLowerCase();
        return word ? [{ word, articleId: str(ref.articleId), state }] : [];
      });
    },

    async listSubmissions() {
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
        .orderBy(asc(writingSubmission.createdAt), asc(writingSubmission.id));
    },

    async listErrors() {
      return db
        .select({
          submissionId: writingError.submissionId,
          type: writingError.type,
          unitId: writingError.unitId,
          createdAt: writingError.createdAt,
        })
        .from(writingError)
        .orderBy(asc(writingError.createdAt), asc(writingError.id));
    },

    async listReadings() {
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
