import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createOpenRouterClient } from "./openrouter.ts";
import type { ChatDelta } from "./types.ts";

type Captured = { url: string; init: RequestInit; body: Record<string, unknown> };

function mockFetch(...responses: Array<Response | (() => Response) | Error>) {
  const calls: Captured[] = [];
  const queue = [...responses];
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ url: String(input), init: init ?? {}, body });
    const next = queue.shift();
    if (!next) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next;
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

/** SSE body from raw lines, split mid-line to exercise reassembly. */
function sse(...lines: string[]): Response {
  const encoder = new TextEncoder();
  const text = `${lines.join("\n")}\n`;
  const cut = Math.floor(text.length / 2);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text.slice(0, cut)));
      controller.enqueue(encoder.encode(text.slice(cut)));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream" } });
}

const data = (chunk: unknown) => `data: ${JSON.stringify(chunk)}\n`;
const delta = (d: Record<string, unknown>, finish: string | null = null) =>
  data({ choices: [{ index: 0, delta: d, finish_reason: finish }] });

const MODELS = {
  data: [
    {
      id: "openai/gpt-oss-120b",
      name: "OpenAI: gpt-oss-120b",
      context_length: 131072,
      pricing: { prompt: "0.00000015", completion: "0.0000006" },
      supported_parameters: ["reasoning", "response_format", "structured_outputs", "tools"],
      reasoning: {
        mandatory: true,
        supported_efforts: ["high", "medium", "low"],
        default_effort: "medium",
      },
    },
    {
      id: "google/gemma-4-31b-it",
      name: "Google: Gemma 4 31B",
      context_length: 262144,
      pricing: { prompt: "0.0000002", completion: "0.0000004" },
      supported_parameters: ["reasoning", "response_format", "tools"],
      reasoning: { mandatory: false, default_enabled: false },
    },
    {
      id: "plain/model",
      name: "Plain",
      context_length: 8192,
      pricing: { prompt: "-1", completion: "-1" },
      supported_parameters: ["temperature"],
    },
  ],
};

const client = (fetchFn: typeof fetch, extra: { apiKey?: string; appUrl?: string } = {}) =>
  createOpenRouterClient({
    baseUrl: "https://openrouter.example/api/v1/",
    getApiKey: async () => ("apiKey" in extra ? extra.apiKey : "sk-or-test-1234"),
    fetch: fetchFn,
    appUrl: extra.appUrl,
  });

async function collect(iter: AsyncIterable<ChatDelta>): Promise<ChatDelta[]> {
  const out: ChatDelta[] = [];
  for await (const d of iter) out.push(d);
  return out;
}

const completion = (content: string, usage: Record<string, unknown> = {}) =>
  Response.json({
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001, ...usage },
  });

