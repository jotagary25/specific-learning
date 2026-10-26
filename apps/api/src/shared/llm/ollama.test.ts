import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmError } from "./errors.ts";
import { createOllamaClient } from "./ollama.ts";
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

function ndjson(...lines: unknown[]): Response {
  const encoder = new TextEncoder();
  const text = lines.map((line) => JSON.stringify(line)).join("\n");
  // Split mid-line to exercise chunk reassembly.
  const cut = Math.floor(text.length / 2);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text.slice(0, cut)));
      controller.enqueue(encoder.encode(`${text.slice(cut)}\n`));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
}

const chatReply = (content: string) =>
  Response.json({
    model: "m",
    message: { role: "assistant", content, thinking: "secret reasoning" },
    done: true,
    done_reason: "stop",
    prompt_eval_count: 10,
    eval_count: 5,
    total_duration: 2_000_000,
  });

const client = (fetchFn: typeof fetch, extra: { apiKey?: string } = {}) =>
  createOllamaClient({
    baseUrl: "https://ollama.example/",
    getApiKey: async () => ("apiKey" in extra ? extra.apiKey : "test-key-1234"),
    fetch: fetchFn,
  });

async function collect(iter: AsyncIterable<ChatDelta>): Promise<ChatDelta[]> {
  const out: ChatDelta[] = [];
  for await (const delta of iter) out.push(delta);
  return out;
}

describe("ollama adapter: chat (streaming)", () => {
  it("sends the native request shape with auth, think, tools and stream", async () => {
    const { fetchFn, calls } = mockFetch(
      ndjson({ message: { role: "assistant", content: "" }, done: true }),
    );

    await collect(
      client(fetchFn).chat({
        model: "gpt-oss:120b",
        think: "high",
        messages: [
          { role: "system", content: "sys" },
          {
            role: "assistant",
            content: "",
            toolCalls: [{ name: "add_doubt", arguments: { text: "x" } }],
          },
          { role: "tool", toolName: "add_doubt", content: "ok" },
        ],
        tools: [{ name: "add_doubt", description: "Save a doubt", parameters: { type: "object" } }],
        options: { temperature: 0.2, numCtx: 8192 },
      }),
    );

    const [call] = calls;
    expect(call?.url).toBe("https://ollama.example/api/chat");
    expect(call?.init.method).toBe("POST");
    expect(new Headers(call?.init.headers).get("authorization")).toBe("Bearer test-key-1234");
    expect(call?.body).toEqual({
      model: "gpt-oss:120b",
      stream: true,
      think: "high",
      messages: [
        { role: "system", content: "sys" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "add_doubt", arguments: { text: "x" } } }],
        },
        { role: "tool", tool_name: "add_doubt", content: "ok" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "add_doubt",
            description: "Save a doubt",
            parameters: { type: "object" },
          },
        },
      ],
      options: { temperature: 0.2, num_ctx: 8192 },
    });
  });

  it("omits think when it is null or undefined", async () => {
    const { fetchFn, calls } = mockFetch(ndjson({ done: true }));
    await collect(client(fetchFn).chat({ model: "m", think: null, messages: [] }));
    expect(calls[0]?.body).not.toHaveProperty("think");
  });

  it("parses NDJSON into thinking, content, tool call and done deltas", async () => {
    const { fetchFn } = mockFetch(
      ndjson(
        { message: { role: "assistant", content: "", thinking: "Let me" }, done: false },
        { message: { role: "assistant", content: "Hello" }, done: false },
        { message: { role: "assistant", content: " world" }, done: false },
        {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{ function: { index: 0, name: "get_progress_summary", arguments: {} } }],
          },
          done: false,
        },
        {
          message: { role: "assistant", content: "" },
          done: true,
          done_reason: "stop",
          eval_count: 3,
        },
      ),
    );

    const deltas = await collect(client(fetchFn).chat({ model: "m", messages: [] }));

    expect(deltas).toEqual([
      { type: "thinking", text: "Let me" },
      { type: "content", text: "Hello" },
      { type: "content", text: " world" },
      { type: "tool_call", call: { name: "get_progress_summary", arguments: {} } },
      { type: "done", doneReason: "stop", usage: { completionTokens: 3 } },
    ]);
  });

  it("throws an upstream error when the stream carries an error line", async () => {
    const { fetchFn } = mockFetch(
      ndjson({ message: { content: "Hi" }, done: false }, { error: "model crashed" }),
    );

    await expect(collect(client(fetchFn).chat({ model: "m", messages: [] }))).rejects.toMatchObject(
      {
        code: "upstream",
      },
    );
  });

  it("throws an upstream error when the stream ends without a done chunk", async () => {
    const { fetchFn } = mockFetch(ndjson({ message: { content: "Partial" }, done: false }));

    await expect(collect(client(fetchFn).chat({ model: "m", messages: [] }))).rejects.toMatchObject(
      { code: "upstream", message: expect.stringMatching(/ended before/) },
    );
  });

  it("cancels the response body when the consumer stops early", async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`${JSON.stringify({ message: { content: "a" } })}\n`));
      },
      // Never closes: only a cancel ends it.
      cancel,
    });
    const { fetchFn } = mockFetch(new Response(body));

    for await (const delta of client(fetchFn).chat({ model: "m", messages: [] })) {
      expect(delta).toEqual({ type: "content", text: "a" });
      break;
    }

    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });
});

