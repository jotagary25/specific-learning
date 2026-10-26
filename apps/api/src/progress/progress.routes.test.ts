import {
  CanDoEntry,
  CanDoListResponse,
  ErrorsResponse,
  MirrorDueResponse,
  MirrorResponse,
  ProgressSummary,
  TimelineResponse,
} from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createTestAuth, loginCookie } from "../auth/auth.test-support.ts";
import { REPO_CONTENT_DIR } from "../content/content-dir.test-support.ts";
import {
  at,
  card,
  event,
  reading,
  scores,
  submission,
  unitRecord,
  writingError,
} from "./progress.fixtures.ts";
import { createMemoryProgressStore } from "./progress.memory-store.ts";
import { createProgress } from "./progress.service.ts";

const NOW = at(2026, 10, 25, 12);

async function setup() {
  const clock = { now: NOW };
  const store = createMemoryProgressStore(() => clock.now);
  const progress = createProgress({ store, now: () => clock.now });
  const { auth } = await createTestAuth();
  const app = createApp({ contentDir: REPO_CONTENT_DIR, pingDb: async () => true, auth, progress });
  const cookie = await loginCookie(app);
  const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
    app.request(`/api/progress${path}`, {
      method: init.method ?? "GET",
      headers: { cookie, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  return { app, call, store, clock };
}

describe("progress routes", () => {
  it("requires a session", async () => {
    const { app } = await setup();
    expect((await app.request("/api/progress/summary")).status).toBe(401);
  });

  it("answers every view with an honest empty state before any learning", async () => {
    const { call } = await setup();
    const summary = ProgressSummary.parse(await (await call("/summary")).json());
    expect(summary.units.completed).toBe(0);
    expect(summary.words.saved).toBe(0);
    expect(summary.writing.dimensions.every((d) => d.values.length === 0)).toBe(true);

    const timeline = TimelineResponse.parse(await (await call("/timeline")).json());
    expect(timeline).toEqual({ from: "2026-08-03", to: "2026-10-25", weeks: [] });

    const errors = ErrorsResponse.parse(await (await call("/errors")).json());
    expect(errors.types).toEqual([]);

    const mirror = MirrorResponse.parse(await (await call("/mirror?month=2026-10")).json());
    expect(mirror).toMatchObject({
      label: "October 2026",
      article: null,
      writing: null,
      units: [],
      reflection: null,
      seen: false,
    });

    const due = MirrorDueResponse.parse(await (await call("/mirror/due")).json());
    expect(due).toEqual({
      due: false,
      month: "2026-10",
      reason: "not_enough_history",
      historyDays: 0,
    });
  });

  it("builds the timeline and summary from stored records", async () => {
    const { call, store } = await setup();
    store.units.push(
      unitRecord(1, {
        title: "Present continuous",
        status: "completed",
        completedAt: at(2026, 10, 20),
        canDo: ["Puedo hablar de lo que pasa ahora."],
      }),
    );
    store.events.push(
      event("unit_completed", at(2026, 10, 20), { unitId: 1, ratio: 0.9, graded: 20 }),
      event("session_completed", at(2026, 10, 20), { minutes: 25 }),
    );
    store.cards.push(card("thrive", "mature"));

    const timeline = TimelineResponse.parse(
      await (await call("/timeline?from=2026-10-01&to=2026-10-31")).json(),
    );
    expect(timeline.weeks).toHaveLength(1);
    expect(timeline.weeks[0]?.items[0]?.canDo).toEqual(["Puedo hablar de lo que pasa ahora."]);

    const summary = ProgressSummary.parse(await (await call("/summary")).json());
    expect(summary.units.completed).toBe(1);
    expect(summary.words.mature).toBe(1);
    expect(summary.minutes).toEqual({ last7Days: 25, last30Days: 25 });
  });

  it("rejects malformed ranges and months", async () => {
    const { call } = await setup();
    expect((await call("/timeline?from=2026-02-30")).status).toBe(400);
    expect((await call("/timeline?from=2026-10-20&to=2026-10-01")).status).toBe(400);
    expect((await call("/timeline?from=2024-01-01&to=2026-10-01")).status).toBe(400);
    expect((await call("/mirror?month=2026-13")).status).toBe(400);
    expect((await call("/mirror")).status).toBe(400);
    expect((await call("/mirror?month=2026-11")).status).toBe(400);
  });

  it("serves the monthly mirror from real stored artifacts", async () => {
    const { call, store } = await setup();
    store.readings.push(reading("a1", at(2026, 9, 3), ["wield", "loom"]));
    store.articles.set("a1", "They wield power while storms loom.");
    store.cards.push(card("wield", "mature", "a1"), card("scarce", "learning", "a1"));
    const first = submission(at(2026, 9, 5), scores(50), { text: "I have 30 years." });
    const latest = submission(at(2026, 10, 18), scores(70), { text: "I'm 30." });
    store.submissions.push(first, latest);
    store.errors.push(writingError(first, "false_friend"));
    store.units.push(
      unitRecord(2, { title: "Present simple", completedAt: at(2026, 10, 10), canDo: ["Puedo…"] }),
      unitRecord(3, { completedAt: at(2026, 9, 10) }),
    );

    const mirror = MirrorResponse.parse(await (await call("/mirror?month=2026-10")).json());
    expect(mirror.article).toMatchObject({
      articleId: "a1",
      readOn: "2026-09-03",
      text: "They wield power while storms loom.",
      unknownThen: 3,
      unknownNow: 2,
    });
    expect(mirror.writing?.first.text).toBe("I have 30 years.");
    expect(mirror.writing?.latest?.text).toBe("I'm 30.");
    expect(mirror.writing?.deltas.find((d) => d.dimension === "grammar")?.change).toBe(20);
    expect(mirror.units).toEqual([
      { unit: 2, title: "Present simple", completedOn: "2026-10-10", canDo: ["Puedo…"] },
    ]);
  });

  it("saves the reflection, marks the mirror as seen and stops it being due", async () => {
    const { call, store } = await setup();
    store.events.push(event("session_completed", at(2026, 10, 1), { minutes: 10 }));
    expect(MirrorDueResponse.parse(await (await call("/mirror/due")).json()).due).toBe(true);

    expect(
      (await call("/mirror/2026-10/reflection", { method: "POST", body: { text: " " } })).status,
    ).toBe(400);
    const saved = await call("/mirror/2026-10/reflection", {
      method: "POST",
      body: { text: "I can read a news article without a dictionary." },
    });
    expect(saved.status).toBe(201);

    const mirror = MirrorResponse.parse(await (await call("/mirror?month=2026-10")).json());
    expect(mirror.reflection?.text).toBe("I can read a news article without a dictionary.");
    expect(mirror.seen).toBe(true);
    expect(MirrorDueResponse.parse(await (await call("/mirror/due")).json())).toMatchObject({
      due: false,
      reason: "already_seen",
    });
  });

  it("records a mirror view once, and mirror events are not learning history", async () => {
    const { call, store, clock } = await setup();
    await call("/mirror/2026-09/seen", { method: "POST" });
    await call("/mirror/2026-09/seen", { method: "POST" });
    expect(store.events.filter((e) => e.type === "mirror_viewed")).toHaveLength(1);
    clock.now = new Date(NOW.getTime() + 20 * 86_400_000);
    expect(MirrorDueResponse.parse(await (await call("/mirror/due")).json())).toMatchObject({
      reason: "not_enough_history",
      historyDays: 0,
    });
  });

  it("adds and lists learner can-do entries, newest first", async () => {
    const { call, store, clock } = await setup();
    expect((await call("/can-do", { method: "POST", body: { text: "" } })).status).toBe(400);
    const created = await call("/can-do", { method: "POST", body: { text: "  order coffee  " } });
    expect(created.status).toBe(201);
    expect(CanDoEntry.parse(await created.json())).toMatchObject({
      text: "order coffee",
      source: "learner",
    });
    clock.now = new Date(NOW.getTime() + 60_000);
    await call("/can-do", { method: "POST", body: { text: "explain a bug in English" } });
    store.canDos.push({
      id: "s1",
      text: "Puedo describir rutinas.",
      source: "suggested",
      createdAt: at(2026, 10, 1),
    });

    const list = CanDoListResponse.parse(await (await call("/can-do")).json());
    expect(list.entries.map((e) => [e.text, e.source])).toEqual([
      ["explain a bug in English", "learner"],
      ["order coffee", "learner"],
      ["Puedo describir rutinas.", "suggested"],
    ]);
  });

  it("classifies error trends", async () => {
    const { call, store } = await setup();
    const subs = [1, 2, 3, 4].map((d) => submission(at(2026, 10, d), scores(60)));
    store.submissions.push(...subs);
    store.errors.push(
      ...subs.slice(0, 2).map((s) => writingError(s, "articles")),
      ...subs.slice(2).map((s) => writingError(s, "word_order", 4)),
    );
    store.units.push(unitRecord(4, { title: "Word order" }));
    const errors = ErrorsResponse.parse(await (await call("/errors")).json());
    expect(errors.beating.map((t) => t.type)).toEqual(["articles"]);
    expect(errors.recurring.map((t) => [t.type, t.units])).toEqual([
      ["word_order", [{ unit: 4, title: "Word order" }]],
    ]);
  });
});
