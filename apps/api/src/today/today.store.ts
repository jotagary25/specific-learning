import type { TodayMode, TodayPlan } from "@english-course/shared";
import { and, asc, desc, eq, gte, inArray, isNull, max } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import {
  event,
  parkingItem,
  type StudySessionEndReason,
  studySession,
  writingMission,
} from "../shared/db/schema/index.ts";

export type SessionRecord = {
  id: string;
  mode: TodayMode;
  budgetMin: number;
  plan: TodayPlan;
  startedAt: Date;
  endedAt: Date | null;
  bonusMin: number;
  /** Plan blocks finished; null while open or when closed without the learner (superseded). */
  blocksDone: number | null;
  endReason: StudySessionEndReason | null;
};

export type SessionEnd = {
  endedAt: Date;
  bonusMin: number;
  blocksDone: number | null;
  endReason: StudySessionEndReason;
};

export type NewSession = Pick<SessionRecord, "mode" | "budgetMin" | "plan" | "startedAt">;

export type ParkingRecord = { id: string; text: string; done: boolean; createdAt: Date };

export type TodayEvent = { type: string; payload: Record<string, unknown> };

/** Events that count as writing work (written by the writing module). */
export const WRITING_EVENT_TYPES = ["writing_submitted", "writing_completed"];

/** Persistence port of Today: study sessions, parking items and events of one user. */
export interface TodayStore {
  createSession(userId: string, session: NewSession): Promise<SessionRecord>;
  getSession(userId: string, id: string): Promise<SessionRecord | undefined>;
  /** Oldest first. */
  listSessionsSince(userId: string, since: Date): Promise<SessionRecord[]>;
  listOpenSessions(userId: string): Promise<SessionRecord[]>;
  /**
   * Ends a session that is still open and appends `event` in the same transaction.
   * Returns `undefined` when the session was already ended (nothing is written).
   */
  endSession(
    userId: string,
    id: string,
    end: SessionEnd,
    event?: TodayEvent,
  ): Promise<SessionRecord | undefined>;

  /** Open items first, then newest first. */
  listParking(userId: string): Promise<ParkingRecord[]>;
  createParking(userId: string, text: string): Promise<ParkingRecord>;
  updateParking(
    userId: string,
    id: string,
    patch: { text?: string; done?: boolean },
  ): Promise<ParkingRecord | undefined>;
  deleteParking(userId: string, id: string): Promise<boolean>;

  /** Latest writing activity: a mission created or worked on (`updated_at`), a text submitted or completed. */
  lastWritingActivity(userId: string): Promise<Date | undefined>;
}

/** Postgres rejects malformed uuids; treat them as "not found" instead of a 500. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionRow = typeof studySession.$inferSelect;

const toSession = (row: SessionRow): SessionRecord => ({
  id: row.id,
  mode: row.mode,
  budgetMin: row.budgetMin,
  plan: row.plan as unknown as TodayPlan,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  bonusMin: row.bonusMin,
  blocksDone: row.blocksDone,
  endReason: row.endReason,
});

const parkingColumns = {
  id: parkingItem.id,
  text: parkingItem.text,
  done: parkingItem.done,
  createdAt: parkingItem.createdAt,
};

export function createDrizzleTodayStore(db: Db): TodayStore {
  return {
    async createSession(userId, session) {
      const [row] = await db
        .insert(studySession)
        .values({
          userId,
          mode: session.mode,
          budgetMin: session.budgetMin,
          plan: session.plan as unknown as Record<string, unknown>,
          startedAt: session.startedAt,
        })
        .returning();
      if (!row) throw new Error("study_session insert returned no row");
      return toSession(row);
    },

    async getSession(userId, id) {
      if (!UUID.test(id)) return undefined;
      const [row] = await db
        .select()
        .from(studySession)
        .where(and(eq(studySession.userId, userId), eq(studySession.id, id)))
        .limit(1);
      return row ? toSession(row) : undefined;
    },

    async listSessionsSince(userId, since) {
      const rows = await db
        .select()
        .from(studySession)
        .where(and(eq(studySession.userId, userId), gte(studySession.startedAt, since)))
        .orderBy(asc(studySession.startedAt));
      return rows.map(toSession);
    },

    async listOpenSessions(userId) {
      const rows = await db
        .select()
        .from(studySession)
        .where(and(eq(studySession.userId, userId), isNull(studySession.endedAt)))
        .orderBy(asc(studySession.startedAt));
      return rows.map(toSession);
    },

    async endSession(userId, id, end, ev) {
      if (!UUID.test(id)) return undefined;
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(studySession)
          .set({
            endedAt: end.endedAt,
            bonusMin: end.bonusMin,
            blocksDone: end.blocksDone,
            endReason: end.endReason,
          })
          .where(
            and(
              eq(studySession.userId, userId),
              eq(studySession.id, id),
              isNull(studySession.endedAt),
            ),
          )
          .returning();
        if (!row) return undefined;
        if (ev) await tx.insert(event).values({ ...ev, userId });
        return toSession(row);
      });
    },

    async listParking(userId) {
      return db
        .select(parkingColumns)
        .from(parkingItem)
        .where(eq(parkingItem.userId, userId))
        .orderBy(asc(parkingItem.done), desc(parkingItem.createdAt));
    },

    async createParking(userId, text) {
      const [row] = await db.insert(parkingItem).values({ userId, text }).returning(parkingColumns);
      if (!row) throw new Error("parking_item insert returned no row");
      return row;
    },

    async updateParking(userId, id, patch) {
      if (!UUID.test(id)) return undefined;
      const [row] = await db
        .update(parkingItem)
        .set(patch)
        .where(and(eq(parkingItem.userId, userId), eq(parkingItem.id, id)))
        .returning(parkingColumns);
      return row;
    },

    async deleteParking(userId, id) {
      if (!UUID.test(id)) return false;
      const rows = await db
        .delete(parkingItem)
        .where(and(eq(parkingItem.userId, userId), eq(parkingItem.id, id)))
        .returning({ id: parkingItem.id });
      return rows.length > 0;
    },

    async lastWritingActivity(userId) {
      const [[events], [missions]] = await Promise.all([
        db
          .select({ at: max(event.createdAt) })
          .from(event)
          .where(and(eq(event.userId, userId), inArray(event.type, WRITING_EVENT_TYPES))),
        db
          .select({ at: max(writingMission.updatedAt) })
          .from(writingMission)
          .where(eq(writingMission.userId, userId)),
      ]);
      const times = [events?.at, missions?.at].filter((d): d is Date => d instanceof Date);
      if (times.length === 0) return undefined;
      return new Date(Math.max(...times.map((d) => d.getTime())));
    },
  };
}
