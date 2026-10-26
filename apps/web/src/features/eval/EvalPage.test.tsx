import type { EvalAggregate, EvalRun, EvalRunSummary } from "@english-course/shared";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderAt } from "../../test/render.tsx";
import { estimateCalls, formatUsd, sortRuns } from "./estimate.ts";

const aggregate = (overall: number, recall: number): EvalAggregate => ({
  metrics: { recall, hintLeakFree: 1, jsonValidity: 1 },
  overall,
  calls: 5,
  failures: 0,
  jsonFailureRate: 0,
  retryRate: 0,
  latencyMeanMs: 1200,
  latencyP95Ms: 2000,
  totalTokens: 900,
});

const run = (
  id: string,
  model: string,
  agg: EvalAggregate | null,
  status: EvalRunSummary["status"] = "completed",
): EvalRunSummary => ({
  id,
  model,
  think: "high",
  functions: ["review_writing"],
  status,
  progress: { done: agg ? 5 : 2, total: 5 },
  startedAt: "2026-10-25T10:00:00.000Z",
  finishedAt: agg ? "2026-10-25T10:01:00.000Z" : null,
  error: null,
  aggregate: agg,
  createdAt: "2026-10-25T10:00:00.000Z",
});

const RUNS = [
  run("r1", "gemma4:31b", aggregate(40, 0.9)),
  run("r2", "kimi-k3", aggregate(80, 0.6)),
  run("r3", "glm-5.3-flash", null, "running"),
];

const DETAIL: EvalRun = {
  ...(RUNS[1] as EvalRunSummary),
  samples: [
    {
      functionId: "review_writing",
      sampleId: "s1",
      label: "AI coding agents",
      ok: true,
      latencyMs: 900,
      attempts: 1,
      tokens: 180,
      metrics: { recall: 0.33 },
      review: {
        expected: [
          { span: "for write", type: "grammar", unitId: 62, correction: "to write", foundBy: "e1" },
          {
            span: "her jobs",
            type: "word_choice",
            unitId: null,
            correction: "their jobs",
            foundBy: null,
          },
        ],
        reported: [
          {
            id: "e1",
            span: "for write",
            type: "grammar",
            unitId: null,
            hintEs: "Revisa la preposición de propósito.",
            matches: [0],
            verdict: "match",
            unitCorrect: true,
            leak: false,
          },
          {
            id: "e2",
            span: "Right now",
            type: "word_choice",
            unitId: null,
            hintEs: "Revisa la expresión de tiempo.",
            matches: [],
            verdict: "possible_real_error",
            unitCorrect: null,
            leak: null,
          },
        ],
      },
    },
  ],
};

function evalApi() {
  const posts: Array<{ path: string; body: unknown }> = [];
  mockApi({
    "GET /api/auth/me": () => Response.json({ authenticated: true }),
    "GET /api/settings/ai-provider": () =>
      Response.json({ provider: "ollama", available: ["ollama", "openrouter"] }),
    "GET /api/settings/models?provider=ollama": () =>
      Response.json({ models: [{ name: "gemma4:31b" }, { name: "kimi-k3" }] }),
    "GET /api/settings/models/gemma4%3A31b/capabilities?provider=ollama": () =>
      Response.json({
        model: "gemma4:31b",
        capabilities: ["completion", "thinking"],
        thinking: { values: ["low", "medium", "high"], default: "medium" },
      }),
    "GET /api/settings/models/kimi-k3/capabilities?provider=ollama": () =>
      Response.json({ model: "kimi-k3", capabilities: ["completion"], thinking: null }),
    "GET /api/eval/fixtures": () =>
      Response.json({ counts: { review_writing: 5, rewrite_natural: 5, hint_exercise: 5 } }),
    "GET /api/eval/runs": () => Response.json({ runs: RUNS }),
    "GET /api/eval/runs/r2": () => Response.json(DETAIL),
    "POST /api/eval/runs": ({ body }) => {
      posts.push({ path: "/api/eval/runs", body });
      return Response.json({ runIds: ["n1", "n2"] }, { status: 202 });
    },
    "POST /api/eval/runs/r2/apply": ({ body }) => {
      posts.push({ path: "/api/eval/runs/r2/apply", body });
      return Response.json({
        id: "review_writing",
        tier: "quality",
        model: "kimi-k3",
        think: "high",
        defaultModel: "deepseek-v4-pro",
        defaultThink: "high",
        isDefault: false,
      });
    },
  });
  return { posts };
}