describe("openrouter adapter: chat (streaming)", () => {
  it("sends the OpenAI request shape with auth, attribution, reasoning, tools and ids", async () => {
    const { fetchFn, calls } = mockFetch(sse(delta({}, "stop"), "data: [DONE]"));
    await collect(
      client(fetchFn, { appUrl: "https://english.example" }).chat({
        model: "openai/gpt-oss-120b",
        think: "high",
        options: { temperature: 0.2, numPredict: 100 },
        messages: [
          { role: "system", content: "sys" },
          {
            role: "assistant",
            content: "",
            toolCalls: [{ name: "add_doubt", arguments: { text: "x" } }],
          },
          { role: "tool", toolName: "add_doubt", content: "ok" },
        ],
        tools: [{ name: "add_doubt", description: "Adds", parameters: { type: "object" } }],
      }),
    );

    const [call] = calls;
    expect(call?.url).toBe("https://openrouter.example/api/v1/chat/completions");
    const headers = call?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-or-test-1234");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["http-referer"]).toBe("https://english.example");
    expect(headers["x-openrouter-title"]).toBe("English Course");
    expect(call?.body).toEqual({
      model: "openai/gpt-oss-120b",
      stream: true,
      reasoning: { effort: "high" },
      temperature: 0.2,
      max_tokens: 100,
      messages: [
        { role: "system", content: "sys" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_0",
              type: "function",
              function: { name: "add_doubt", arguments: '{"text":"x"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_0", content: "ok" },
      ],
      tools: [
        {
          type: "function",
          function: { name: "add_doubt", description: "Adds", parameters: { type: "object" } },
        },
      ],
    });
  });

  it("maps think: false to effort none, true to enabled, null to nothing, and omits attribution", async () => {
    const { fetchFn, calls } = mockFetch(
      sse(delta({}, "stop"), "data: [DONE]"),
      sse(delta({}, "stop"), "data: [DONE]"),
      sse(delta({}, "stop"), "data: [DONE]"),
    );
    const c = client(fetchFn);
    await collect(c.chat({ model: "m", think: false, messages: [] }));
    await collect(c.chat({ model: "m", think: true, messages: [] }));
    await collect(c.chat({ model: "m", think: null, messages: [] }));
    expect(calls[0]?.body.reasoning).toEqual({ effort: "none" });
    expect(calls[1]?.body.reasoning).toEqual({ enabled: true });
    expect(calls[2]?.body).not.toHaveProperty("reasoning");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("http-referer");
  });

  it("parses SSE: comments, reasoning, content chunks, streamed tool calls and final usage", async () => {
    const { fetchFn } = mockFetch(
      sse(
        ": OPENROUTER PROCESSING",
        "",
        delta({ role: "assistant", reasoning: "think " }),
        delta({ reasoning_details: [{ type: "reasoning.text", text: "more" }] }),
        delta({ content: "Hel" }),
        delta({ content: "lo" }),
        delta({
          tool_calls: [
            {
              index: 0,
              id: "call_a",
              type: "function",
              function: { name: "add_doubt", arguments: '{"te' },
            },
          ],
        }),
        delta({
          tool_calls: [{ index: 1, id: "call_b", function: { name: "lookup", arguments: "{}" } }],
        }),
        delta({ tool_calls: [{ index: 0, function: { arguments: 'xt":"x"}' } }] }),
        delta({}, "tool_calls"),
        data({
          choices: [],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 7,
            total_tokens: 19,
            completion_tokens_details: { reasoning_tokens: 3 },
            cost: 0.00042,
          },
        }),
        "data: [DONE]",
      ),
    );
    const deltas = await collect(client(fetchFn).chat({ model: "m", messages: [] }));
    expect(deltas).toEqual([
      { type: "thinking", text: "think " },
      { type: "thinking", text: "more" },
      { type: "content", text: "Hel" },
      { type: "content", text: "lo" },
      { type: "tool_call", call: { id: "call_a", name: "add_doubt", arguments: { text: "x" } } },
      { type: "tool_call", call: { id: "call_b", name: "lookup", arguments: {} } },
      {
        type: "done",
        doneReason: "tool_calls",
        usage: { promptTokens: 12, completionTokens: 7, costUsd: 0.00042 },
      },
    ]);
  });

  it("throws an upstream error for a mid-stream error event", async () => {
    const { fetchFn } = mockFetch(
      sse(
        delta({ content: "partial" }),
        data({
          error: { code: 502, message: "provider died" },
          choices: [{ index: 0, delta: {}, finish_reason: "error" }],
        }),
      ),
    );
    await expect(collect(client(fetchFn).chat({ model: "m", messages: [] }))).rejects.toMatchObject(
      {
        code: "upstream",
        message: expect.stringContaining("provider died"),
      },
    );
  });

  it("throws an upstream error when the stream ends without a finish reason", async () => {
    const { fetchFn } = mockFetch(sse(delta({ content: "partial" })));
    await expect(collect(client(fetchFn).chat({ model: "m", messages: [] }))).rejects.toMatchObject(
      {
        code: "upstream",
      },
    );
  });
});

describe("openrouter adapter: error mapping", () => {
  const failing = (status: number, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify({ error: { code: status, message: "upstream says no" } }), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });

  it.each([
    [401, "invalid_key"],
    [402, "payment_required"],
    [403, "bad_request"],
    [400, "bad_request"],
    [500, "upstream"],
    [503, "upstream"],
  ])("maps HTTP %i to %s", async (status, code) => {
    const { fetchFn } = mockFetch(failing(status));
    await expect(collect(client(fetchFn).chat({ model: "m", messages: [] }))).rejects.toMatchObject(
      {
        code,
        status,
      },
    );
  });

  it("reads Retry-After on 429", async () => {
    const { fetchFn } = mockFetch(failing(429, { "retry-after": "7" }));
    await expect(collect(client(fetchFn).chat({ model: "m", messages: [] }))).rejects.toMatchObject(
      {
        code: "rate_limited",
        retryAfterSeconds: 7,
      },
    );
  });

  it("fails with not_configured and never calls fetch without a key", async () => {
    const { fetchFn, calls } = mockFetch();
    await expect(client(fetchFn, { apiKey: undefined }).listModels()).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(calls).toHaveLength(0);
  });

  it("never puts the API key in error messages", async () => {
    const { fetchFn } = mockFetch(failing(401));
    const error = await client(fetchFn)
      .listModels()
      .catch((e: Error) => e);
    expect(String((error as Error).message)).not.toContain("sk-or-test-1234");
  });
});

