import {
  ParkingItemView,
  ParkingListResponse,
  StudySessionView,
  TodayOverview,
} from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createTestAuth, loginCookie } from "../auth/auth.test-support.ts";
import { REPO_CONTENT_DIR } from "../content/content-dir.test-support.ts";
import { createMemoryTodayStore } from "./today.memory-store.ts";
import { createToday, type TodayState } from "./today.service.ts";

// 2026-10-26 is a Monday, 2026-10-31 a Saturday (UTC, the default zone).
const MONDAY_MORNING = new Date(Date.UTC(2026, 9, 26, 6, 30));
const SATURDAY_MORNING = new Date(Date.UTC(2026, 9, 31, 9, 0));

const state = (over: Partial<TodayState> = {}): TodayState => ({
  srs: { due: 8, fresh: 2 },
  reading: { title: "Why bees dance", step: "predict" },
  recallPending: false,
  unit: {
    number: 1,
    title: "Present continuous",
    nextStep: "story",
    itemsLeft: 20,
    priority: false,
    completed: false,
  },
  writing: { missionOpen: false, title: null, writingDay: 6 },
  teaser: { unit: 1, chapterTitle: "Liftoff", teaser: "Then the alarm went off." },
  ...over,
});

async function setup(start = MONDAY_MORNING, timeZone = "UTC") {
  const store = createMemoryTodayStore();
  const clock = { now: start };
  const today = createToday({
    store,
    sources: { state: async () => state() },
    now: () => clock.now,
    timeZoneOf: async () => timeZone,
  });
  const { auth } = await createTestAuth();
  const app = createApp({ contentDir: REPO_CONTENT_DIR, pingDb: async () => true, auth, today });
  const cookie = await loginCookie(app);
  const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
    app.request(`/api/today${path}`, {
      method: init.method ?? "GET",
      headers: { cookie, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const advance = (minutes: number) => {
    clock.now = new Date(clock.now.getTime() + minutes * 60_000);
  };
  return { app, call, store, advance };
}

async function start(call: Awaited<ReturnType<typeof setup>>["call"], mode = "full") {
  const res = await call("/sessions", { method: "POST", body: { mode } });
  expect(res.status).toBe(201);
  return StudySessionView.parse(await res.json());
}

describe("today routes", () => {
  it("requires a session", async () => {
    const { app } = await setup();
    expect((await app.request("/api/today")).status).toBe(401);
  });

  it("returns the plan for now with the suggested mode and the story teaser", async () => {
    const { call } = await setup();
    const overview = TodayOverview.parse(await (await call("")).json());
    expect(overview.daypart).toBe("morning");
    expect(overview.suggestedMode).toBe("full");
    expect(overview.plan.budgetMin).toBe(25);
    expect(overview.plan.blocks.map((b) => b.kind)).toEqual(["vocabulary", "unit", "reading"]);
    expect(overview.plan.blocks[1]?.deepLink).toBe("/units/1?step=story");
    expect(overview.teaser?.teaser).toBe("Then the alarm went off.");
    expect(overview.activeSession).toBeNull();
  });

  it("frames the same instant in the user's zone", async () => {
    // Saturday 02:00 UTC: Friday 22:00 in La Paz, Saturday 11:00 in Tokyo.
    const instant = new Date("2026-10-31T02:00:00Z");
    const read = async (zone: string) =>
      TodayOverview.parse(await (await (await setup(instant, zone)).call("")).json());
    expect(await read("America/La_Paz")).toMatchObject({ daypart: "evening", weekend: false });
    expect(await read("Asia/Tokyo")).toMatchObject({ daypart: "morning", weekend: true });
  });

  it("plans for a requested mode and rejects unknown modes", async () => {
    const { call } = await setup();
    const overview = TodayOverview.parse(await (await call("?mode=minimum")).json());
    expect(overview.plan.blocks).toHaveLength(1);
    expect(overview.plan.budgetMin).toBe(5);
    expect((await call("?mode=marathon")).status).toBe(400);
  });

  it("starts a session with its plan and restores it as the active session", async () => {
    const { call, advance } = await setup();
    const session = await start(call, "slump");
    expect(session.budgetMin).toBe(10);
    expect(session.plan.mode).toBe("slump");
    expect(session.endedAt).toBeNull();

    advance(4);
    const overview = TodayOverview.parse(await (await call("")).json());
    expect(overview.activeSession?.id).toBe(session.id);
    expect(overview.sessionsToday).toHaveLength(1);
  });

  it("ends a session once and writes one session_completed event", async () => {
    const { call, store, advance } = await setup();
    const session = await start(call);
    advance(25);

    const res = await call(`/sessions/${session.id}/end`, {
      method: "POST",
      body: { reason: "timer", blocksDone: 2 },
    });
    expect(res.status).toBe(200);
    const ended = StudySessionView.parse(await res.json());
    expect(ended.endedAt).not.toBeNull();
    expect(store.sessions.find((s) => s.id === session.id)).toMatchObject({
      blocksDone: 2,
      endReason: "timer",
    });
    expect(store.events).toEqual([
      {
        type: "session_completed",
        payload: {
          sessionId: session.id,
          mode: "full",
          budgetMin: 25,
          minutes: 25,
          bonusMinutes: 0,
          blocksDone: 2,
          blocksPlanned: 3,
          reason: "timer",
        },
      },
    ]);

    const again = await call(`/sessions/${session.id}/end`, {
      method: "POST",
      body: { reason: "user" },
    });
    expect(again.status).toBe(409);
    expect(store.events).toHaveLength(1);

    const overview = TodayOverview.parse(await (await call("")).json());
    expect(overview.activeSession).toBeNull();
    // One session done this morning: the next suggestion is the 5-minute minimum.
    expect(overview.suggestedMode).toBe("minimum");
  });

  it("allows one 5-min bonus on weekdays", async () => {
    const { call, store, advance } = await setup(MONDAY_MORNING);
    const session = await start(call);
    advance(35);
    const tooMuch = await call(`/sessions/${session.id}/end`, {
      method: "POST",
      body: { reason: "timer", bonusMinutes: 10 },
    });
    expect(tooMuch.status).toBe(400);
    expect(store.events).toHaveLength(0);

    const ok = await call(`/sessions/${session.id}/end`, {
      method: "POST",
      body: { reason: "timer", bonusMinutes: 5 },
    });
    expect(StudySessionView.parse(await ok.json()).bonusMin).toBe(5);
    expect(store.events[0]?.payload).toMatchObject({ minutes: 30, bonusMinutes: 5 });
  });

  it("allows repeated bonuses on weekends", async () => {
    const { call, advance } = await setup(SATURDAY_MORNING);
    const session = await start(call);
    advance(45);
    const res = await call(`/sessions/${session.id}/end`, {
      method: "POST",
      body: { reason: "user", bonusMinutes: 20 },
    });
    expect(res.status).toBe(200);
    expect(StudySessionView.parse(await res.json()).bonusMin).toBe(20);
  });

  it("closes a forgotten open session silently when a new one starts", async () => {
    const { call, store, advance } = await setup();
    const first = await start(call);
    advance(200);
    await start(call, "minimum");
    expect(store.sessions.find((s) => s.id === first.id)).toMatchObject({
      endedAt: new Date(MONDAY_MORNING.getTime() + 25 * 60_000),
      blocksDone: null,
      endReason: "superseded",
    });
    expect(store.events).toHaveLength(0);
  });

  it("answers 404 for an unknown session and 400 for a bad body", async () => {
    const { call } = await setup();
    expect(
      (await call("/sessions/nope/end", { method: "POST", body: { reason: "user" } })).status,
    ).toBe(404);
    expect((await call("/sessions", { method: "POST", body: { mode: "x" } })).status).toBe(400);
  });

  it("manages the parking list", async () => {
    const { call } = await setup();
    const created = await call("/parking", { method: "POST", body: { text: "  Apollo 1 fire  " } });
    expect(created.status).toBe(201);
    const item = ParkingItemView.parse(await created.json());
    expect(item).toMatchObject({ text: "Apollo 1 fire", done: false });
    await call("/parking", { method: "POST", body: { text: "Phrasal verbs with 'get'" } });

    const patched = await call(`/parking/${item.id}`, { method: "PATCH", body: { done: true } });
    expect(ParkingItemView.parse(await patched.json()).done).toBe(true);

    const list = ParkingListResponse.parse(await (await call("/parking")).json());
    expect(list.items.map((i) => i.text)).toEqual(["Phrasal verbs with 'get'", "Apollo 1 fire"]);
    const overview = TodayOverview.parse(await (await call("")).json());
    expect(overview.parkingOpen).toBe(1);

    expect((await call(`/parking/${item.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await call(`/parking/${item.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await call("/parking", { method: "POST", body: { text: "  " } })).status).toBe(400);
    expect((await call(`/parking/${item.id}`, { method: "PATCH", body: {} })).status).toBe(400);
  });
});