describe("ollama adapter: error mapping", () => {
  const cases: Array<[number, string]> = [
    [401, "invalid_key"],
    [403, "invalid_key"],
    [429, "rate_limited"],
    [404, "not_found"],
    [400, "bad_request"],
    [500, "upstream"],
    [502, "upstream"],
  ];

  it.each(cases)("maps HTTP %i to %s", async (status, code) => {
    const { fetchFn } = mockFetch(Response.json({ error: "boom" }, { status }));
    await expect(client(fetchFn).listModels()).rejects.toMatchObject({ name: "LlmError", code });
  });

  it("reads Retry-After on 429", async () => {
    const { fetchFn } = mockFetch(
      Response.json({ error: "slow down" }, { status: 429, headers: { "retry-after": "30" } }),
    );
    await expect(client(fetchFn).listModels()).rejects.toMatchObject({ retryAfterSeconds: 30 });
  });

  it("maps network failures", async () => {
    const { fetchFn } = mockFetch(new TypeError("fetch failed"));
    await expect(client(fetchFn).listModels()).rejects.toMatchObject({ code: "network" });
  });

  it("fails with not_configured and never calls fetch without a key", async () => {
    const { fetchFn } = mockFetch();
    await expect(client(fetchFn, { apiKey: undefined }).listModels()).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("maps a caller abort to aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchFn = vi.fn(async (_input: unknown, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return Response.json({ models: [] });
    }) as unknown as typeof fetch;
    await expect(client(fetchFn).listModels({ signal: controller.signal })).rejects.toMatchObject({
      code: "aborted",
    });
  });

  it("maps its own timeout to timeout", async () => {
    const fetchFn = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    ) as unknown as typeof fetch;
    const slow = createOllamaClient({
      baseUrl: "https://ollama.example",
      getApiKey: async () => "k".repeat(10),
      fetch: fetchFn,
      timeouts: { metadataMs: 10 },
    });
    await expect(slow.listModels()).rejects.toMatchObject({ code: "timeout" });
  });

  it("never puts the API key in error messages", async () => {
    const { fetchFn } = mockFetch(Response.json({ error: "unauthorized" }, { status: 401 }));
    const error = await client(fetchFn)
      .listModels()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(JSON.stringify(error)).not.toContain("test-key-1234");
    expect((error as Error).message).not.toContain("test-key-1234");
  });
});

