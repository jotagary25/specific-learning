// In-process daily job: runs the editor at `hour`:00 local time (process TZ), no cron dependency.
import { localDate, nextRunAt } from "./dates.ts";

export type SchedulerOptions = {
  hour: number;
  run: (date: string) => Promise<unknown>;
  /** Today's article already exists? Used to catch up after a restart past the run hour. */
  hasArticle: (date: string) => Promise<boolean>;
  now?: () => Date;
  setTimer?: (fn: () => void, ms: number) => { unref?: () => void } | unknown;
  clearTimer?: (handle: unknown) => void;
};

export function startEditorScheduler(options: SchedulerOptions) {
  const now = options.now ?? (() => new Date());
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as NodeJS.Timeout));
  let handle: unknown;
  let stopped = false;

  const runFor = async (date: string) => {
    try {
      await options.run(date);
    } catch (error) {
      console.error(`editor: run for ${date} failed`, error);
    }
  };

  const schedule = () => {
    if (stopped) return;
    const at = nextRunAt(now(), options.hour);
    console.log(`editor: next run at ${at.toISOString()}`);
    handle = setTimer(
      () => {
        void runFor(localDate(now())).finally(schedule);
      },
      Math.max(1_000, at.getTime() - now().getTime()),
    );
    (handle as { unref?: () => void } | undefined)?.unref?.();
  };

  // Catch up: started after today's run hour without today's article.
  const current = now();
  const today = localDate(current);
  const pending =
    current.getHours() >= options.hour
      ? options.hasArticle(today).then((has) => (has ? undefined : runFor(today)))
      : Promise.resolve();
  void pending.catch(() => undefined).finally(schedule);

  return {
    /** Resolves once the start-up catch-up check finished (for tests). */
    ready: pending.catch(() => undefined),
    stop() {
      stopped = true;
      if (handle !== undefined) clearTimer(handle);
    },
  };
}
