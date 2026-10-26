// OpenRouter adapter (https://openrouter.ai/docs): OpenAI-style /chat/completions with SSE
// streaming, /models (pricing + supported parameters) and /key.
import type { ModelCapabilities, ModelSummary, ThinkingControls } from "@english-course/shared";
import { type CompleteFn, runChatJson } from "./chat-json.ts";
import { errorFromStatus, isLlmError, LlmError } from "./errors.ts";
import type {
  ChatCompletion,
  ChatDelta,
  ChatMessage,
  ChatRequest,
  LlmClient,
  ThinkValue,
  ToolCall,
  Usage,
} from "./types.ts";

const APP_TITLE = "English Course";

export type OpenRouterClientOptions = {
  /** OpenRouter API base URL (the configured `OPENROUTER_BASE_URL`). */
  baseUrl: string;
  /** Resolved on every call so a key change takes effect immediately. */
  getApiKey: () => Promise<string | undefined>;
  /** Public app URL sent as `HTTP-Referer` (with the app title) for attribution; omitted when unset. */
  appUrl?: string;
  fetch?: typeof fetch;
  timeouts?: { chatMs?: number; metadataMs?: number };
  /** How long the model catalog is reused (default 10 min). */
  catalogTtlMs?: number;
  now?: () => number;
};

type WireToolCallDelta = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};
type WireMessage = {
  content?: string | null;
  reasoning?: string | null;
  reasoning_details?: Array<{ type?: string; text?: string; summary?: string }>;
  tool_calls?: WireToolCallDelta[];
};
type WireUsage = { prompt_tokens?: number; completion_tokens?: number; cost?: number };
type WireChunk = {
  choices?: Array<{ delta?: WireMessage; message?: WireMessage; finish_reason?: string | null }>;
  usage?: WireUsage;
  error?: { code?: number | string; message?: string };
};
type WireModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  reasoning?: {
    mandatory?: boolean;
    default_enabled?: boolean;
    default_effort?: string;
    supported_efforts?: string[] | null;
  };
};

/**
 * OpenAI-format messages. Tool results need the id of the call they answer: when our history has
 * none (Ollama-era turns), ids are synthesized and tool messages are paired with the pending
 * calls of the previous assistant message by name, in order.
 */
function toWireMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  let counter = 0;
  let pending: Array<{ id: string; name: string }> = [];
  return messages.map((message) => {
    if (message.role === "assistant") {
      if (!message.toolCalls?.length) return { role: "assistant", content: message.content };
      pending = message.toolCalls.map((call) => ({
        id: call.id ?? `call_${counter++}`,
        name: call.name,
      }));
      return {
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((call, i) => ({
          id: pending[i]?.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
    }
    if (message.role === "tool") {
      const at = message.toolCallId
        ? pending.findIndex((p) => p.id === message.toolCallId)
        : pending.findIndex((p) => p.name === message.toolName);
      const id = message.toolCallId ?? pending[at]?.id ?? `call_${counter++}`;
      if (at >= 0) pending.splice(at, 1);
      return { role: "tool", tool_call_id: id, content: message.content };
    }
    return { role: message.role, content: message.content };
  });
}

/** Our think setting → OpenRouter `reasoning`: levels map to `effort`, off to `effort: "none"`. */
function reasoningFor(think: ThinkValue | undefined): Record<string, unknown> | undefined {
  if (think === undefined || think === null) return undefined;
  if (think === true) return { enabled: true };
  if (think === false) return { effort: "none" };
  return { effort: think };
}

type JsonMode = "schema" | "object" | "prompt";

function chatBody(
  req: ChatRequest & { format?: Record<string, unknown> },
  stream: boolean,
  mode: JsonMode = "schema",
): Record<string, unknown> {
  let messages = toWireMessages(req.messages);
  const body: Record<string, unknown> = { model: req.model, stream };
  const reasoning = reasoningFor(req.think);
  if (reasoning) body.reasoning = reasoning;
  const o = req.options;
  if (o?.temperature !== undefined) body.temperature = o.temperature;
  if (o?.topP !== undefined) body.top_p = o.topP;
  if (o?.seed !== undefined) body.seed = o.seed;
  if (o?.numPredict !== undefined) body.max_tokens = o.numPredict;
  if (req.format) {
    if (mode === "schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "response", strict: true, schema: req.format },
      };
      // Only route to endpoints that honor response_format.
      body.provider = { require_parameters: true };
    } else {
      if (mode === "object") body.response_format = { type: "json_object" };
      messages = [
        ...messages,
        {
          role: "system",
          content: `Reply with only a JSON object matching this JSON schema:\n${JSON.stringify(req.format)}`,
        },
      ];
    }
  }
  body.messages = messages;
  if (req.tools?.length) {
    body.tools = req.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        parameters: tool.parameters,
      },
    }));
  }
  return body;
}

