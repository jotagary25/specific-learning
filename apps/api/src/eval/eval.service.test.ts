import type {
  AiFunctionConfig,
  AiKeyStatus,
  UpdateAiFunctionRequest,
} from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { LlmError } from "../shared/llm/errors.ts";
import { createMemoryEvalStore } from "./eval.memory-store.ts";
import { createEval, EvalRunError } from "./eval.service.ts";
import { flush, type Reply, scriptedLlm, simpleFixtures } from "./eval.test-support.ts";

function setup(reply: Reply, opts: { configured?: boolean; concurrency?: number } = {}) {
  const store = createMemoryEvalStore();
  const { client, stats } = scriptedLlm(reply);
  const updates: Array<{ id: string; input: UpdateAiFunctionRequest }> = [];
  let clock = 1_000;
  const keyStatus = async (): Promise<AiKeyStatus> =>
    opts.configured === false
      ? { configured: false, source: null, last4: null }
      : { configured: true, source: "db", last4: "WXYZ" };
  const evals = createEval({
    store,
    fixtures: simpleFixtures(),
    concurrency: opts.concurrency,
    now: () => (clock += 50),
    ai: {
      client,
      keyStatus,
      updateAiFunction: async (id, input): Promise<AiFunctionConfig> => {
        updates.push({ id, input });
        return {
          id: "review_writing",
          tier: "quality",
          model: input.model,
          think: input.think,
          defaultModel: "deepseek-v4-pro",
          defaultThink: "high",
          isDefault: false,
        };
      },
    },
  });
  return { evals, store, stats, updates };
}

const valid = (score = 1) => JSON.stringify({ score });

