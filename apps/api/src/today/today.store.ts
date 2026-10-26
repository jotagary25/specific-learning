import type { TodayMode, TodayPlan } from "@english-course/shared";
import { and, asc, desc, eq, gte, inArray, isNull, max } from "drizzle-orm";
import type { Db } from "../shared/db/client.ts";
import { event, parkingItem, studySession, writingMission } from "../shared/db/schema/index.ts";

export type SessionRecord = {
  id: string;
  mode: TodayMode;
  budgetMin: number;
  plan: TodayPlan;
  startedAt: Date;
  endedAt: Date | null;
  bonusMin: number;
};

export type NewSession = Pick<SessionRecord, "mode" | "budgetMin" | "plan" | "startedAt">;

export type ParkingRecord = { id: string; text: string; done: boolean; createdAt: Date };

export type TodayEvent = { type: string; payload: Record<string, unknown> };

/** Events that count as writing work (written by the writing module). */
export const WRITING_EVENT_TYPES = ["writing_submitted", "writing_completed"];

export interface TodayStore {
  createSession(session: NewSession): Promise<SessionRecord>;
  getSession(id: string): Promise<SessionRecord | undefined>;
  /** Oldest first. */
  listSessionsSince(since: Date): Promise<SessionRecord[]>;
  listOpenSessions(): Promise<SessionRecord[]>;
  /**
   * Ends a session that is still open and appends `event` in the same transaction.
   * Returns `undefined` when the session was already ended (nothing is written).
   */
  endSession(
    id: string,
    end: { endedAt: Date; bonusMin: number },
    event?: TodayEvent,
  ): Promise<SessionRecord | undefined>;

  /** Open items first, then newest first. */
  listParking(): Promise<ParkingRecord[]>;
  createParking(text: string): Promise<ParkingRecord>;
  updateParking(
    id: string,
    patch: { text?: string; done?: boolean },
  ): Promise<ParkingRecord | undefined>;
  deleteParking(id: string): Promise<boolean>;

  /** Latest writing activity: a mission created, a text submitted or completed. */
  lastWritingActivity(): Promise<Date | undefined>;
}

/** Postgres rejects malformed uuids; treat them as "not found" instead of a 500. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionRow = typeof studySession.$inferSelect;

const toSession = (row: SessionRow): SessionRecord => ({
  id: row.id,
  // The column type predates the T13 modes; values are written by this module only.
  mode: row.mode as unknown as TodayMode,
  budgetMin: row.budgetMin,
  plan: row.plan as unknown as TodayPlan,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  bonusMin: row.bonusMin,
});

export function createDrizzleTodayStore(db: Db): TodayStore {
  return {
    async createSession(session) {
      const [row] = await db
        .insert(studySession)
        .values({
          mode: session.mode as unknown as SessionRow["mode"],
          budgetMin: session.budgetMin,
          plan: session.plan as unknown as Record<string, unknown>,
          startedAt: session.startedAt,
        })
        .returning();
      if (!row) throw new Error("study_session insert returned no row");
      return toSession(row);
    },

    async getSession(id) {
      if (!UUID.test(id)) return undefined;
      const [row] = await db.select().from(studySession).where(eq(studySession.id, id)).limit(1);
      return row ? toSession(row) : undefined;
    },

    async listSessionsSince(since) {
      const rows = await db
        .select()
        .from(studySession)
        .where(gte(studySession.startedAt, since))
        .orderBy(asc(studySession.startedAt));
      return rows.map(toSession);
    },

    async listOpenSessions() {
      const rows = await db
        .select()
        .from(studySession)
        .where(isNull(studySession.endedAt))
        .orderBy(asc(studySession.startedAt));
      return rows.map(toSession);
    },

    async endSession(id, end, ev) {
      if (!UUID.test(id)) return undefined;
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(studySession)
          .set({ endedAt: end.endedAt, bonusMin: end.bonusMin })
          .where(and(eq(studySession.id, id), isNull(studySession.endedAt)))
          .returning();
        if (!row) return undefined;
        if (ev) await tx.insert(event).values(ev);
        return toSession(row);
      });
    },

    async listParking() {
      return db
        .select()
        .from(parkingItem)
        .orderBy(asc(parkingItem.done), desc(parkingItem.createdAt));
    },

    async createParking(text) {
      const [row] = await db.insert(parkingItem).values({ text }).returning();
      if (!row) throw new Error("parking_item insert returned no row");
      return row;
    },

    async updateParking(id, patch) {
      if (!UUID.test(id)) return undefined;
      const [row] = await db
        .update(parkingItem)
        .set(patch)
        .where(eq(parkingItem.id, id))
        .returning();
      return row;
    },

    async deleteParking(id) {
      if (!UUID.test(id)) return false;
      const rows = await db
        .delete(parkingItem)
        .where(eq(parkingItem.id, id))
        .returning({ id: parkingItem.id });
      return rows.length > 0;
    },

    async lastWritingActivity() {
      const [[events], [missions]] = await Promise.all([
        db
          .select({ at: max(event.createdAt) })
          .from(event)
          .where(inArray(event.type, WRITING_EVENT_TYPES)),
        db.select({ at: max(writingMission.createdAt) }).from(writingMission),
      ]);
      const times = [events?.at, missions?.at].filter((d): d is Date => d instanceof Date);
      if (times.length === 0) return undefined;
      return new Date(Math.max(...times.map((d) => d.getTime())));
    },
  };
}
