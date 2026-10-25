// Ollama native API adapter (https://docs.ollama.com/api): /api/chat, /api/tags, /api/show.
import type { ModelCapabilities, ModelSummary } from "@english-course/shared";
import { type CompleteFn, runChatJson } from "./chat-json.ts";
import { errorFromStatus, isLlmError, LlmError } from "./errors.ts";
import type {
  ChatCompletion,
  ChatDelta,
  ChatMessage,
  ChatRequest,
  GenerationOptions,
  LlmClient,
  ToolCall,
  Usage,
} from "./types.ts";

export const DEFAULT_OLLAMA_BASE_URL = "https://ollama.com";

export type OllamaClientOptions = {
  baseUrl?: string;
  /** Resolved on every call so a key change takes effect immediately. */
  getApiKey: () => Promise<string | undefined>;
  fetch?: typeof fetch;
  timeouts?: {
    /** Whole chat request incl. the stream (default 180 s). */
    chatMs?: number;
    /** /api/tags and /api/show (default 15 s). */
    metadataMs?: number;
  };
};

type WireToolCall = { function: { name: string; arguments?: Record<string, unknown> } };
type WireMessage = {
  role?: string;
  content?: string;
  thinking?: string;
  tool_calls?: WireToolCall[];
};
type WireChatChunk = {
  message?: WireMessage;
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  error?: string;
};

function toWireMessage(message: ChatMessage): Record<string, unknown> {
  switch (message.role) {
    case "assistant":
      return message.toolCalls?.length
        ? {
            role: "assistant",
            content: message.content,
            tool_calls: message.toolCalls.map((call) => ({
              function: { name: call.name, arguments: call.arguments },
            })),
          }
        : { role: "assistant", content: message.content };
    case "tool":
      return { role: "tool", tool_name: message.toolName, content: message.content };
    default:
      return { role: message.role, content: message.content };
  }
}

function toWireOptions(options: GenerationOptions): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    temperature: options.temperature,
    top_p: options.topP,
    seed: options.seed,
    num_ctx: options.numCtx,
    num_predict: options.numPredict,
  };
  return Object.fromEntries(Object.entries(wire).filter(([, value]) => value !== undefined));
}

function chatBody(
  req: ChatRequest & { format?: Record<string, unknown> },
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    stream,
    messages: req.messages.map(toWireMessage),
  };
  if (req.think !== undefined && req.think !== null) body.think = req.think;
  if (req.format) body.format = req.format;
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
  if (req.options) {
    const options = toWireOptions(req.options);
    if (Object.keys(options).length) body.options = options;
  }
  return body;
}

function toToolCalls(calls: WireToolCall[] | undefined): ToolCall[] {
  return (calls ?? []).map((call) => ({
    name: call.function.name,
    arguments: call.function.arguments ?? {},
  }));
}

function toUsage(chunk: WireChatChunk): Usage | undefined {
  const usage: Usage = {};
  if (chunk.prompt_eval_count !== undefined) usage.promptTokens = chunk.prompt_eval_count;
  if (chunk.eval_count !== undefined) usage.completionTokens = chunk.eval_count;
  if (chunk.total_duration !== undefined) {
    usage.durationMs = Math.round(chunk.total_duration / 1_000_000);
  }
  return Object.keys(usage).length ? usage : undefined;
}

async function readErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error.slice(0, 300) : undefined;
  } catch {
    return undefined;
  }
}

async function* ndjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<WireChatChunk> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield JSON.parse(line) as WireChatChunk;
        newline = buffer.indexOf("\n");
      }
    }
    const rest = buffer.trim();
    if (rest) yield JSON.parse(rest) as WireChatChunk;
  } finally {
    reader.releaseLock();
  }
}

