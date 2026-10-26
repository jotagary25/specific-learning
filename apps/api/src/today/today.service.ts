import {
  bonusTotalValid,
  type EndSessionRequest,
  isWeekendDay,
  type ParkingItemView,
  type ParkingListResponse,
  type StoryTeaser,
  type StudySessionView,
  type TodayMode,
  type TodayOverview,
} from "@english-course/shared";
import { type TimeZoneOf, utcTimeZone } from "../settings/preferences.ts";
import { localDaysBetween, localWeekday, startOfLocalDay } from "../shared/clock.ts";
import { daypartOf, type PlannerSnapshot, planToday, suggestMode } from "./planner.ts";
import type { ParkingRecord, SessionRecord, TodayStore } from "./today.store.ts";

/** What the other features report for planning; gathered fresh on every request. */
export type TodayState = Pick<PlannerSnapshot, "srs" | "reading" | "recallPending" | "unit"> & {
  writing: { missionOpen: boolean; title: string | null; writingDay: number };
  teaser: StoryTeaser | null;
};

export interface TodaySources {
  state(userId: string, now: Date, timeZone: string): Promise<TodayState>;
}

export type TodayDeps = {
  store: TodayStore;
  sources: TodaySources;
  now?: () => Date;
  /** The user's IANA zone (UTC by default): dayparts, days and weekends are local to it. */
  timeZoneOf?: TimeZoneOf;
};

export class TodayError extends Error {
  override readonly name = "TodayError";
  readonly code: "not_found" | "already_ended" | "invalid_bonus";