function toUsage(usage: WireUsage | undefined): Usage | undefined {
  if (!usage) return undefined;
  const result: Usage = {};
  if (typeof usage.prompt_tokens === "number") result.promptTokens = usage.prompt_tokens;
  if (typeof usage.completion_tokens === "number")
    result.completionTokens = usage.completion_tokens;
  if (typeof usage.cost === "number") result.costUsd = usage.cost;
  return Object.keys(result).length ? result : undefined;
}

function reasoningText(message: WireMessage | undefined): string {
  if (!message) return "";
  if (message.reasoning) return message.reasoning;
  return (message.reasoning_details ?? [])
    .map((detail) => detail.text ?? detail.summary ?? "")
    .join("");
}

function parseArguments(raw: string | undefined, name: string): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // reported below
  }
  throw new LlmError("invalid_output", `OpenRouter returned malformed arguments for tool ${name}`);
}

/** USD per token (string) → USD per 1M tokens; variable (negative) or missing prices → undefined. */
function perMillion(price: string | undefined): number | undefined {
  const value = price === undefined ? Number.NaN : Number(price);
  return Number.isFinite(value) && value >= 0 ? Number((value * 1e6).toPrecision(6)) : undefined;
}

function thinkingOf(model: WireModel): ThinkingControls | null {
  const reasoning = model.reasoning;
  if (!model.supported_parameters?.includes("reasoning")) return null;
  const mandatory = reasoning?.mandatory === true;
  const efforts = reasoning?.supported_efforts?.filter((e) => e !== "none") ?? [];
  if (efforts.length > 0) {
    const values = mandatory ? efforts : ["none", ...efforts];
    const enabled = mandatory || reasoning?.default_enabled !== false;
    const fallback = efforts.includes("medium") ? "medium" : (efforts[0] as string);
    return { values, default: enabled ? (reasoning?.default_effort ?? fallback) : "none" };
  }
  return mandatory
    ? { values: [true], default: true }
    : { values: [true, false], default: reasoning?.default_enabled === true };
}

