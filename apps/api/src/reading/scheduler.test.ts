import { describe, expect, it, vi } from "vitest";
import { startEditorScheduler } from "./scheduler.ts";

function harness(now: Date, hasArticle: boolean) {
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const run = vi.fn(async () => undefined);
  const scheduler = startEditorScheduler({
    hour: 5,
    run,
    hasArticle: async () => hasArticle,
    now: () => now,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => undefined,
  });
  return { scheduler, timers, run };
}

describe("editor scheduler", () => {
  it("waits for the next 05:00 without catching up before the run hour", async () => {
    const { scheduler, timers, run } = harness(new Date(2026, 9, 25, 4, 0), false);
    await scheduler.ready;
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    expect(run).not.toHaveBeenCalled();
    expect(timers[0]?.ms).toBe(60 * 60 * 1000);
    scheduler.stop();
  });

  it("catches up after the run hour when today has no article", async () => {
    const { scheduler, timers, run } = harness(new Date(2026, 9, 25, 9, 0), false);
    await scheduler.ready;
    expect(run).toHaveBeenCalledWith("2026-10-25");
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    expect(timers[0]?.ms).toBe(20 * 60 * 60 * 1000);
    scheduler.stop();
  });

  it("does not run again when today's article exists", async () => {
    const { scheduler, run } = harness(new Date(2026, 9, 25, 9, 0), true);
    await scheduler.ready;
    expect(run).not.toHaveBeenCalled();
    scheduler.stop();
  });
});