  constructor(code: TodayError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** An open session older than this is treated as abandoned, not restored. */
export const ACTIVE_WINDOW_MIN = 180;
const MINUTE = 60_000;

const weekendAt = (at: Date, timeZone: string) => isWeekendDay(localWeekday(at, timeZone));

export const sessionView = (s: SessionRecord, timeZone: string): StudySessionView => ({
  id: s.id,
  mode: s.mode,
  budgetMin: s.budgetMin,
  plan: s.plan,
  startedAt: s.startedAt.toISOString(),
  endedAt: s.endedAt?.toISOString() ?? null,
  bonusMin: s.bonusMin,
  weekend: weekendAt(s.startedAt, timeZone),
});

const parkingView = (p: ParkingRecord): ParkingItemView => ({
  id: p.id,
  text: p.text,
  done: p.done,
  createdAt: p.createdAt.toISOString(),
});

export function createToday(deps: TodayDeps) {
  const { store, sources } = deps;
  const now = deps.now ?? (() => new Date());
  const timeZoneOf = deps.timeZoneOf ?? utcTimeZone;

  async function snapshot(
    userId: string,
    at: Date,
    zone: string,
    mode: TodayMode | undefined,
    sessionsDoneToday: number,
  ) {
    const [state, lastWriting] = await Promise.all([
      sources.state(userId, at, zone),
      store.lastWritingActivity(userId),
    ]);
    const chosen = mode ?? suggestMode(at, zone, sessionsDoneToday);
    const planner: PlannerSnapshot = {
      now: at,
      timeZone: zone,
      mode: chosen,
      srs: state.srs,
      reading: state.reading,
      recallPending: state.recallPending,
      unit: state.unit,
      writing: {
        ...state.writing,
        daysSinceLastWork: lastWriting ? localDaysBetween(lastWriting, at, zone) : null,
      },
      sessionsDoneToday,
    };
    return { plan: planToday(planner), teaser: state.teaser };
  }

  const isActive = (s: SessionRecord, at: Date) =>
    s.endedAt === null && at.getTime() - s.startedAt.getTime() < ACTIVE_WINDOW_MIN * MINUTE;

  return {
    async overview(userId: string, mode?: TodayMode): Promise<TodayOverview> {
      const at = now();
      const zone = await timeZoneOf(userId);
      const [today, parking] = await Promise.all([
        store.listSessionsSince(userId, startOfLocalDay(at, zone)),
        store.listParking(userId),
      ]);
      const done = today.filter((s) => s.endedAt !== null).length;
      const { plan, teaser } = await snapshot(userId, at, zone, mode, done);
      const active = today.filter((s) => isActive(s, at)).at(-1);
      return {
        now: at.toISOString(),
        daypart: daypartOf(at, zone),
        weekend: weekendAt(at, zone),
        suggestedMode: suggestMode(at, zone, done),
        plan,
        teaser,
        parkingOpen: parking.filter((p) => !p.done).length,
        sessionsToday: today.map((s) => sessionView(s, zone)),
        activeSession: active ? sessionView(active, zone) : null,
      };
    },

    /** Starts a session with a fresh plan; sessions left open earlier are closed silently. */
    async startSession(userId: string, mode: TodayMode): Promise<StudySessionView> {
      const at = now();
      const zone = await timeZoneOf(userId);
      for (const open of await store.listOpenSessions(userId)) {
        const planned = open.startedAt.getTime() + open.budgetMin * MINUTE;
        await store.endSession(userId, open.id, {
          endedAt: new Date(Math.min(at.getTime(), planned)),
          bonusMin: open.bonusMin,
          blocksDone: null,
          endReason: "superseded",
        });
      }
      const done = (await store.listSessionsSince(userId, startOfLocalDay(at, zone))).filter(
        (s) => s.endedAt !== null,
      ).length;
      const { plan } = await snapshot(userId, at, zone, mode, done);
      const created = await store.createSession(userId, {
        mode,
        budgetMin: plan.budgetMin,
        plan,
        startedAt: at,
      });
      return sessionView(created, zone);
    },

    /** Ends an open session and writes one `session_completed` event. */
    async endSession(
      userId: string,
      id: string,
      request: EndSessionRequest,
    ): Promise<StudySessionView> {
      const at = now();
      const found = await store.getSession(userId, id);
      if (!found) throw new TodayError("not_found", "Session not found");
      if (found.endedAt) throw new TodayError("already_ended", "This session has already ended");
      const bonusMin = request.bonusMinutes ?? 0;
      const zone = await timeZoneOf(userId);
      const weekend = weekendAt(found.startedAt, zone);
      if (!bonusTotalValid(weekend, bonusMin)) {
        throw new TodayError(
          "invalid_bonus",
          weekend
            ? "Bonus time goes in 5-minute steps"
            : "On weekdays the bonus is one extra 5 minutes",
        );
      }
      const elapsed = Math.round((at.getTime() - found.startedAt.getTime()) / MINUTE);
      const minutes = Math.min(Math.max(0, elapsed), found.budgetMin + bonusMin);
      const blocksDone = Math.min(request.blocksDone ?? 0, found.plan.blocks.length);
      const ended = await store.endSession(
        userId,
        id,
        { endedAt: at, bonusMin, blocksDone, endReason: request.reason },
        {
          type: "session_completed",
          payload: {
            sessionId: id,
            mode: found.mode,
            budgetMin: found.budgetMin,
            minutes,
            bonusMinutes: bonusMin,
            blocksDone,
            blocksPlanned: found.plan.blocks.length,
            reason: request.reason,
          },
        },
      );
      if (!ended) throw new TodayError("already_ended", "This session has already ended");
      return sessionView(ended, zone);
    },

    async listParking(userId: string): Promise<ParkingListResponse> {
      return { items: (await store.listParking(userId)).map(parkingView) };
    },

    async addParking(userId: string, text: string): Promise<ParkingItemView> {
      return parkingView(await store.createParking(userId, text));
    },

    async updateParking(
      userId: string,
      id: string,
      patch: { text?: string; done?: boolean },
    ): Promise<ParkingItemView> {
      const updated = await store.updateParking(userId, id, patch);
      if (!updated) throw new TodayError("not_found", "Parking item not found");
      return parkingView(updated);
    },

    async removeParking(userId: string, id: string): Promise<{ deleted: true }> {
      if (!(await store.deleteParking(userId, id))) {
        throw new TodayError("not_found", "Parking item not found");
      }
      return { deleted: true };
    },
  };
}

export type Today = ReturnType<typeof createToday>;