/** Reads SSE `data:` payloads; comment lines (`:`) and other fields are ignored. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let drained = false;
  const payload = (line: string) => (line.startsWith("data:") ? line.slice(5).trim() : undefined);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        drained = true;
        break;
      }
      buffer += value;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const data = payload(buffer.slice(0, newline).trim());
        buffer = buffer.slice(newline + 1);
        if (data) yield data;
        newline = buffer.indexOf("\n");
      }
    }
    const data = payload(buffer.trim());
    if (data) yield data;
  } finally {
    // Stopped early (break, error, [DONE]): cancel so the upstream connection is freed.
    if (!drained) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function readErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    const message = body.error?.message;
    return typeof message === "string" ? message.slice(0, 300) : undefined;
  } catch {
    return undefined;
  }
}

function isStrictSchemaRejection(error: unknown): boolean {
  return (
    isLlmError(error) &&
    error.code === "bad_request" &&
    error.status === 400 &&
    /schema|response_format|structured/i.test(error.message)
  );
}

function errorFromResponse(status: number, message?: string, retryAfter?: string | null) {
  const detail = message ? `: ${message}` : "";
  if (status === 402) {
    return new LlmError("payment_required", `OpenRouter: insufficient credits${detail}`, {
      status,
      retryAfterSeconds: retryAfter ? Number.parseInt(retryAfter, 10) || undefined : undefined,
    });
  }
  // 403 is a moderation/guardrail block on OpenRouter, not a bad key.
  if (status === 403) {
    return new LlmError("bad_request", `OpenRouter refused the request${detail}`, { status });
  }
  if (status === 408) return new LlmError("timeout", "OpenRouter request timed out", { status });
  return errorFromStatus(status, message, retryAfter, "OpenRouter");
}

const chunkError = (chunk: WireChunk) =>
  new LlmError("upstream", `OpenRouter error: ${chunk.error?.message ?? "unknown"}`);

export function createOpenRouterClient(opts: OpenRouterClientOptions): LlmClient {
  const baseUrl = opts.baseUrl.replace(/\/+$/, "");
  const fetchFn = opts.fetch ?? fetch;
  const chatMs = opts.timeouts?.chatMs ?? 180_000;
  const metadataMs = opts.timeouts?.metadataMs ?? 15_000;
  const catalogTtlMs = opts.catalogTtlMs ?? 10 * 60_000;
  const now = opts.now ?? Date.now;
  let catalog: { at: number; models: Promise<WireModel[]> } | undefined;
  /** Models whose endpoints rejected a strict json_schema request: use the fallback for them. */
  const strictRejected = new Set<string>();

  async function request(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal; timeoutMs: number },
  ): Promise<{ res: Response; signal: AbortSignal }> {
    const apiKey = await opts.getApiKey();
    if (!apiKey) throw new LlmError("not_configured", "No OpenRouter API key is configured");

    const timeout = AbortSignal.timeout(init.timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (opts.appUrl) {
      headers["http-referer"] = opts.appUrl;
      headers["x-openrouter-title"] = APP_TITLE;
    }
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal,
      });
    } catch (error) {
      throw mapThrown(error, signal);
    }
    if (!res.ok) {
      throw errorFromResponse(
        res.status,
        await readErrorMessage(res),
        res.headers.get("retry-after"),
      );
    }
    return { res, signal };
  }

  function mapThrown(error: unknown, signal: AbortSignal): LlmError {
    if (isLlmError(error)) return error;
    if (signal.aborted) {
      const reason = signal.reason as { name?: string } | undefined;
      return reason?.name === "TimeoutError"
        ? new LlmError("timeout", "OpenRouter request timed out", { cause: error })
        : new LlmError("aborted", "OpenRouter request was aborted", { cause: error });
    }
    if (error instanceof SyntaxError) {
      return new LlmError("upstream", "OpenRouter returned malformed data", { cause: error });
    }
    return new LlmError("network", "Could not reach OpenRouter", { cause: error });
  }

  async function readJson<T>(res: Response, signal: AbortSignal): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch (error) {
      throw mapThrown(error, signal);
    }
  }

  function models(signal?: AbortSignal): Promise<WireModel[]> {
    if (catalog && now() - catalog.at < catalogTtlMs) return catalog.models;
    const entry = {
      at: now(),
      models: (async () => {
        const { res, signal: s } = await request("/models", {
          method: "GET",
          signal,
          timeoutMs: metadataMs,
        });
        return (await readJson<{ data?: WireModel[] }>(res, s)).data ?? [];
      })(),
    };
    catalog = entry;
    // A failed fetch is not cached.
    entry.models.catch(() => {
      if (catalog === entry) catalog = undefined;
    });
    return entry.models;
  }

  async function jsonModeFor(model: string): Promise<JsonMode> {
    if (strictRejected.has(model)) return "object";
    let params: string[] | undefined;
    try {
      params = (await models()).find((m) => m.id === model)?.supported_parameters;
    } catch {
      return "schema"; // catalog unavailable: try the strict path
    }
    if (!params || params.includes("structured_outputs")) return "schema";
    return params.includes("response_format") ? "object" : "prompt";
  }

  async function completeWith(
    req: Parameters<CompleteFn>[0],
    mode: JsonMode,
  ): Promise<ChatCompletion> {
    const { res, signal } = await request("/chat/completions", {
      method: "POST",
      body: chatBody(req, false, mode),
      signal: req.signal,
      timeoutMs: chatMs,
    });
    const chunk = await readJson<WireChunk>(res, signal);
    const choice = chunk.choices?.[0];
    if (chunk.error || !choice || choice.finish_reason === "error") throw chunkError(chunk);
    const message = choice.message;
    const result: ChatCompletion = {
      content: message?.content ?? "",
      toolCalls: (message?.tool_calls ?? []).map((call) => ({
        ...(call.id ? { id: call.id } : {}),
        name: call.function?.name ?? "",
        arguments: parseArguments(call.function?.arguments, call.function?.name ?? ""),
      })),
    };
    if (choice.finish_reason) result.doneReason = choice.finish_reason;
    const usage = toUsage(chunk.usage);
    if (usage) result.usage = usage;
    const thinking = reasoningText(message);
    if (thinking) result.thinking = thinking;
    return result;
  }

  const complete: CompleteFn = async (req) => {
    const mode = req.format ? await jsonModeFor(req.model) : "prompt";
    try {
      return await completeWith(req, mode);
    } catch (error) {
      // Strict schemas are rejected by some endpoints (e.g. optional fields): fall back. Only a
      // 400 that names the schema counts; moderation (403) and other 400s are real failures.
      if (mode !== "schema" || !isStrictSchemaRejection(error)) throw error;
      strictRejected.add(req.model);
      return completeWith(req, "object");
    }
  };

  async function* chat(req: ChatRequest): AsyncGenerator<ChatDelta> {
    const { res, signal } = await request("/chat/completions", {
      method: "POST",
      body: chatBody(req, true),
      signal: req.signal,
      timeoutMs: chatMs,
    });
    if (!res.body) throw new LlmError("upstream", "OpenRouter returned an empty stream");
    const calls = new Map<number, { id?: string; name: string; args: string }>();
    let finishReason: string | undefined;
    let usage: Usage | undefined;
    try {
      for await (const data of sseData(res.body)) {
        if (data === "[DONE]") break;
        const chunk = JSON.parse(data) as WireChunk;
        if (chunk.error) throw chunkError(chunk);
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        const thinking = reasoningText(delta);
        if (thinking) yield { type: "thinking", text: thinking };
        if (delta?.content) yield { type: "content", text: delta.content };
        for (const piece of delta?.tool_calls ?? []) {
          const index = piece.index ?? 0;
          const call = calls.get(index) ?? { name: "", args: "" };
          if (piece.id) call.id = piece.id;
          if (piece.function?.name) call.name += piece.function.name;
          if (piece.function?.arguments) call.args += piece.function.arguments;
          calls.set(index, call);
        }
        if (choice?.finish_reason === "error") throw chunkError(chunk);
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        usage = toUsage(chunk.usage) ?? usage;
      }
      if (!finishReason)
        throw new LlmError("upstream", "OpenRouter stream ended before completion");
      for (const [, call] of [...calls].sort(([a], [b]) => a - b)) {
        const toolCall: ToolCall = {
          name: call.name,
          arguments: parseArguments(call.args, call.name),
        };
        yield { type: "tool_call", call: call.id ? { id: call.id, ...toolCall } : toolCall };
      }
      const done: ChatDelta = { type: "done", doneReason: finishReason };
      if (usage) done.usage = usage;
      yield done;
    } catch (error) {
      throw mapThrown(error, signal);
    }
  }

  return {
    chat,
    chatJson: (req, schema) => runChatJson(complete, req, schema),

    async listModels(options) {
      return (await models(options?.signal)).map((model) => {
        const summary: ModelSummary = { name: model.id };
        if (model.name) summary.displayName = model.name;
        if (typeof model.context_length === "number") summary.contextLength = model.context_length;
        const input = perMillion(model.pricing?.prompt);
        const output = perMillion(model.pricing?.completion);
        if (input !== undefined && output !== undefined) {
          summary.pricing = { inputPerMTok: input, outputPerMTok: output };
        }
        return summary;
      });
    },

    async modelCapabilities(model, options) {
      const found = (await models(options?.signal)).find((m) => m.id === model);
      if (!found)
        throw new LlmError("not_found", `Model "${model}" was not found`, { status: 404 });
      const params = found.supported_parameters ?? [];
      const capabilities = ["completion"];
      if (params.includes("tools")) capabilities.push("tools");
      if (params.includes("reasoning")) capabilities.push("thinking");
      if (params.includes("structured_outputs")) capabilities.push("structured_outputs");
      const result: ModelCapabilities = { model, capabilities, thinking: thinkingOf(found) };
      return result;
    },

    async verifyKey(options) {
      const { res, signal } = await request("/key", {
        method: "GET",
        signal: options?.signal,
        timeoutMs: metadataMs,
      });
      await readJson<unknown>(res, signal);
    },
  };
}