describe("openrouter adapter: models", () => {
  it("lists models with display name, context length and price per 1M tokens", async () => {
    const { fetchFn, calls } = mockFetch(Response.json(MODELS));
    const models = await client(fetchFn).listModels();
    expect(calls[0]?.url).toBe("https://openrouter.example/api/v1/models");
    expect(models[0]).toEqual({
      name: "openai/gpt-oss-120b",
      displayName: "OpenAI: gpt-oss-120b",
      contextLength: 131072,
      pricing: { inputPerMTok: 0.15, outputPerMTok: 0.6 },
    });
    // Variable (negative) pricing is not shown.
    expect(models[2]).toEqual({ name: "plain/model", displayName: "Plain", contextLength: 8192 });
  });

  it("derives capabilities and effort values from supported_parameters and reasoning", async () => {
    const { fetchFn, calls } = mockFetch(Response.json(MODELS));
    const c = client(fetchFn);
    expect(await c.modelCapabilities("openai/gpt-oss-120b")).toEqual({
      model: "openai/gpt-oss-120b",
      capabilities: ["completion", "tools", "thinking", "structured_outputs"],
      thinking: { values: ["high", "medium", "low"], default: "medium" },
    });
    expect((await c.modelCapabilities("google/gemma-4-31b-it")).thinking).toEqual({
      values: [true, false],
      default: false,
    });
    expect((await c.modelCapabilities("plain/model")).thinking).toBeNull();
    await expect(c.modelCapabilities("missing/model")).rejects.toMatchObject({ code: "not_found" });
    // The catalog is fetched once and reused.
    expect(calls).toHaveLength(1);
  });

  it("adds none to the efforts of a model whose reasoning is optional", async () => {
    const { fetchFn } = mockFetch(
      Response.json({
        data: [
          {
            id: "a/b",
            name: "AB",
            context_length: 1,
            pricing: { prompt: "0", completion: "0" },
            supported_parameters: ["reasoning"],
            reasoning: {
              mandatory: false,
              supported_efforts: ["high", "low"],
              default_enabled: false,
            },
          },
        ],
      }),
    );
    expect((await client(fetchFn).modelCapabilities("a/b")).thinking).toEqual({
      values: ["none", "high", "low"],
      default: "none",
    });
  });

  it("verifies the key with GET /key", async () => {
    const { fetchFn, calls } = mockFetch(Response.json({ data: { label: "x" } }));
    await client(fetchFn).verifyKey?.();
    expect(calls[0]?.url).toBe("https://openrouter.example/api/v1/key");
  });
});

describe("openrouter adapter: chatJson", () => {
  const schema = z.object({ answer: z.string() });

  it("uses strict json_schema with require_parameters when the model supports structured outputs", async () => {
    const { fetchFn, calls } = mockFetch(Response.json(MODELS), completion('{"answer":"yes"}'));
    const result = await client(fetchFn).chatJson(
      { model: "openai/gpt-oss-120b", think: "low", messages: [{ role: "user", content: "q" }] },
      schema,
    );
    expect(result).toEqual({
      data: { answer: "yes" },
      attempts: 1,
      usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.0001 },
    });
    const body = calls[1]?.body ?? {};
    expect(body.stream).toBe(false);
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "response", strict: true, schema: { type: "object" } },
    });
  });

  it("falls back to json_object plus the schema in a system message", async () => {
    const { fetchFn, calls } = mockFetch(Response.json(MODELS), completion('{"answer":"ok"}'));
    await client(fetchFn).chatJson(
      { model: "google/gemma-4-31b-it", messages: [{ role: "user", content: "q" }] },
      schema,
    );
    const body = calls[1]?.body ?? {};
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body).not.toHaveProperty("provider");
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages.at(-1)?.role).toBe("system");
    expect(messages.at(-1)?.content).toContain('"answer"');
  });

  it("uses a plain prompt when the model has no response_format", async () => {
    const { fetchFn, calls } = mockFetch(Response.json(MODELS), completion('{"answer":"ok"}'));
    await client(fetchFn).chatJson({ model: "plain/model", messages: [] }, schema);
    expect(calls[1]?.body).not.toHaveProperty("response_format");
  });

  it("retries once with the validation error, then throws invalid_output", async () => {
    const { fetchFn, calls } = mockFetch(
      Response.json(MODELS),
      completion('{"wrong":1}'),
      completion("not json"),
    );
    await expect(
      client(fetchFn).chatJson({ model: "openai/gpt-oss-120b", messages: [] }, schema),
    ).rejects.toMatchObject({ code: "invalid_output" });
    expect(calls).toHaveLength(3);
    const retry = calls[2]?.body.messages as Array<{ role: string; content: string }>;
    expect(retry.at(-1)?.content).toContain("did not match the required JSON schema");
  });

  it("falls back to json_object when the endpoint rejects the strict schema", async () => {
    const { fetchFn, calls } = mockFetch(
      Response.json(MODELS),
      new Response(JSON.stringify({ error: { code: 400, message: "invalid schema" } }), {
        status: 400,
      }),
      completion('{"answer":"ok"}'),
      completion('{"answer":"again"}'),
    );
    const c = client(fetchFn);
    const req = { model: "openai/gpt-oss-120b", messages: [] };
    expect((await c.chatJson(req, schema)).data).toEqual({ answer: "ok" });
    expect(calls[2]?.body.response_format).toEqual({ type: "json_object" });
    // Remembered: the next call skips the strict attempt.
    expect((await c.chatJson(req, schema)).data).toEqual({ answer: "again" });
    expect(calls).toHaveLength(4);
  });

  it("throws upstream for a 200 body that carries an error object", async () => {
    const { fetchFn } = mockFetch(
      Response.json(MODELS),
      Response.json({ error: { code: 502, message: "boom" } }),
    );
    await expect(
      client(fetchFn).chatJson({ model: "openai/gpt-oss-120b", messages: [] }, schema),
    ).rejects.toMatchObject({ code: "upstream" });
  });
});
