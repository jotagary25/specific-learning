import {
  AnswersResponse,
  AttemptResponse,
  HintResponse,
  TimelineCheckResponse,
  UnitDetail,
  UnitsListResponse,
} from "@english-course/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createAuth } from "../auth/auth.ts";
import { createSettings } from "../settings/settings.service.ts";
import { createMemorySettingsStore } from "../settings/settings.store.ts";
import { LlmError } from "../shared/llm/errors.ts";
import { createFakeLlm, type FakeLlm } from "../shared/llm/fake.ts";
import { createMemoryUnitsStore, type MemoryUnitsStore } from "./units.memory-store.ts";
import { createUnits } from "./units.service.ts";

const APP_SECRET = "cd".repeat(32);
const PASSWORD = "pw";

// Loading and validating the content folder is the slow part: do it once, clone per test.
let pristine: MemoryUnitsStore;
beforeAll(async () => {
  pristine = await createMemoryUnitsStore();
});

async function setup(options: { llm?: FakeLlm; noAi?: boolean } = {}) {
  const store = await createMemoryUnitsStore();
  const llm = options.llm ?? createFakeLlm();
  const settings = createSettings({
    store: createMemorySettingsStore(),
    appSecret: APP_SECRET,
    createClient: () => llm,
  });
  const units = createUnits({ store, ai: options.noAi ? undefined : settings });
  const auth = createAuth({ password: PASSWORD, appSecret: APP_SECRET });
  const app = createApp({ pingDb: async () => true, auth, units });
  const login = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
    app.request(`/api/units${path}`, {
      method: init.method ?? "GET",
      headers: { cookie, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const post = (path: string, body: unknown) => call(path, { method: "POST", body });
  const attempt = async (itemId: string, inputs: string[], unit = itemId.split(".")[0]) => {
    const res = await post(`/${unit}/items/${itemId}/attempts`, { inputs });
    expect(res.status).toBe(200);
    return AttemptResponse.parse(await res.json());
  };
  return { app, call, post, attempt, store, llm };
}

/** Every graded item of a unit with a correct answer taken from its key. */
async function correctAnswers(unitId: number) {
  const content = await pristine.getUnitContent(unitId);
  return (content?.items ?? [])
    .filter((item) => !item.isExample && item.answer && item.answer.kind !== "open")
    .map((item) => ({
      id: item.id,
      inputs:
        item.answer?.blanks.length === 1 &&
        item.lines.flat().filter((s) => s.type === "blank").length > 1
          ? [item.answer.blanks[0]?.[0] ?? ""]
          : (item.answer?.blanks.map((alternatives) => alternatives[0] ?? "") ?? []),
      blanks: item.lines.flat().filter((s) => s.type === "blank").length,
    }))
    .filter((item) => item.inputs.length === item.blanks);
}

describe("units routes", () => {
  it("require a session", async () => {
    const { app } = await setup();
    expect((await app.request("/api/units")).status).toBe(401);
  });

  it("list block 1 with its 6 units, not started", async () => {
    const { call } = await setup();
    const body = UnitsListResponse.parse(await (await call("")).json());
    expect(body.blocks).toHaveLength(1);
    expect(body.blocks[0]?.units.map((u) => u.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.blocks[0]?.units[0]).toMatchObject({ status: "not-started", score: null });
  });

  it("serve unit content without answer keys", async () => {
    const { call } = await setup();
    const res = await call("/1");
    const raw = await res.text();
    const unit = UnitDetail.parse(JSON.parse(raw));
    expect(unit.exercises.length).toBeGreaterThan(0);
    expect(unit.story?.chapter.grammarSpans.length).toBeGreaterThan(0);
    expect(unit.extras?.puzzle.question).toBeTruthy();
    expect(unit.timeline.length).toBeGreaterThanOrEqual(3);
    expect(raw).not.toContain('"answer"');
    expect(raw).not.toContain("am looking");
    expect(raw).not.toContain("expected");
  });

  it("answer 404 for an unknown unit", async () => {
    const { call } = await setup();
    expect((await call("/99")).status).toBe(404);
  });
});

describe("attempts", () => {
  it("check deterministically, persist with attempt numbers and report progress", async () => {
    const { attempt, store, call } = await setup();
    const first = await attempt("1.1-2", ["look"]);
    expect(first).toMatchObject({ status: "incorrect", method: "deterministic", attemptNo: 1 });
    const second = await attempt("1.1-2", ["am looking"]);
    expect(second).toMatchObject({ status: "correct", attemptNo: 2, unitCompleted: false });
    expect(store.attempts.map((a) => [a.itemId, a.attemptNo])).toEqual([
      ["1.1-2", 1],
      ["1.1-2", 2],
    ]);

    const detail = UnitDetail.parse(await (await call("/1")).json());
    expect(detail.progress.status).toBe("in-progress");
    expect(detail.progress.items).toEqual([
      expect.objectContaining({ itemId: "1.1-2", attempts: 2 }),
    ]);
    // First attempt counts: the retry does not raise the score.
    expect(detail.progress.completion.correct).toBe(0);
  });

  it("reject examples, wrong blank counts and invalid bodies", async () => {
    const { post } = await setup();
    expect((await post("/1/items/1.1-1/attempts", { inputs: ["x"] })).status).toBe(400);
    expect((await post("/1/items/1.1-2/attempts", { inputs: ["a", "b"] })).status).toBe(400);
    expect((await post("/1/items/1.1-2/attempts", { nope: true })).status).toBe(400);
    expect((await post("/1/items/9.9-9/attempts", { inputs: ["x"] })).status).toBe(404);
  });

  it("complete the unit once at 80%: event and can-do written a single time", async () => {
    const { attempt, store, call } = await setup();
    const answers = await correctAnswers(1);
    let completedOn: number | undefined;
    for (const [index, item] of answers.entries()) {
      const res = await attempt(item.id, item.inputs);
      if (res.unitCompleted) {
        completedOn = index;
        expect(res.canDoEs.length).toBeGreaterThan(0);
        expect(res.completion.ratio).toBeGreaterThanOrEqual(0.8);
      }
    }
    expect(completedOn).toBeDefined();
    expect(completedOn).toBeLessThan(answers.length);
    // Not completed by the first few answers: the threshold covers the whole unit.
    expect(completedOn).toBeGreaterThan(answers.length / 2);

    // Answering again after completion does not complete it twice.
    const again = await attempt("1.1-2", ["am looking"]);
    expect(again.unitCompleted).toBe(false);
    expect(store.events.filter((e) => e.type === "unit_completed")).toHaveLength(1);
    expect(store.events[0]?.payload).toMatchObject({ unitId: 1 });
    expect(store.canDos.length).toBe(store.units.get(1)?.extras?.canDoEs.length);

    const list = UnitsListResponse.parse(await (await call("")).json());
    expect(list.blocks[0]?.units[0]).toMatchObject({ status: "completed" });
    expect(list.blocks[0]?.units[0]?.score).toBeGreaterThanOrEqual(0.8);
  });

  it("send open items to check_answer and store the AI verdict", async () => {
    const llm = createFakeLlm({
      jsonReplies: [JSON.stringify({ verdict: "correct", feedbackEs: "Bien: past continuous." })],
    });
    const { attempt, store } = await setup({ llm });
    const res = await attempt("6.1-3", ["I was writing code."]);
    expect(res).toMatchObject({
      status: "correct",
      method: "ai",
      feedbackEs: "Bien: past continuous.",
    });
    expect(store.attempts[0]?.method).toBe("ai");
    const call = llm.calls.find((c) => c.method === "chatJson");
    expect(JSON.stringify(call?.req?.messages)).toContain("I was writing code.");
  });

  it("degrade to needs-ai / ai-unavailable when no AI key is configured", async () => {
    const llm = createFakeLlm({ failWith: new LlmError("not_configured", "no key") });
    const { attempt } = await setup({ llm });
    const res = await attempt("6.1-3", ["I was sleeping."]);
    expect(res).toMatchObject({
      status: "needs-ai",
      error: "ai-unavailable",
      method: "deterministic",
    });
    expect(res.completion.pending).toBe(1);
    // Deterministic items keep working.
    expect((await attempt("6.4-2", ["x"])).method).toBe("deterministic");
  });

  it("degrade the same way when no AI is wired at all", async () => {
    const { attempt } = await setup({ noAi: true });
    expect(await attempt("6.1-3", ["I was sleeping."])).toMatchObject({ error: "ai-unavailable" });
  });
});

describe("hints", () => {
  it("graduate the level and never return the answer key", async () => {
    const llm = createFakeLlm({
      jsonReplies: [
        JSON.stringify({ level: 1, hintEs: "Fíjate en «Do you know where she is?»." }),
        // A leaking reply is replaced by a generic hint.
        JSON.stringify({ level: 2, hintEs: "La respuesta es I'm looking." }),
      ],
    });
    const { post } = await setup({ llm });
    const first = HintResponse.parse(
      await (await post("/1/items/1.1-2/hint", { shown: 0 })).json(),
    );
    expect(first).toMatchObject({ level: 1, source: "ai" });
    const second = HintResponse.parse(
      await (await post("/1/items/1.1-2/hint", { shown: 1 })).json(),
    );
    expect(second).toMatchObject({ level: 2, source: "fallback" });
    for (const hint of [first, second]) {
      expect(hint.hintEs.toLowerCase()).not.toMatch(/am looking|'m looking|’m looking/);
    }
  });

  it("raise the level with the number of attempts and fall back without AI", async () => {
    const { post, attempt } = await setup({ noAi: true });
    await attempt("1.1-2", ["look"]);
    await attempt("1.1-2", ["looks"]);
    const res = await post("/1/items/1.1-2/hint", undefined);
    expect(HintResponse.parse(await res.json())).toMatchObject({ level: 2, source: "fallback" });
  });
});

describe("explain (I don't get it)", () => {
  it("return the Spanish explanation and store a doubt", async () => {
    const reply = {
      explanationEs: "El present continuous habla de algo en curso.",
      examplesEn: ["The server is restarting."],
      backToTaskEs: "Vuelve al ítem 2.",
    };
    const llm = createFakeLlm({ jsonReplies: [JSON.stringify(reply)] });
    const { post, store } = await setup({ llm });
    const res = await post("/1/explain", {
      context: { step: "exercises", itemId: "1.1-2", question: "¿Por qué no look?" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(reply);
    expect(store.doubts).toEqual([
      {
        text: "¿Por qué no look?",
        context: expect.objectContaining({ unitId: 1, step: "exercises", itemId: "1.1-2" }),
      },
    ]);
  });

  it("answer 503 ai-unavailable without AI, still parking the doubt", async () => {
    const { post, store } = await setup({ noAi: true });
    const res = await post("/1/explain", { context: { step: "theory" } });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "ai-unavailable" });
    expect(store.doubts).toHaveLength(1);
  });
});

describe("timeline", () => {
  it("check a placement against the authored shape", async () => {
    const { post } = await setup();
    const ok = await post("/6/timeline/tl-6-1", {
      placement: { kind: "interrupted", start: -0.7, end: -0.4, interruptAt: -0.5 },
    });
    expect(ok.status).toBe(200);
    const okBody = TimelineCheckResponse.parse(await ok.json());
    expect(okBody.correct).toBe(true);
    expect(okBody.explanationEs).toBeTruthy();

    const wrong = TimelineCheckResponse.parse(
      await (
        await post("/6/timeline/tl-6-1", { placement: { kind: "point", start: -0.5 } })
      ).json(),
    );
    expect(wrong).toMatchObject({ correct: false, kindCorrect: false });
  });

  it("reject unknown items and invalid placements", async () => {
    const { post } = await setup();
    expect(
      (await post("/6/timeline/tl-9-9", { placement: { kind: "point", start: 0 } })).status,
    ).toBe(404);
    expect((await post("/6/timeline/tl-6-1", { placement: { kind: "x", start: 3 } })).status).toBe(
      400,
    );
  });
});

describe("answers (review mode)", () => {
  it("stay locked until every item of the exercise was attempted", async () => {
    const { call, attempt } = await setup();
    expect((await call("/1/answers/1.3")).status).toBe(403);
    await attempt("1.3-1", ["a", "b", "c"]);
    expect((await call("/1/answers/1.3")).status).toBe(403);
    await attempt("1.3-2", ["a", "b", "c", "d"]);
    const res = await call("/1/answers/1.3");
    expect(res.status).toBe(200);
    const body = AnswersResponse.parse(await res.json());
    expect(body.items.map((i) => i.itemId)).toEqual(["1.3-1", "1.3-2"]);
  });

  it("answer 404 for an exercise of another unit", async () => {
    const { call } = await setup();
    expect((await call("/1/answers/2.1")).status).toBe(404);
  });
});