describe("ollama adapter: listModels + modelCapabilities", () => {
  it("lists models from /api/tags", async () => {
    const { fetchFn, calls } = mockFetch(
      Response.json({
        models: [
          {
            name: "gpt-oss:120b",
            model: "gpt-oss:120b",
            modified_at: "2026-10-01T00:00:00Z",
            size: 65,
          },
        ],
      }),
    );

    expect(await client(fetchFn).listModels()).toEqual([
      { name: "gpt-oss:120b", modifiedAt: "2026-10-01T00:00:00Z", size: 65 },
    ]);
    expect(calls[0]?.url).toBe("https://ollama.example/api/tags");
    expect(calls[0]?.init.method).toBe("GET");
  });

  it("reads capabilities and thinking controls from /api/show", async () => {
    const { fetchFn, calls } = mockFetch(
      Response.json({
        capabilities: ["completion", "tools", "thinking"],
        thinking: { values: ["low", "medium", "high"], default: "medium" },
        model_info: { huge: true },
      }),
    );

    expect(await client(fetchFn).modelCapabilities("gpt-oss:120b")).toEqual({
      model: "gpt-oss:120b",
      capabilities: ["completion", "tools", "thinking"],
      thinking: { values: ["low", "medium", "high"], default: "medium" },
    });
    expect(calls[0]?.url).toBe("https://ollama.example/api/show");
    expect(calls[0]?.body).toEqual({ model: "gpt-oss:120b" });
  });

  it("returns null thinking when the model has no thinking metadata", async () => {
    const { fetchFn } = mockFetch(Response.json({ capabilities: ["completion"] }));
    expect((await client(fetchFn).modelCapabilities("m")).thinking).toBeNull();
  });
});

describe("ollama adapter: chatJson", () => {
  const Answer = z.object({ correct: z.boolean(), feedback_es: z.string() });

  it("sends format with the JSON schema, stream false and the think value", async () => {
    const { fetchFn, calls } = mockFetch(chatReply('{"correct":true,"feedback_es":"Bien"}'));

    const result = await client(fetchFn).chatJson(
      { model: "m", think: "low", messages: [{ role: "user", content: "check" }] },
      Answer,
    );

    expect(result).toEqual({
      data: { correct: true, feedback_es: "Bien" },
      attempts: 1,
      usage: { promptTokens: 10, completionTokens: 5, durationMs: 2 },
    });
    const body = calls[0]?.body;
    expect(body?.stream).toBe(false);
    expect(body?.think).toBe("low");
    expect(body?.format).toMatchObject({
      type: "object",
      properties: { correct: { type: "boolean" }, feedback_es: { type: "string" } },
      required: ["correct", "feedback_es"],
    });
    expect(body?.format).not.toHaveProperty("$schema");
  });

  it("retries once with the validation error appended, then succeeds", async () => {
    const { fetchFn, calls } = mockFetch(
      chatReply('{"correct":"yes"}'),
      chatReply('{"correct":false,"feedback_es":"Casi"}'),
    );

    const result = await client(fetchFn).chatJson(
      { model: "m", messages: [{ role: "user", content: "check" }] },
      Answer,
    );

    expect(result.data).toEqual({ correct: false, feedback_es: "Casi" });
    expect(result.attempts).toBe(2);
    const retryMessages = calls[1]?.body.messages as Array<{ role: string; content: string }>;
    expect(retryMessages).toHaveLength(3);
    expect(retryMessages[1]).toEqual({ role: "assistant", content: '{"correct":"yes"}' });
    expect(retryMessages[2]?.role).toBe("user");
    expect(retryMessages[2]?.content).toMatch(/did not match the required JSON schema/);
    expect(retryMessages[2]?.content).toMatch(/feedback_es/);
  });

  it("retries on unparseable JSON and throws invalid_output after the retry", async () => {
    const { fetchFn, calls } = mockFetch(chatReply("not json"), chatReply("{still not"));

    const error = await client(fetchFn)
      .chatJson({ model: "m", messages: [{ role: "user", content: "check" }] }, Answer)
      .catch((e: unknown) => e);

    expect(calls).toHaveLength(2);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ code: "invalid_output" });
  });

  it("does not retry upstream errors", async () => {
    const { fetchFn, calls } = mockFetch(Response.json({ error: "x" }, { status: 503 }));
    await expect(
      client(fetchFn).chatJson({ model: "m", messages: [] }, Answer),
    ).rejects.toMatchObject({ code: "upstream" });
    expect(calls).toHaveLength(1);
  });
});
