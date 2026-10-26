import {
  type AiFunctionConfig,
  type AiFunctionId,
  type EvalFunctionId,
  type EvalRun,
  type EvalRunState,
  type EvalRunSummary,
  type EvalSampleResult,
  StartEvalRequest,
} from "@english-course/shared";
import type { z } from "zod";
import type { Settings } from "../settings/settings.service.ts";
import { isLlmError, type LlmErrorCode } from "../shared/llm/errors.ts";
import type { Usage } from "../shared/llm/types.ts";
import type { EvalRunRecord, EvalStore } from "./eval.store.ts";
import { type EvalCase, type EvalFixtures, fixtureCounts } from "./fixtures.ts";
import { aggregate, failedMetrics } from "./scoring.ts";

export type EvalAi = Pick<Settings, "clientFor" | "keyStatus" | "updateAiFunction">;

export type EvalOptions = {
  store: EvalStore;
  ai: EvalAi;
  /** Fixtures, or a loader called once on first use. */
  fixtures: EvalFixtures | (() => Promise<EvalFixtures>);
  /** Runs executed at the same time; each run makes one call at a time. Default 2. */
  concurrency?: number;
  now?: () => number;
};

export class EvalRunError extends Error {
  override readonly name = "EvalRunError";
  readonly code:
    | "not_found"
    | "not_configured"
    | "not_running"
    | "not_completed"
    | "function_not_evaluated";

