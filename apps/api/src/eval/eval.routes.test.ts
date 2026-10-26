import {
  AiFunctionConfig,
  AiFunctionsResponse,
  EvalFixturesResponse,
  EvalRun,
  EvalRunsResponse,
  StartEvalResponse,
} from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createTestAuth, loginCookie } from "../auth/auth.test-support.ts";
import { resolveContentDir } from "../content/content-dir.ts";
import { createSettings } from "../settings/settings.service.ts";
import { createMemorySettingsStore } from "../settings/settings.store.ts";
import { createMemoryEvalStore } from "./eval.memory-store.ts";
import { createEval } from "./eval.service.ts";
import { type Reply, scriptedLlm } from "./eval.test-support.ts";
import { correctedText, loadEvalFixtures } from "./fixtures.ts";

const APP_SECRET = "cd".repeat(32);

/** Valid replies chosen by the requested JSON schema. */
const reply: Reply = (req) => {
  const properties = Object.keys((req.format?.properties as object | undefined) ?? {});
  if (properties.includes("errors")) {
    return JSON.stringify({
      errors: [
        {
          id: "e1",
          span: "for write",
          type: "grammar",
          unitId: null,
          hintEs: "Después de usar, el verbo necesita otra preposición para expresar propósito.",
        },
      ],
      scores: { grammar: 60, clarity: 70, vocabulary: 65, naturalness: 60 },
      strengthEs: "Buena estructura.",
    });
  }
  if (properties.includes("versions")) {
    return JSON.stringify({
      versions: [
        { register: "casual", text: "Short casual take.", noteEs: "Más corto." },
        { register: "professional", text: "A clear professional take.", noteEs: "Más claro." },
      ],
    });
  }
  return JSON.stringify({ level: 2, hintEs: "Fíjate en la pista de tiempo de la frase." });
};

async function setup(opts: { apiKey?: string } = {}) {
  const { client, stats } = scriptedLlm(reply);
  const settings = createSettings({
    store: createMemorySettingsStore(),
    appSecret: APP_SECRET,
    envApiKey: opts.apiKey,
    createClient: () => client,
  });
  const evals = createEval({
    store: createMemoryEvalStore(),
    ai: settings,
    fixtures: () => loadEvalFixtures(resolveContentDir({})),
  });
  const { auth } = await createTestAuth();
  const app = createApp({ pingDb: async () => true, auth, settings, evals });
  const cookie = await loginCookie(app);
  const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
    app.request(`/api${path}`, {
      method: init.method ?? "GET",
      headers: { cookie, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  return { app, call, evals, stats };
}

describe("eval fixtures", () => {
  it("builds five real prompts per function from the repo content", async () => {
    const fixtures = await loadEvalFixtures(resolveContentDir({}));
    expect(fixtures.review_writing).toHaveLength(5);
    expect(fixtures.rewrite_natural).toHaveLength(5);
    expect(fixtures.hint_exercise.map((c) => c.sampleId)).toEqual([
      "1.1-2",
      "2.3-3",
      "4.4-2",
      "5.2-2",
      "6.4-2",
    ]);
    const firstReview = fixtures.review_writing[0]?.messages.at(-1)?.content ?? "";
    expect(firstReview).toContain("developers is worried about her jobs");
    const firstRewrite = fixtures.rewrite_natural[0]?.messages.at(-1)?.content ?? "";
    expect(firstRewrite).toContain("developers are worried about their jobs");
    // The hint prompt carries the secret key so the model can reason; the scorer checks leaks.
    expect(fixtures.hint_exercise[0]?.messages.at(-1)?.content).toContain("’m looking");
  });

  it("applies every correction to build the rewrite input", () => {
    expect(
      correctedText("They uses qubits. Is fun.", [
        { span: "They uses", correction: "They use" },
        { span: "Is fun", correction: "It's fun" },
      ]),
    ).toBe("They use qubits. It's fun.");
  });
});

describe("eval routes", () => {
  it("requires a session", async () => {
    const { app } = await setup();
    expect((await app.request("/api/eval/runs")).status).toBe(401);
  });

  it("answers 409 not_configured before creating a run when no API key is set", async () => {
    const { call, stats } = await setup();
    const res = await call("/eval/runs", {
      method: "POST",
      body: { models: [{ model: "m", think: null }] },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "not_configured" });
    expect(EvalRunsResponse.parse(await (await call("/eval/runs")).json()).runs).toEqual([]);
    expect(stats.calls).toBe(0);
  });

  it("validates the request body", async () => {
    const { call } = await setup({ apiKey: "test-key-1234" });
    const res = await call("/eval/runs", { method: "POST", body: { models: [] } });
    expect(res.status).toBe(400);
  });

  it("runs, reports and applies an evaluation end to end", async () => {
    const { call, evals } = await setup({ apiKey: "test-key-1234" });
    const counts = EvalFixturesResponse.parse(await (await call("/eval/fixtures")).json()).counts;
    expect(counts).toEqual({ review_writing: 5, rewrite_natural: 5, hint_exercise: 5 });

    const started = await call("/eval/runs", {
      method: "POST",
      body: {
        models: [{ model: "kimi-k3", think: "high" }],
        functions: ["review_writing", "hint_exercise"],
      },
    });
    expect(started.status).toBe(202);
    const [id] = StartEvalResponse.parse(await started.json()).runIds;
    await evals.whenIdle();

    const run = EvalRun.parse(await (await call(`/eval/runs/${id}`)).json());
    expect(run).toMatchObject({ status: "completed", progress: { done: 10, total: 10 } });
    const first = run.samples[0];
    expect(first?.review?.expected[0]).toMatchObject({ span: "for write", foundBy: "e1" });
    expect(first?.metrics).toMatchObject({ recall: 1 / 3, precision: 1, hintLeakFree: 1 });
    expect(run.aggregate?.metrics.exerciseHintLeakFree).toBe(1);
    expect(run.aggregate?.overall).toBeGreaterThan(0);

    const list = EvalRunsResponse.parse(await (await call("/eval/runs")).json());
    expect(list.runs.map((r) => r.id)).toEqual([id]);

    expect((await call("/eval/runs/nope")).status).toBe(404);
    expect((await call(`/eval/runs/${id}/cancel`, { method: "POST" })).status).toBe(409);

    const applied = await call(`/eval/runs/${id}/apply`, {
      method: "POST",
      body: { functionId: "review_writing" },
    });
    expect(applied.status).toBe(200);
    expect(AiFunctionConfig.parse(await applied.json())).toMatchObject({
      id: "review_writing",
      model: "kimi-k3",
      think: "high",
      isDefault: false,
    });
    const functions = AiFunctionsResponse.parse(
      await (await call("/settings/ai-functions")).json(),
    ).functions;
    expect(functions.find((f) => f.id === "review_writing")).toMatchObject({ model: "kimi-k3" });

    const notEvaluated = await call(`/eval/runs/${id}/apply`, {
      method: "POST",
      body: { functionId: "rewrite_natural" },
    });
    expect(notEvaluated.status).toBe(400);
  });
});
