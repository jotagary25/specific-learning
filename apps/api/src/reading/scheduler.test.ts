import { describe, expect, it, vi } from "vitest";
import type { CandidatePool } from "./editor.ts";
import {
  EDITOR_TICK_MS,
  type EditorTickDeps,
  editorTick,
  startEditorScheduler,
} from "./scheduler.ts";

type User = { id: string; zone: string; hour: number };

const LA_PAZ: User = { id: "la-paz", zone: "America/La_Paz", hour: 5 };
const TOKYO: User = { id: "tokyo", zone: "Asia/Tokyo", hour: 7 };
const LONDON: User = { id: "utc", zone: "UTC", hour: 5 };

/** In-memory world: users with their zone and editor hour, and the daily articles created. */
function world(users: User[], now: Date, failFor: string[] = []) {
  const articles = new Set<string>();
  const pool: CandidatePool = { items: [], sources: [{ name: "theconversation", candidates: 3 }] };
  const byId = new Map(users.map((u) => [u.id, u]));
  const deps = {
    listUserIds: vi.fn(async () => users.map((u) => u.id)),
    timeZoneOf: vi.fn(async (id: string) => byId.get(id)?.zone ?? "UTC"),
    editorHour: vi.fn(async (id: string) => byId.get(id)?.hour ?? 5),
    hasArticle: vi.fn(async (id: string, date: string) => articles.has(`${id}/${date}`)),
    gather: vi.fn(async () => pool),
    run: vi.fn(async (id: string, date: string, candidates: () => Promise<CandidatePool>) => {
      await candidates();
      if (failFor.includes(id)) throw new Error(`boom for ${id}`);
      articles.add(`${id}/${date}`);
      return { status: "selected" as const };
    }),
    now: () => now,
    log: { log: vi.fn(), error: vi.fn() },
  } satisfies EditorTickDeps;
  return { deps, articles };
}

describe("editor tick", () => {
  it("runs each user once at their own local hour, for their local date", async () => {
    // 01:00 UTC: 21:00 on the 25th in La Paz (past 05:00), 10:00 on the 26th in Tokyo
    // (past 07:00), 01:00 in UTC (before 05:00).
    const { deps, articles } = world([LA_PAZ, TOKYO, LONDON], new Date("2026-10-26T01:00:00Z"));
    const first = await editorTick(deps);
    expect(first.ran.map((r) => [r.userId, r.date]).sort()).toEqual([
      ["la-paz", "2026-10-25"],
      ["tokyo", "2026-10-26"],
    ]);
    expect([...articles].sort()).toEqual(["la-paz/2026-10-25", "tokyo/2026-10-26"]);

    // The next tick finds both articles and runs nobody again.
    const second = await editorTick(deps);
    expect(second.ran).toEqual([]);
    expect(deps.run).toHaveBeenCalledTimes(2);
  });

  it("fetches the shared candidates at most once per tick, and not at all when nobody is due", async () => {
    const { deps } = world([LA_PAZ, TOKYO], new Date("2026-10-26T01:00:00Z"));
    await editorTick(deps);
    expect(deps.gather).toHaveBeenCalledTimes(1);

    const idle = world([LONDON], new Date("2026-10-26T01:00:00Z"));
    await editorTick(idle.deps);
    expect(idle.deps.gather).not.toHaveBeenCalled();
  });

  it("keeps going when one user fails and retries that user on the next tick", async () => {
    const { deps, articles } = world([LA_PAZ, TOKYO], new Date("2026-10-26T01:00:00Z"), ["la-paz"]);
    const result = await editorTick(deps);
    expect(result.failed.map((f) => f.userId)).toEqual(["la-paz"]);
    expect([...articles]).toEqual(["tokyo/2026-10-26"]);
    expect(deps.log.error).toHaveBeenCalledWith(expect.stringContaining("la-paz"));

    await editorTick(deps);
    expect(deps.run).toHaveBeenLastCalledWith("la-paz", "2026-10-25", expect.any(Function));
  });

  it("stops retrying a failing user after 3 attempts on the same local date", async () => {
    const { deps } = world([LA_PAZ], new Date("2026-10-26T01:00:00Z"), ["la-paz"]);
    const attempts = new Map<string, number>();

    for (let i = 0; i < 5; i++) await editorTick({ ...deps, attempts });

    expect(deps.run).toHaveBeenCalledTimes(3);
  });

  it("catches up soon after a restart mid-day, then ticks every 5 minutes", async () => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    // Restarted at 15:00 in La Paz, well past 05:00, with no article for today yet.
    const { deps, articles } = world([LA_PAZ], new Date("2026-10-26T19:00:00Z"));
    const scheduler = startEditorScheduler({
      ...deps,
      setTimer: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      clearTimer: () => undefined,
    });
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBeLessThan(60_000);

    timers[0]?.fn();
    await vi.waitFor(() => expect(timers).toHaveLength(2));
    expect([...articles]).toEqual(["la-paz/2026-10-26"]);
    expect(timers[1]?.ms).toBe(EDITOR_TICK_MS);
    expect(EDITOR_TICK_MS).toBe(5 * 60_000);
    scheduler.stop();
  });
});
