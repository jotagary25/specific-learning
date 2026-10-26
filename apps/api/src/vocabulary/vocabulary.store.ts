import type { CardSource, ItemAnswer, Segment } from "@english-course/shared";
import { and, asc, desc, eq, gte, ilike, lte, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import { event, exercise, exerciseItem, srsCard, srsReview } from "../shared/db/schema/index.ts";
import { parseState, type SrsState, storedState } from "./srs.ts";

export type CardRecord = {
  id: string;
  source: CardSource;
  front: string;
  back: string;
  ref: Record<string, unknown>;
  state: SrsState;
  suspended: boolean;
  due: Date;
  createdAt: Date;
};

export type NewCard = {
  source: CardSource;
  front: string;
  back: string;
  ref: Record<string, unknown>;
  state: SrsState;
  due: Date;
};

export type CardFilter = { source?: CardSource; q?: string };

/** An exercise item with what a `unit_item` card needs. */
export type MissedItem = {
  itemId: string;
  unitId: number;
  instruction: string;
  isExample: boolean;
  lines: Segment[][];
  answer: ItemAnswer | null;
};

/**
 * Persistence port of the Vocabulary + SRS feature. Every card, review and event belongs to
 * one user: reads and writes take the user id, and a card id of another user is not found.
 */
export interface VocabularyStore {
  /** Newest first. `q` matches front or back, case-insensitive. */
  listCards(userId: string, filter: CardFilter): Promise<CardRecord[]>;
  getCard(userId: string, id: string): Promise<CardRecord | undefined>;
  /** First card of `source` whose `ref[key]` equals `value`. */
  findCardByRef(
    userId: string,
    source: CardSource,
    key: string,
    value: string,
  ): Promise<CardRecord | undefined>;
  insertCard(userId: string, value: NewCard): Promise<CardRecord>;
  /** Content edit or (un)suspend; keeps state and `due`. */
  updateCard(
    userId: string,
    id: string,
    patch: { front?: string; back?: string; suspended?: boolean },
  ): Promise<CardRecord | undefined>;
  deleteCard(userId: string, id: string): Promise<boolean>;
  /** Scheduled, not suspended cards due at or before `now`, earliest first. */
  dueCards(userId: string, now: Date, limit: number): Promise<CardRecord[]>;
  countDue(userId: string, now: Date): Promise<number>;
  /** Never-reviewed, not suspended cards, oldest first. */
  newCards(userId: string, limit: number): Promise<CardRecord[]>;
  /** Cards whose very first review happened at or after `since`. */
  countFirstReviewsSince(userId: string, since: Date): Promise<number>;
  reviewTimesSince(userId: string, since: Date): Promise<Date[]>;
  /** Writes the review row (with the typed answer, if any) and the new state/due in one transaction. */
  recordReview(
    userId: string,
    id: string,
    rating: number,
    next: { state: SrsState; due: Date },
    reviewedAt: Date,
    answer?: string,
  ): Promise<CardRecord | undefined>;
  /** Shared content: an exercise item with its unit. */
  getMissedItem(itemId: string): Promise<MissedItem | undefined>;
  insertEvent(userId: string, type: string, payload: Record<string, unknown>): Promise<void>;
}

function toCard(row: typeof srsCard.$inferSelect): CardRecord {
  return {
    id: row.id,
    source: row.source,
    front: row.front,
    back: row.back,
    ref: row.ref,
    state: parseState(row.state),
    suspended: row.suspended,
    due: row.due,
    createdAt: row.createdAt,
  };
}

// A null state is a new card; legacy `{}` rows (no `state` key) count as new too.
const isNewCard = sql`(${srsCard.state} ->> 'state') is null`;
const isScheduled = sql`(${srsCard.state} ->> 'state') is not null`;
const notSuspended = eq(srsCard.suspended, false);
const ownCard = (userId: string, id: string) => and(eq(srsCard.userId, userId), eq(srsCard.id, id));

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export function createDrizzleVocabularyStore(db: Db): VocabularyStore {
  return {
    async listCards(userId, filter) {
      const where: SQL[] = [eq(srsCard.userId, userId)];
      if (filter.source) where.push(eq(srsCard.source, filter.source));
      const q = filter.q?.trim();
      if (q) {
        const pattern = `%${escapeLike(q)}%`;
        where.push(or(ilike(srsCard.front, pattern), ilike(srsCard.back, pattern)) as SQL);
      }
      const rows = await db
        .select()
        .from(srsCard)
        .where(and(...where))
        .orderBy(desc(srsCard.createdAt));
      return rows.map(toCard);
    },

    async getCard(userId, id) {
      const [row] = await db.select().from(srsCard).where(ownCard(userId, id)).limit(1);
      return row ? toCard(row) : undefined;
    },

    async findCardByRef(userId, source, key, value) {
      const [row] = await db
        .select()
        .from(srsCard)
        .where(
          and(
            eq(srsCard.userId, userId),
            eq(srsCard.source, source),
            sql`${srsCard.ref} ->> ${key} = ${value}`,
          ),
        )
        .limit(1);
      return row ? toCard(row) : undefined;
    },

    async insertCard(userId, value) {
      const [row] = await db
        .insert(srsCard)
        .values({ ...value, userId, state: storedState(value.state) })
        .returning();
      if (!row) throw new Error("srs card insert returned no row");
      return toCard(row);
    },

    async updateCard(userId, id, patch) {
      const [row] = await db
        .update(srsCard)
        .set({ ...patch, updatedAt: new Date() })
        .where(ownCard(userId, id))
        .returning();
      return row ? toCard(row) : undefined;
    },

    async deleteCard(userId, id) {
      const rows = await db
        .delete(srsCard)
        .where(ownCard(userId, id))
        .returning({ id: srsCard.id });
      return rows.length > 0;
    },

    async dueCards(userId, now, limit) {
      const rows = await db
        .select()
        .from(srsCard)
        .where(and(eq(srsCard.userId, userId), isScheduled, notSuspended, lte(srsCard.due, now)))
        .orderBy(asc(srsCard.due))
        .limit(limit);
      return rows.map(toCard);
    },

    async countDue(userId, now) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(srsCard)
        .where(and(eq(srsCard.userId, userId), isScheduled, notSuspended, lte(srsCard.due, now)));
      return row?.n ?? 0;
    },

    async newCards(userId, limit) {
      if (limit <= 0) return [];
      const rows = await db
        .select()
        .from(srsCard)
        .where(and(eq(srsCard.userId, userId), isNewCard, notSuspended))
        .orderBy(asc(srsCard.createdAt))
        .limit(limit);
      return rows.map(toCard);
    },

    async countFirstReviewsSince(userId, since) {
      const firsts = db
        .select({ first: sql<Date>`min(${srsReview.reviewedAt})`.as("first") })
        .from(srsReview)
        .where(eq(srsReview.userId, userId))
        .groupBy(srsReview.cardId)
        .as("firsts");
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(firsts)
        .where(sql`${firsts.first} >= ${since.toISOString()}::timestamptz`);
      return row?.n ?? 0;
    },

    async reviewTimesSince(userId, since) {
      const rows = await db
        .select({ at: srsReview.reviewedAt })
        .from(srsReview)
        .where(and(eq(srsReview.userId, userId), gte(srsReview.reviewedAt, since)))
        .orderBy(asc(srsReview.reviewedAt));
      return rows.map((r) => r.at);
    },

    async recordReview(userId, id, rating, next, reviewedAt, answer) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(srsCard)
          .set({ state: storedState(next.state), due: next.due, updatedAt: reviewedAt })
          .where(ownCard(userId, id))
          .returning();
        if (!row) return undefined;
        await tx
          .insert(srsReview)
          .values({ userId, cardId: id, rating, reviewedAt, answer: answer ?? null });
        return toCard(row);
      });
    },

    async getMissedItem(itemId) {
      const [row] = await db
        .select({
          itemId: exerciseItem.id,
          unitId: exercise.unitId,
          instruction: exercise.instruction,
          isExample: exerciseItem.isExample,
          lines: exerciseItem.lines,
          answer: exerciseItem.answer,
        })
        .from(exerciseItem)
        .innerJoin(exercise, eq(exercise.id, exerciseItem.exerciseId))
        .where(eq(exerciseItem.id, itemId))
        .limit(1);
      return row;
    },

    async insertEvent(userId, type, payload) {
      await db.insert(event).values({ userId, type, payload });
    },
  };
}
