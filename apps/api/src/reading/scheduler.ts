// In-process editor job, no cron: a periodic tick picks each user's daily article once their
// local hour (in their own time zone) reaches their editor hour. A restart catches up on the
// first tick, shortly after start.
import { localDate, localHour } from "../shared/clock.ts";
import type { CandidatePool } from "./editor.ts";

/** How often the editor checks who is due. */
export const EDITOR_TICK_MS = 5 * 60_000;
/** Delay of the first tick after start (lets the server finish booting). */
export const EDITOR_FIRST_TICK_MS = 15_000;
/** Runs per user and local date before the tick gives up until the next day (each may call the AI). */
export const EDITOR_MAX_DAILY_ATTEMPTS = 3;

export type EditorTickDeps = {
  listUserIds(): Promise<string[]>;
  timeZoneOf(userId: string): Promise<string>;
  editorHour(userId: string): Promise<number>;
  hasArticle(userId: string, date: string): Promise<boolean>;
  /** Fetches the shared candidate pool; called at most once per tick. */
  gather(): Promise<CandidatePool>;
  run(
    userId: string,
    date: string,
    candidates: () => Promise<CandidatePool>,
  ): Promise<{ status: string }>;
  now?: () => Date;
  log?: Pick<Console, "log" | "error">;
  /** Attempts per `userId/date`, kept across ticks by the scheduler. */
  attempts?: Map<string, number>;
};

export type TickResult = {
  ran: Array<{ userId: string; date: string; status: string }>;
  failed: Array<{ userId: string; date: string; error: string }>;
};

/** One pass over every user: runs the editor for whoever is due and has no article yet. */
export async function editorTick(deps: EditorTickDeps): Promise<TickResult> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? console;
  const result: TickResult = { ran: [], failed: [] };
  let pool: Promise<CandidatePool> | undefined;
  const candidates = () => {
    pool ??= deps.gather();
    return pool;
  };

  for (const userId of await deps.listUserIds()) {
    let date = "";
    try {
      const [zone, hour] = await Promise.all([deps.timeZoneOf(userId), deps.editorHour(userId)]);
      date = localDate(now, zone);
      if (localHour(now, zone) < hour || (await deps.hasArticle(userId, date))) continue;
      const key = `${userId}/${date}`;
      const tried = deps.attempts?.get(key) ?? 0;
      if (tried >= EDITOR_MAX_DAILY_ATTEMPTS) continue;
      deps.attempts?.set(key, tried + 1);
      const { status } = await deps.run(userId, date, candidates);
      result.ran.push({ userId, date, status });
      log.log(`editor: user ${userId} ${date} → ${status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({ userId, date, error: message });
      log.error(`editor: run for user ${userId} on ${date || "?"} failed: ${message}`);
    }
  }
  return result;
}

export type SchedulerOptions = EditorTickDeps & {
  intervalMs?: number;
  firstDelayMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/** Ticks shortly after start, then every `intervalMs`; ticks never overlap. */
export function startEditorScheduler(options: SchedulerOptions) {
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as NodeJS.Timeout));
  const interval = options.intervalMs ?? EDITOR_TICK_MS;
  let handle: unknown;
  let stopped = false;
  let attempts = new Map<string, number>();

  const schedule = (ms: number) => {
    if (stopped) return;
    handle = setTimer(() => {
      // Old dates never come back: start a fresh map once it grows past one day of users.
      if (attempts.size > 10_000) attempts = new Map();
      void editorTick({ ...options, attempts })
        .catch((error: unknown) => console.error("editor: tick failed", error))
        .finally(() => schedule(interval));
    }, ms);
    (handle as { unref?: () => void } | undefined)?.unref?.();
  };

  schedule(options.firstDelayMs ?? EDITOR_FIRST_TICK_MS);
  console.log(`editor: checking every ${Math.round(interval / 60_000)} min for due users`);

  return {
    stop() {
      stopped = true;
      if (handle !== undefined) clearTimer(handle);
    },
  };
}