describe("estimate helpers", () => {
  it("multiplies fixtures of the selected functions by the models", () => {
    const counts = { review_writing: 5, rewrite_natural: 5, hint_exercise: 4 };
    expect(estimateCalls(counts, ["review_writing", "hint_exercise"], 3)).toBe(27);
    expect(estimateCalls(counts, ["review_writing"], 0)).toBe(0);
    expect(estimateCalls(undefined, ["review_writing"], 2)).toBe(0);
  });

  it("sorts runs by a metric with unscored runs last", () => {
    expect(sortRuns(RUNS, "overall", "desc").map((r) => r.id)).toEqual(["r2", "r1", "r3"]);
    expect(sortRuns(RUNS, "recall", "desc").map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(sortRuns(RUNS, "overall", "asc").map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
  });
});

describe("EvalPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("is linked from Settings", async () => {
    evalApi();
    mockApiExtend();
    renderAt("/settings");
    const link = await screen.findByRole("link", { name: "Open model evaluation" });
    expect(link.getAttribute("href")).toBe("/settings/eval");
  });

  it("estimates the calls and starts one run per selected model", async () => {
    const { posts } = evalApi();
    renderAt("/settings/eval");

    const estimate = await screen.findByTestId("estimate");
    expect(estimate.textContent).toContain("about 0 LLM calls");
    fireEvent.click(await screen.findByRole("checkbox", { name: "gemma4:31b" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "kimi-k3" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Hint exercise/ }));
    await waitFor(() => expect(estimate.textContent).toContain("about 20 LLM calls"));

    const effort = await screen.findByRole("combobox", { name: "Effort for gemma4:31b" });
    await screen.findByRole("option", { name: "high" });
    fireEvent.change(effort, { target: { value: "level:high" } });

    fireEvent.click(screen.getByRole("button", { name: "Run evaluation" }));
    await screen.findByText("Started 2 runs.");
    expect(posts[0]).toEqual({
      path: "/api/eval/runs",
      body: {
        models: [
          { model: "gemma4:31b", think: "high" },
          { model: "kimi-k3", think: null },
        ],
        functions: ["review_writing", "hint_exercise"],
      },
    });
  });

  it("renders the results sorted by overall score and re-sorts by a metric", async () => {
    evalApi();
    renderAt("/settings/eval");
    await screen.findAllByTestId("eval-run-row");
    const models = () =>
      screen
        .getAllByTestId("eval-run-row")
        .map((row) => within(row).getAllByRole("button")[0]?.textContent);
    expect(models()).toEqual(["kimi-k3", "gemma4:31b", "glm-5.3-flash"]);
    expect(screen.getByText("running 2/5")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Recall" }));
    expect(models()).toEqual(["gemma4:31b", "kimi-k3", "glm-5.3-flash"]);
  });

  it("shows reported vs expected errors in the details", async () => {
    evalApi();
    renderAt("/settings/eval");
    fireEvent.click(await screen.findByRole("button", { name: "kimi-k3" }));
    fireEvent.click(await screen.findByText(/AI coding agents/));
    expect(await screen.findByText("Expected")).toBeTruthy();
    expect(screen.getByText(/missed/)).toBeTruthy();
    expect(screen.getByText(/possible real error/)).toBeTruthy();
  });

  it("applies a run to review_writing", async () => {
    const { posts } = evalApi();
    renderAt("/settings/eval");
    fireEvent.click(await screen.findByRole("button", { name: "Use kimi-k3 for review_writing" }));
    await screen.findByText("Now used for review_writing");
    expect(posts).toContainEqual({
      path: "/api/eval/runs/r2/apply",
      body: { functionId: "review_writing" },
    });
  });
});

/** Settings page also loads the key and AI functions; answer them for the link test. */
function mockApiExtend() {
  const original = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/settings/ai-key?provider=ollama") {
        return Response.json({ configured: true, source: "db", last4: "WXYZ" });
      }
      if (path === "/api/settings/ai-functions?provider=ollama") {
        return Response.json({ functions: [] });
      }
      if (path === "/api/settings/ai-key?provider=openrouter") {
        return Response.json({ configured: false, source: null, last4: null });
      }
      return original(input, init);
    }),
  );
}

describe("eval cost", () => {
  it("formats the reported cost and sorts by it, cheapest first", () => {
    const priced = run("p", "openai/gpt-oss-120b", { ...aggregate(50, 0.5), totalCostUsd: 0.0123 });
    const cheap = run("c", "google/gemma-4-31b-it", { ...aggregate(50, 0.5), totalCostUsd: 0.002 });
    const unpriced = run("u", "gemma4:31b", aggregate(50, 0.5));
    expect(sortRuns([priced, unpriced, cheap], "totalCostUsd", "asc").map((r) => r.id)).toEqual([
      "c",
      "p",
      "u",
    ]);
    expect(formatUsd(0.0123)).toBe("$0.0123");
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(undefined)).toBe("–");
  });
});