  constructor(code: EvalRunError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** Errors that make every later call fail too: the run stops and is marked failed. */
const FATAL_CODES = new Set<LlmErrorCode>(["not_configured", "invalid_key", "not_found"]);
const LIST_LIMIT = 50;
/** Runs checked at start-up for interruption, across all users. */
const RECOVER_LIMIT = 200;

const tokensOf = (usage: Usage | undefined) =>
  usage?.promptTokens === undefined && usage?.completionTokens === undefined
    ? null
    : (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);

type CaseOutcome = { sample: EvalSampleResult } | { fatal: string };

export function createEval(options: EvalOptions) {
  const { store, ai } = options;
  const now = options.now ?? Date.now;
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const iso = () => new Date(now()).toISOString();

  let fixturesPromise: Promise<EvalFixtures> | undefined;
  const fixtures = () => {
    const source = options.fixtures;
    fixturesPromise ??= typeof source === "function" ? source() : Promise.resolve(source);
    return fixturesPromise;
  };

  /** Queued runs with their owner (the run uses the owner's key and is saved for them). */
  const queue: Array<{ id: string; userId: string }> = [];
  const running = new Map<string, { controller: AbortController; done: Promise<void> }>();
  let idleWaiters: Array<() => void> = [];

  const toRun = (record: EvalRunRecord): EvalRun => {
    const { version: _version, ...state } = record.state;
    return {
      id: record.id,
      model: record.model,
      createdAt: record.createdAt.toISOString(),
      ...state,
    };
  };
  const toSummary = (record: EvalRunRecord): EvalRunSummary => {
    const { samples: _samples, ...summary } = toRun(record);
    return summary;
  };

  async function mustGet(userId: string, id: string): Promise<EvalRunRecord> {
    const record = await store.get(userId, id);
    if (!record) throw new EvalRunError("not_found", `Eval run ${id} not found`);
    return record;
  }

  async function runCase(
    userId: string,
    c: EvalCase,
    model: string,
    think: EvalRunState["think"],
    signal: AbortSignal,
  ): Promise<CaseOutcome> {
    const base = { functionId: c.functionId, sampleId: c.sampleId, label: c.label };
    const started = now();
    try {
      const { data, attempts, usage } = await ai
        .clientFor(userId)
        .chatJson({ model, think, messages: c.messages, signal }, c.schema as z.ZodType);
      return {
        sample: {
          ...base,
          ok: true,
          latencyMs: now() - started,
          attempts,
          tokens: tokensOf(usage),
          output: data,
          ...c.score(data),
        },
      };
    } catch (error) {
      if (isLlmError(error) && FATAL_CODES.has(error.code)) {
        return { fatal: `${error.code}: ${error.message}` };
      }
      const code = isLlmError(error) ? error.code : "error";
      if (!isLlmError(error)) console.error(`eval: ${c.functionId}/${c.sampleId} failed`, error);
      return {
        sample: {
          ...base,
          ok: false,
          latencyMs: now() - started,
          attempts: code === "invalid_output" ? 2 : 0,
          tokens: null,
          error: { code, message: error instanceof Error ? error.message : String(error) },
          metrics: failedMetrics(c.functionId),
        },
      };
    }
  }

  async function execute(
    { id, userId }: { id: string; userId: string },
    controller: AbortController,
  ): Promise<void> {
    const record = await store.get(userId, id);
    if (record?.state.status !== "queued") return;
    let state: EvalRunState = { ...record.state, status: "running", startedAt: iso() };
    try {
      await store.save(userId, id, state);
      const all = await fixtures();
      const cases = state.functions.flatMap((fn) => all[fn]);
      for (const c of cases) {
        if (controller.signal.aborted) break;
        const outcome = await runCase(userId, c, record.model, state.think, controller.signal);
        // A result that arrives after cancel is discarded.
        if (controller.signal.aborted) break;
        if ("fatal" in outcome) {
          state = { ...state, status: "failed", error: outcome.fatal };
          break;
        }
        state = {
          ...state,
          samples: [...state.samples, outcome.sample],
          progress: { ...state.progress, done: state.progress.done + 1 },
        };
        await store.save(userId, id, state);
      }
      const status = controller.signal.aborted
        ? "cancelled"
        : state.status === "failed"
          ? "failed"
          : "completed";
      state = { ...state, status, finishedAt: iso(), aggregate: aggregate(state.samples) };
      await store.save(userId, id, state);
    } catch (error) {
      console.error(`eval: run ${id} crashed`, error);
      const message = error instanceof Error ? error.message : String(error);
      await store
        .save(userId, id, {
          ...state,
          status: "failed",
          error: message,
          finishedAt: iso(),
          aggregate: aggregate(state.samples),
        })
        .catch((saveError: unknown) => console.error(`eval: run ${id} not saved`, saveError));
    }
  }

  function pump() {
    while (running.size < concurrency && queue.length > 0) {
      const next = queue.shift() as { id: string; userId: string };
      const controller = new AbortController();
      const done = execute(next, controller).finally(() => {
        running.delete(next.id);
        pump();
      });
      running.set(next.id, { controller, done });
    }
    if (running.size === 0 && queue.length === 0) {
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  return {
    async fixtureCounts(): Promise<Record<EvalFunctionId, number>> {
      return fixtureCounts(await fixtures());
    },

    /** Creates one queued run per model config and starts them in the background. */
    async start(userId: string, input: StartEvalRequest): Promise<string[]> {
      const request = StartEvalRequest.parse(input);
      if (!(await ai.keyStatus(userId)).configured) {
        throw new EvalRunError(
          "not_configured",
          "No Ollama API key is configured. Add it in Settings before running an evaluation.",
        );
      }
      const counts = fixtureCounts(await fixtures());
      const total = request.functions.reduce((sum, fn) => sum + counts[fn], 0);
      const ids: string[] = [];
      for (const config of request.models) {
        const record = await store.create(userId, config.model, {
          version: 1,
          think: config.think,
          functions: request.functions,
          status: "queued",
          progress: { done: 0, total },
          startedAt: null,
          finishedAt: null,
          error: null,
          samples: [],
          aggregate: null,
        });
        ids.push(record.id);
      }
      queue.push(...ids.map((id) => ({ id, userId })));
      pump();
      return ids;
    },

    async list(userId: string): Promise<EvalRunSummary[]> {
      return (await store.list(userId, LIST_LIMIT)).map(toSummary);
    },

    async get(userId: string, id: string): Promise<EvalRun> {
      return toRun(await mustGet(userId, id));
    },

    async cancel(userId: string, id: string): Promise<EvalRun> {
      const record = await mustGet(userId, id);
      const queuedAt = queue.findIndex((entry) => entry.id === id);
      if (queuedAt >= 0) {
        queue.splice(queuedAt, 1);
        await store.save(userId, id, {
          ...record.state,
          status: "cancelled",
          finishedAt: iso(),
          aggregate: aggregate(record.state.samples),
        });
        pump();
        return toRun(await mustGet(userId, id));
      }
      const active = running.get(id);
      if (!active) throw new EvalRunError("not_running", `Eval run ${id} is not running`);
      active.controller.abort();
      await active.done;
      return toRun(await mustGet(userId, id));
    },

    /** Sets one evaluated function's model and effort to this run's config. */
    async apply(userId: string, id: string, functionId: AiFunctionId): Promise<AiFunctionConfig> {
      const record = await mustGet(userId, id);
      if (record.state.status !== "completed") {
        throw new EvalRunError("not_completed", "Only a completed run can be applied");
      }
      if (!(record.state.functions as string[]).includes(functionId)) {
        throw new EvalRunError(
          "function_not_evaluated",
          `This run did not evaluate ${functionId}; run it for that function first`,
        );
      }
      return ai.updateAiFunction(userId, functionId, {
        model: record.model,
        think: record.state.think,
      });
    },

    /**
     * Marks runs left queued/running by a previous process as failed, for every user. Call once
     * at startup.
     */
    async recover(): Promise<number> {
      const stale = (await store.listAllUsers(RECOVER_LIMIT)).filter(
        (r) =>
          (r.state.status === "queued" || r.state.status === "running") &&
          !running.has(r.id) &&
          !queue.some((entry) => entry.id === r.id),
      );
      for (const record of stale) {
        await store.save(record.userId, record.id, {
          ...record.state,
          status: "failed",
          error: "Interrupted by an API restart",
          finishedAt: iso(),
          aggregate: aggregate(record.state.samples),
        });
      }
      return stale.length;
    },

    /** Resolves when no run is queued or running (tests). */
    whenIdle(): Promise<void> {
      if (running.size === 0 && queue.length === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
  };
}

export type Eval = ReturnType<typeof createEval>;
