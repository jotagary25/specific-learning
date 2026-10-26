import {
  bonusTotalValid,
  type EndSessionRequest,
  isWeekend,
  type ParkingItemView,
  type ParkingListResponse,
  type StoryTeaser,
  type StudySessionView,
  type TodayMode,
  type TodayOverview,
} from "@english-course/shared";
import { daypartOf, type PlannerSnapshot, planToday, suggestMode } from "./planner.ts";
import type { ParkingRecord, SessionRecord, TodayStore } from "./today.store.ts";

/** What the other features report for planning; gathered fresh on every request. */
export type TodayState = Pick<PlannerSnapshot, "srs" | "reading" | "recallPending" | "unit"> & {
  writing: { missionOpen: boolean; title: string | null; writingDay: number };
  teaser: StoryTeaser | null;
};

export interface TodaySources {
  state(now: Date): Promise<TodayState>;
}

export type TodayDeps = {
  store: TodayStore;
  sources: TodaySources;
  now?: () => Date;
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

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Whole local calendar days between two instants (DST-safe). */
function daysBetween(earlier: Date, later: Date): number {
  const a = startOfLocalDay(earlier);
  const b = startOfLocalDay(later);
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      (24 * 60 * MINUTE),
  );
}

export const sessionView = (s: SessionRecord): StudySessionView => ({
  id: s.id,
  mode: s.mode,
  budgetMin: s.budgetMin,
  plan: s.plan,
  startedAt: s.startedAt.toISOString(),
  endedAt: s.endedAt?.toISOString() ?? null,
  bonusMin: s.bonusMin,
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

  async function snapshot(at: Date, mode: TodayMode | undefined, sessionsDoneToday: number) {
    const [state, lastWriting] = await Promise.all([
      sources.state(at),
      store.lastWritingActivity(),
    ]);
    const chosen = mode ?? suggestMode(at, sessionsDoneToday);
    const planner: PlannerSnapshot = {
      now: at,
      mode: chosen,
      srs: state.srs,
      reading: state.reading,
      recallPending: state.recallPending,
      unit: state.unit,
      writing: {
        ...state.writing,
        daysSinceLastWork: lastWriting ? daysBetween(lastWriting, at) : null,
      },
      sessionsDoneToday,
    };
    return { plan: planToday(planner), teaser: state.teaser };
  }

  const isActive = (s: SessionRecord, at: Date) =>
    s.endedAt === null && at.getTime() - s.startedAt.getTime() < ACTIVE_WINDOW_MIN * MINUTE;

  return {
    async overview(mode?: TodayMode): Promise<TodayOverview> {
      const at = now();
      const [today, parking] = await Promise.all([
        store.listSessionsSince(startOfLocalDay(at)),
        store.listParking(),
      ]);
      const done = today.filter((s) => s.endedAt !== null).length;
      const { plan, teaser } = await snapshot(at, mode, done);
      const active = today.filter((s) => isActive(s, at)).at(-1);
      return {
        now: at.toISOString(),
        daypart: daypartOf(at),
        weekend: isWeekend(at),
        suggestedMode: suggestMode(at, done),
        plan,
        teaser,
        parkingOpen: parking.filter((p) => !p.done).length,
        sessionsToday: today.map(sessionView),
        activeSession: active ? sessionView(active) : null,
      };
    },

    /** Starts a session with a fresh plan; sessions left open earlier are closed silently. */
    async startSession(mode: TodayMode): Promise<StudySessionView> {
      const at = now();
      for (const open of await store.listOpenSessions()) {
        const planned = open.startedAt.getTime() + open.budgetMin * MINUTE;
        await store.endSession(open.id, {
          endedAt: new Date(Math.min(at.getTime(), planned)),
          bonusMin: open.bonusMin,
          blocksDone: null,
          endReason: "superseded",
        });
      }
      const done = (await store.listSessionsSince(startOfLocalDay(at))).filter(
        (s) => s.endedAt !== null,
      ).length;
      const { plan } = await snapshot(at, mode, done);
      const created = await store.createSession({
        mode,
        budgetMin: plan.budgetMin,
        plan,
        startedAt: at,
      });
      return sessionView(created);
    },

    /** Ends an open session and writes one `session_completed` event. */
    async endSession(id: string, request: EndSessionRequest): Promise<StudySessionView> {
      const at = now();
      const found = await store.getSession(id);
      if (!found) throw new TodayError("not_found", "Session not found");
      if (found.endedAt) throw new TodayError("already_ended", "This session has already ended");
      const bonusMin = request.bonusMinutes ?? 0;
      const weekend = isWeekend(found.startedAt);
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
      return sessionView(ended);
    },

    async listParking(): Promise<ParkingListResponse> {
      return { items: (await store.listParking()).map(parkingView) };
    },

    async addParking(text: string): Promise<ParkingItemView> {
      return parkingView(await store.createParking(text));
    },

    async updateParking(
      id: string,
      patch: { text?: string; done?: boolean },
    ): Promise<ParkingItemView> {
      const updated = await store.updateParking(id, patch);
      if (!updated) throw new TodayError("not_found", "Parking item not found");
      return parkingView(updated);
    },

    async removeParking(id: string): Promise<{ deleted: true }> {
      if (!(await store.deleteParking(id))) {
        throw new TodayError("not_found", "Parking item not found");
      }
      return { deleted: true };
    },
  };
}

export type Today = ReturnType<typeof createToday>;
