import {
  PracticeResponse,
  WritingCurrentResponse,
  WritingHistoryResponse,
  WritingMissionResponse,
} from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createTestAuth, loginCookie } from "../auth/auth.test-support.ts";
import { REPO_CONTENT_DIR } from "../content/content-dir.test-support.ts";
import { createSettings } from "../settings/settings.service.ts";
import { createMemorySettingsStore } from "../settings/settings.store.ts";
import { createFakeLlm, type FakeLlm } from "../shared/llm/fake.ts";
import type { OwnErrorInput } from "../vocabulary/cards.ts";
import { createMemoryWritingStore, type MemoryWritingStore } from "./writing.memory-store.ts";
import { createWriting, LEVEL_KEY } from "./writing.service.ts";

const APP_SECRET = "ef".repeat(32);
const NOW = new Date("2026-10-25T08:00:00Z");

const DRAFT = "Yesterday the company launch a new robot. It sort trash very fast.";
const FIXED = "Yesterday the company launched a new robot. It sort trash very quickly.";

const scores = { grammar: 60, clarity: 80, vocabulary: 70, naturalness: 66 };

const reviewReply = JSON.stringify({
  errors: [
    { id: "e1", span: "launch", type: "grammar", unitId: 5, hintEs: "Pasado simple: -ed." },
    { id: "e2", span: "It sort", type: "grammar", unitId: 99, hintEs: "Tercera persona: -s." },
  ],
  scores,
  strengthEs: "Buen uso de 'Yesterday'.",
});

const recheckReply = (e1: string, e2: string, newIssue?: object) =>
  JSON.stringify({
    results: [
      { errorId: "e1", status: e1, feedbackEs: "Bien: pasado simple." },
      { errorId: "e2", status: e2, feedbackEs: "Mira el sujeto: it." },
    ].filter((r) => r.status),
    ...(newIssue ? { newIssue } : {}),
  });

const revealReply = JSON.stringify({
  items: [
    { errorId: "e2", correctedFragment: "It sorts", explanationEs: "Con it, el verbo lleva -s." },
  ],
});

const rewriteReply = JSON.stringify({
  versions: [
    { register: "casual", text: "The company just launched a robot.", noteEs: "just + pasado" },
    { register: "professional", text: "The company launched a robot.", noteEs: "Directo." },
  ],
});

const missionReply = JSON.stringify({
  title: "Robots on the line",
  format: "tweet",
  topic: "Recycling robots",
  promptEn: "Explain what the recycling robots did last week.",
  whyEs: "Conecta con tu lectura.",
  targetUnitId: 5,
  constraints: {
    minWords: 20,
    maxWords: 45,
    grammarTargets: ["simple past"],
    suggestedWords: ["sort"],
  },
});

type Setup = { replies?: string[]; store?: MemoryWritingStore };