describe("eval runner", () => {
  it("runs every model config over the fixtures and aggregates the results", async () => {
    const { evals } = setup(() => valid(0.5));
    const ids = await evals.start({
      models: [
        { model: "gemma4:31b", think: "low" },
        { model: "deepseek-v4-pro", think: null },
      ],
    });
    expect(ids).toHaveLength(2);
    await evals.whenIdle();

    const run = await evals.get(ids[0] as string);
    expect(run).toMatchObject({
      model: "gemma4:31b",
      think: "low",
      functions: ["review_writing"],
      status: "completed",
      progress: { done: 3, total: 3 },
      error: null,
    });
    expect(run.samples).toHaveLength(3);
    expect(run.samples[0]).toMatchObject({ ok: true, attempts: 1, tokens: 15 });
    expect(run.samples[0]?.latencyMs).toBeGreaterThan(0);
    expect(run.aggregate).toMatchObject({
      calls: 3,
      failures: 0,
      totalTokens: 45,
      jsonFailureRate: 0,
      metrics: { recall: 0.5, jsonValidity: 1 },
    });
    expect((await evals.get(ids[1] as string)).status).toBe("completed");

    const list = await evals.list();
    expect(list.map((r) => r.id)).toEqual([...ids].reverse());
    expect(list[0]).not.toHaveProperty("samples");
  });

  it("counts every requested function in the progress total", async () => {
    const { evals } = setup(() => valid());
    const [id] = await evals.start({
      models: [{ model: "m", think: null }],
      functions: ["review_writing", "hint_exercise", "rewrite_natural"],
    });
    await evals.whenIdle();
    const run = await evals.get(id as string);
    expect(run.progress).toEqual({ done: 5, total: 5 });
    expect(run.samples.map((s) => s.functionId)).toEqual([
      "review_writing",
      "review_writing",
      "review_writing",
      "hint_exercise",
      "rewrite_natural",
    ]);
  });

  it("records the JSON retry when the first reply is invalid", async () => {
    let calls = 0;
    const { evals } = setup(() => (++calls === 1 ? "not json" : valid()));
    const [id] = await evals.start({ models: [{ model: "m", think: null }] });
    await evals.whenIdle();
    const run = await evals.get(id as string);
    expect(run.samples[0]).toMatchObject({ ok: true, attempts: 2 });
    expect(run.aggregate?.retryRate).toBeCloseTo(1 / 3);
    expect(run.aggregate?.jsonFailureRate).toBe(0);
  });

  it("keeps going after a sample fails and counts it as a JSON failure", async () => {
    const { evals } = setup(() => JSON.stringify({ score: 7 }));
    const [id] = await evals.start({ models: [{ model: "m", think: null }] });
    await evals.whenIdle();
    const run = await evals.get(id as string);
    expect(run.status).toBe("completed");
    expect(run.samples).toHaveLength(3);
    expect(run.samples[0]).toMatchObject({
      ok: false,
      attempts: 2,
      tokens: null,
      error: { code: "invalid_output" },
      metrics: { recall: 0 },
    });
    expect(run.aggregate).toMatchObject({ failures: 3, jsonFailureRate: 1 });
  });

  it("records an upstream failure per sample without stopping the run", async () => {
    let calls = 0;
    const { evals } = setup(() => {
      calls += 1;
      if (calls === 2) throw new LlmError("timeout", "too slow");
      return valid();
    });
    const [id] = await evals.start({ models: [{ model: "m", think: null }] });
    await evals.whenIdle();
    const run = await evals.get(id as string);
    expect(run.samples.map((s) => s.error?.code ?? "ok")).toEqual(["ok", "timeout", "ok"]);
    expect(run.aggregate).toMatchObject({ failures: 1, jsonFailureRate: 0 });
  });

  it("fails the run on a fatal error such as an unknown model", async () => {
    const { evals, stats } = setup(() => {
      throw new LlmError("not_found", 'model "nope" not found', { status: 404 });
    });
    const [id] = await evals.start({ models: [{ model: "nope", think: null }] });
    await evals.whenIdle();
    const run = await evals.get(id as string);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/not_found/);
    expect(run.samples).toEqual([]);
    expect(stats.calls).toBe(1);
  });

  it("refuses to start without an API key and creates no run", async () => {
    const { evals, store } = setup(() => valid(), { configured: false });
    await expect(evals.start({ models: [{ model: "m", think: null }] })).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(store.records).toEqual([]);
  });

  it("never runs more than two model configs at the same time", async () => {
    const { evals, stats } = setup(async () => {
      await flush();
      return valid();
    });
    await evals.start({
      models: [
        { model: "a", think: null },
        { model: "b", think: null },
        { model: "c", think: null },
      ],
    });
    await evals.whenIdle();
    expect(stats.calls).toBe(9);
    expect(stats.maxInFlight).toBe(2);
  });

  it("cancels a running run, aborting the call in flight", async () => {
    let release: (() => void) | undefined;
    const { evals, stats } = setup(
      (req) =>
        new Promise<string>((resolve, reject) => {
          release = () => resolve(valid());
          req.signal?.addEventListener("abort", () => reject(new LlmError("aborted", "aborted")));
        }),
    );
    const [id] = await evals.start({ models: [{ model: "m", think: null }] });
    await flush();
    expect(stats.calls).toBe(1);
    const run = await evals.cancel(id as string);
    expect(run.status).toBe("cancelled");
    expect(run.samples).toEqual([]);
    expect(run.finishedAt).not.toBeNull();
    release?.();
    await evals.whenIdle();
    expect(stats.calls).toBe(1);
    await expect(evals.cancel(id as string)).rejects.toMatchObject({ code: "not_running" });
  });

  it("cancels a queued run before it starts", async () => {
    const { evals } = setup(
      async () => {
        await flush();
        return valid();
      },
      { concurrency: 1 },
    );
    const [first, second] = await evals.start({
      models: [
        { model: "a", think: null },
        { model: "b", think: null },
      ],
    });
    expect((await evals.cancel(second as string)).status).toBe("cancelled");
    await evals.whenIdle();
    expect((await evals.get(first as string)).status).toBe("completed");
    expect((await evals.get(second as string)).samples).toEqual([]);
  });

  it("applies a completed run's model and effort to an evaluated function", async () => {
    const { evals, updates } = setup(() => valid());
    const [id] = await evals.start({ models: [{ model: "kimi-k3", think: "high" }] });
    await evals.whenIdle();
    const config = await evals.apply(id as string, "review_writing");
    expect(config).toMatchObject({ model: "kimi-k3", think: "high" });
    expect(updates).toEqual([{ id: "review_writing", input: { model: "kimi-k3", think: "high" } }]);
    await expect(evals.apply(id as string, "rewrite_natural")).rejects.toBeInstanceOf(EvalRunError);
  });

  it("does not apply a run that did not complete", async () => {
    const { evals, updates } = setup(() => {
      throw new LlmError("invalid_key", "bad key");
    });
    const [id] = await evals.start({ models: [{ model: "m", think: null }] });
    await evals.whenIdle();
    await expect(evals.apply(id as string, "review_writing")).rejects.toMatchObject({
      code: "not_completed",
    });
    expect(updates).toEqual([]);
  });

  it("marks runs interrupted by a restart as failed", async () => {
    const { evals, store } = setup(() => valid());
    const record = await store.create("m", {
      version: 1,
      think: null,
      functions: ["review_writing"],
      status: "running",
      progress: { done: 1, total: 3 },
      startedAt: new Date(0).toISOString(),
      finishedAt: null,
      error: null,
      samples: [],
      aggregate: null,
    });
    expect(await evals.recover()).toBe(1);
    expect(await evals.get(record.id)).toMatchObject({
      status: "failed",
      error: "Interrupted by an API restart",
    });
  });
});