export function createOllamaClient(opts: OllamaClientOptions): LlmClient {
  const baseUrl = (opts.baseUrl ?? DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
  const fetchFn = opts.fetch ?? fetch;
  const chatMs = opts.timeouts?.chatMs ?? 180_000;
  const metadataMs = opts.timeouts?.metadataMs ?? 15_000;

  /** Performs the request and maps every failure to an LlmError. */
  async function request(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal; timeoutMs: number },
  ): Promise<{ res: Response; signal: AbortSignal }> {
    const apiKey = await opts.getApiKey();
    if (!apiKey) throw new LlmError("not_configured", "No Ollama API key is configured");

    const timeout = AbortSignal.timeout(init.timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };
    if (init.body !== undefined) headers["content-type"] = "application/json";

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
      throw errorFromStatus(
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
        ? new LlmError("timeout", "Ollama request timed out", { cause: error })
        : new LlmError("aborted", "Ollama request was aborted", { cause: error });
    }
    if (error instanceof SyntaxError) {
      return new LlmError("upstream", "Ollama returned malformed data", { cause: error });
    }
    return new LlmError("network", "Could not reach Ollama", { cause: error });
  }

  const complete: CompleteFn = async (req) => {
    const { res, signal } = await request("/api/chat", {
      method: "POST",
      body: chatBody(req, false),
      signal: req.signal,
      timeoutMs: chatMs,
    });
    let chunk: WireChatChunk;
    try {
      chunk = (await res.json()) as WireChatChunk;
    } catch (error) {
      throw mapThrown(error, signal);
    }
    if (chunk.error) throw new LlmError("upstream", `Ollama error: ${chunk.error}`);
    const result: ChatCompletion = {
      content: chunk.message?.content ?? "",
      toolCalls: toToolCalls(chunk.message?.tool_calls),
      doneReason: chunk.done_reason,
      usage: toUsage(chunk),
    };
    if (chunk.message?.thinking) result.thinking = chunk.message.thinking;
    return result;
  };

  async function* chat(req: ChatRequest): AsyncGenerator<ChatDelta> {
    const { res, signal } = await request("/api/chat", {
      method: "POST",
      body: chatBody(req, true),
      signal: req.signal,
      timeoutMs: chatMs,
    });
    if (!res.body) throw new LlmError("upstream", "Ollama returned an empty stream");
    try {
      for await (const chunk of ndjsonLines(res.body)) {
        if (chunk.error) throw new LlmError("upstream", `Ollama error: ${chunk.error}`);
        const message = chunk.message;
        if (message?.thinking) yield { type: "thinking", text: message.thinking };
        if (message?.content) yield { type: "content", text: message.content };
        for (const call of toToolCalls(message?.tool_calls)) yield { type: "tool_call", call };
        if (chunk.done) {
          const done: ChatDelta = { type: "done" };
          if (chunk.done_reason) done.doneReason = chunk.done_reason;
          const usage = toUsage(chunk);
          if (usage) done.usage = usage;
          yield done;
          return;
        }
      }
    } catch (error) {
      throw mapThrown(error, signal);
    }
  }

  return {
    chat,
    chatJson: (req, schema) => runChatJson(complete, req, schema),

    async listModels(options) {
      const { res, signal } = await request("/api/tags", {
        method: "GET",
        signal: options?.signal,
        timeoutMs: metadataMs,
      });
      try {
        const body = (await res.json()) as {
          models?: Array<{ name: string; modified_at?: string; size?: number }>;
        };
        return (body.models ?? []).map((model) => {
          const summary: ModelSummary = { name: model.name };
          if (model.modified_at) summary.modifiedAt = model.modified_at;
          if (typeof model.size === "number") summary.size = model.size;
          return summary;
        });
      } catch (error) {
        throw mapThrown(error, signal);
      }
    },

    async modelCapabilities(model, options) {
      const { res, signal } = await request("/api/show", {
        method: "POST",
        body: { model },
        signal: options?.signal,
        timeoutMs: metadataMs,
      });
      try {
        const body = (await res.json()) as {
          capabilities?: string[];
          thinking?: { values?: Array<boolean | string>; default?: boolean | string };
        };
        const thinking = body.thinking;
        const result: ModelCapabilities = {
          model,
          capabilities: body.capabilities ?? [],
          thinking:
            thinking && Array.isArray(thinking.values) && thinking.default !== undefined
              ? { values: thinking.values, default: thinking.default }
              : null,
        };
        return result;
      } catch (error) {
        throw mapThrown(error, signal);
      }
    },
  };
}