async function setup(options: Setup = {}) {
  const store = options.store ?? createMemoryWritingStore();
  const llm: FakeLlm = createFakeLlm({ jsonReplies: options.replies ?? [] });
  const settingsStore = createMemorySettingsStore();
  const settings = createSettings({
    store: settingsStore,
    appSecret: APP_SECRET,
    createClient: () => llm,
  });
  const cards: OwnErrorInput[] = [];
  const writing = createWriting({
    store,
    settings: settingsStore,
    ai: settings,
    ownErrors: {
      async createOwnErrorCard(_userId, input) {
        cards.push(input);
        return { cardId: `card-${cards.length}` };
      },
    },
    now: () => NOW,
  });
  const { auth, user } = await createTestAuth();
  const userId = user.id;
  const app = createApp({ contentDir: REPO_CONTENT_DIR, pingDb: async () => true, auth, writing });
  const cookie = await loginCookie(app);
  const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
    app.request(`/api/writing${path}`, {
      method: init.method ?? "GET",
      headers: { cookie, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const mission = async (path: string, method = "POST", body: unknown = {}) => {
    const res = await call(path, { method, body });
    expect(res.status).toBe(200);
    return WritingMissionResponse.parse(await res.json());
  };
  return { call, mission, store, llm, cards, settingsStore, userId };
}

const userPrompt = (llm: FakeLlm, index: number) =>
  String(llm.calls.filter((c) => c.method === "chatJson")[index]?.req?.messages.at(-1)?.content);

describe("writing missions", () => {
  it("generates a fallback mission when the AI is unavailable, one at a time", async () => {
    const { call, mission } = await setup();
    const empty = WritingCurrentResponse.parse(await (await call("/missions/current")).json());
    expect(empty).toMatchObject({ mission: null, level: { level: 1, format: "tweet" } });

    const created = await mission("/missions/generate");
    expect(created.mission).toMatchObject({
      source: "fallback",
      format: "tweet",
      targetUnit: { id: 1 },
      limits: { maxChars: 280 },
    });
    expect(created.submission).toMatchObject({ status: "draft", text: "", errors: [] });

    expect((await call("/missions/generate", { method: "POST" })).status).toBe(409);
    const current = WritingCurrentResponse.parse(await (await call("/missions/current")).json());
    expect(current.mission?.id).toBe(created.mission.id);
  });

  it("builds the AI mission from the week's opinions and the boosted unit", async () => {
    const store = createMemoryWritingStore();
    store.reading.push(
      { title: "Robots that sort recycling", opinion: "Robots help.", startedAt: NOW },
      { title: "Old story", opinion: "Too old.", startedAt: new Date("2026-10-01T00:00:00Z") },
    );
    const unit5 = store.units.find((u) => u.id === 5);
    if (unit5) unit5.priority = 2;
    const { mission, llm } = await setup({ store, replies: [missionReply] });

    const created = await mission("/missions/generate");
    expect(created.mission).toMatchObject({
      source: "ai",
      title: "Robots on the line",
      targetUnit: { id: 5, title: "Simple Past" },
      limits: { minWords: 20, maxWords: 45 },
      inspiration: [{ title: "Robots that sort recycling", opinion: "Robots help." }],
    });
    const prompt = userPrompt(llm, 0);
    expect(prompt).toContain("Robots help.");
    expect(prompt).not.toContain("Too old.");
    expect(prompt).toContain("Target unit 5");
  });
});

describe("writing review flow", () => {
  it("runs draft → reviewed → rechecked ×2 → rewritten → completed with side effects", async () => {
    const { mission, store, cards, llm } = await setup({
      replies: [
        missionReply,
        reviewReply,
        recheckReply("fixed", "remaining"),
        recheckReply("", "changed"),
        revealReply,
        rewriteReply,
      ],
    });
    const { mission: m } = await mission("/missions/generate");
    const id = m.id;

    const draft = await mission(`/missions/${id}/draft`, "PUT", { text: "Yesterday the" });
    expect(draft.submission).toMatchObject({ status: "draft", text: "Yesterday the" });

    // Submit: hints only, no corrections.
    const reviewed = await mission(`/missions/${id}/submit`, "POST", { text: DRAFT });
    expect(reviewed.submission).toMatchObject({
      status: "reviewed",
      submittedText: DRAFT,
      scores,
      overall: 69,
      can: { recheck: true, rewrite: false },
    });
    expect(reviewed.submission.errors).toEqual([
      expect.objectContaining({
        span: "launch",
        unit: { id: 5, title: "Simple Past" },
        status: "open",
        reveal: null,
      }),
      expect.objectContaining({ span: "It sort", unit: null, status: "open", reveal: null }),
    ]);
    expect(JSON.stringify(reviewed)).not.toContain("launched");
    expect(store.units.find((u) => u.id === 5)?.priority).toBe(1);
    expect(store.events.map((e) => e.type)).toEqual(["writing_submitted"]);
    expect(store.events[0]?.payload).toMatchObject({ overall: 69, errorCount: 2 });

    // Recheck 1: e1 fixed → own-error card from the learner's own sentences.
    const first = await mission(`/missions/${id}/recheck`, "POST", { text: FIXED });
    expect(first.submission).toMatchObject({ status: "rechecked", round: 1, text: FIXED });
    expect(first.submission.errors.map((e) => e.status)).toEqual(["fixed", "remaining"]);
    expect(cards).toEqual([
      expect.objectContaining({
        original: "Yesterday the company launch a new robot.",
        corrected: "Yesterday the company launched a new robot.",
        hintEs: "Pasado simple: -ed.",
        unitId: 5,
      }),
    ]);
    expect(first.submission.errors.every((e) => e.reveal === null)).toBe(true);

    // Recheck 2 (last round): e2 still wrong → reveal the explanation and corrected fragment.
    const second = await mission(`/missions/${id}/recheck`, "POST", { text: FIXED });
    expect(second.submission).toMatchObject({
      round: 2,
      can: { recheck: false, rewrite: true },
    });
    expect(second.submission.errors[1]).toMatchObject({
      status: "changed",
      reveal: { correctedFragment: "It sorts", explanationEs: "Con it, el verbo lleva -s." },
    });
    expect(cards).toHaveLength(1);
    expect(userPrompt(llm, 3)).toContain("e2");
    expect(userPrompt(llm, 3)).not.toContain("e1 [");

    // Rewrites from the learner's fixed text.
    const rewritten = await mission(`/missions/${id}/rewrite`);
    expect(rewritten.submission.status).toBe("rewritten");
    expect(rewritten.submission.rewrites.map((r) => r.register)).toEqual([
      "casual",
      "professional",
    ]);
    expect(userPrompt(llm, 5)).toContain(FIXED);

    const done = await mission(`/missions/${id}/complete`, "POST", { publishedVersion: "casual" });
    expect(done.submission).toMatchObject({
      status: "completed",
      publishedVersion: "casual",
      publishedAt: NOW.toISOString(),
    });
    expect(store.events.at(-1)).toMatchObject({
      type: "writing_completed",
      payload: { overall: 69, errorCount: 2, fixedCount: 1, publishedVersion: "casual" },
    });
    expect(store.missions[0]?.status).toBe("done");
  });

  it("adds a new issue introduced by a fix and raises its unit's priority", async () => {
    const newIssue = { span: "very quickly", type: "word_choice", unitId: 2, hintEs: "Revisa." };
    const { mission, store } = await setup({
      replies: [missionReply, reviewReply, recheckReply("fixed", "fixed", newIssue)],
    });
    const { mission: m } = await mission("/missions/generate");
    await mission(`/missions/${m.id}/submit`, "POST", { text: DRAFT });
    const after = await mission(`/missions/${m.id}/recheck`, "POST", { text: FIXED });
    expect(after.submission.errors.at(-1)).toMatchObject({
      span: "very quickly",
      origin: "recheck",
      status: "open",
    });
    expect(after.submission.can).toMatchObject({ recheck: true, rewrite: false });
    expect(store.units.find((u) => u.id === 2)?.priority).toBe(1);
  });

  it("keeps the text and reports ai-unavailable when the review cannot run", async () => {
    const { mission, call, store } = await setup();
    const { mission: m } = await mission("/missions/generate");
    const res = await mission(`/missions/${m.id}/submit`, "POST", { text: DRAFT });
    expect(res.error).toBe("ai-unavailable");
    expect(res.submission).toMatchObject({ status: "draft", text: DRAFT, errors: [] });
    expect(store.events).toEqual([]);
    expect(
      (await call(`/missions/${m.id}/recheck`, { method: "POST", body: { text: DRAFT } })).status,
    ).toBe(409);
  });

  it("bumps the mission's updated_at on draft saves and submissions", async () => {
    const { mission, store } = await setup();
    const { mission: m } = await mission("/missions/generate");
    const stamp = () => store.missions.find((x) => x.id === m.id)?.updatedAt.getTime() ?? 0;
    const created = stamp();
    expect(created).toBe(store.missions[0]?.createdAt.getTime());

    await mission(`/missions/${m.id}/draft`, "PUT", { text: DRAFT });
    const drafted = stamp();
    expect(drafted).toBeGreaterThan(created);

    await mission(`/missions/${m.id}/submit`, "POST", { text: DRAFT });
    expect(stamp()).toBeGreaterThan(drafted);
  });

  it("validates ids and bodies", async () => {
    const { call, mission } = await setup();
    expect((await call("/missions/nope/rewrite", { method: "POST" })).status).toBe(404);
    expect((await call(`/missions/${crypto.randomUUID()}/skip`, { method: "POST" })).status).toBe(
      404,
    );
    const { mission: m } = await mission("/missions/generate");
    expect(
      (await call(`/missions/${m.id}/submit`, { method: "POST", body: { text: "  " } })).status,
    ).toBe(400);
    const skipped = await mission(`/missions/${m.id}/skip`);
    expect(skipped.submission.status).toBe("skipped");
    expect((await call("/missions/current")).status).toBe(200);
  });
});

describe("level progression", () => {
  it("moves to the next format after 3 completed missions averaging ≥ 75", async () => {
    const good = JSON.stringify({
      errors: [],
      scores: { grammar: 80, clarity: 80, vocabulary: 76, naturalness: 76 },
      strengthEs: "Claro.",
    });
    const { mission, settingsStore, store, call, userId } = await setup({
      replies: [missionReply, good, missionReply, good, missionReply, good],
    });
    for (let i = 0; i < 3; i += 1) {
      const { mission: m } = await mission("/missions/generate");
      const reviewed = await mission(`/missions/${m.id}/submit`, "POST", { text: DRAFT });
      // No errors → straight to rewrites; completing without them is allowed (rewrites optional).
      expect(reviewed.submission.can).toMatchObject({
        recheck: false,
        rewrite: true,
        complete: true,
      });
      const done = await mission(`/missions/${m.id}/complete`);
      expect(Boolean(done.levelUp)).toBe(i === 2);
    }
    expect(await settingsStore.getSetting(userId, LEVEL_KEY)).toBe(2);
    expect(store.events.at(-1)).toMatchObject({
      type: "writing_level_up",
      payload: { from: 1, to: 2 },
    });

    const history = WritingHistoryResponse.parse(await (await call("/missions")).json());
    expect(history.level).toMatchObject({ level: 2, format: "thread", completed: 0 });
    expect(history.missions).toHaveLength(3);
    expect(history.missions[0]).toMatchObject({ status: "completed", overall: 78, errorCount: 0 });
  });
});

describe("practice", () => {
  it("returns no items without recent errors", async () => {
    const { call } = await setup();
    const res = await call("/practice", { method: "POST", body: {} });
    expect(PracticeResponse.parse(await res.json())).toEqual({ unit: null, items: [] });
  });

  it("turns recent errors of the most frequent unit into practice items", async () => {
    const practiceReply = JSON.stringify({
      items: [
        {
          sourceId: "x",
          type: "fix_sentence",
          instructionEs: "Corrige la frase.",
          prompt: "Yesterday the company launch a new robot.",
          answer: "Yesterday the company launched a new robot.",
          acceptedAlternatives: [],
        },
      ],
    });
    const { call, mission, llm } = await setup({
      replies: [missionReply, reviewReply, practiceReply],
    });
    const { mission: m } = await mission("/missions/generate");
    await mission(`/missions/${m.id}/submit`, "POST", { text: DRAFT });
    const res = PracticeResponse.parse(
      await (await call("/practice", { method: "POST", body: { count: 3 } })).json(),
    );
    expect(res.unit).toEqual({ id: 5, title: "Simple Past" });
    expect(res.items).toHaveLength(1);
    const prompt = userPrompt(llm, 2);
    expect(prompt).toContain("Yesterday the company launch a new robot.");
    expect(prompt).not.toContain("It sort trash");
  });
});
