export type LlmErrorCode =
  | "not_configured"
  | "invalid_key"
  | "rate_limited"
  | "not_found"
  | "bad_request"
  | "upstream"
  | "network"
  | "timeout"
  | "aborted"
  | "invalid_output";

/** Typed error raised by every LLM adapter. Messages never contain the API key. */
export class LlmError extends Error {
  override readonly name = "LlmError";
  readonly code: LlmErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  /** Validation issues for `invalid_output`. */
  readonly issues?: string;

  constructor(
    code: LlmErrorCode,
    message: string,
    extra: { status?: number; retryAfterSeconds?: number; issues?: string; cause?: unknown } = {},
  ) {
    super(message, extra.cause === undefined ? undefined : { cause: extra.cause });
    this.code = code;
    this.status = extra.status;
    this.retryAfterSeconds = extra.retryAfterSeconds;
    this.issues = extra.issues;
  }
}

export function isLlmError(error: unknown): error is LlmError {
  return error instanceof LlmError;
}

export function errorFromStatus(
  status: number,
  upstreamMessage: string | undefined,
  retryAfter?: string | null,
): LlmError {
  const detail = upstreamMessage ? `: ${upstreamMessage}` : "";
  if (status === 401 || status === 403) {
    return new LlmError("invalid_key", `Ollama rejected the API key (HTTP ${status})`, { status });
  }
  if (status === 429) {
    const seconds = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;
    return new LlmError("rate_limited", `Ollama rate limit reached${detail}`, {
      status,
      retryAfterSeconds: Number.isFinite(seconds) ? seconds : undefined,
    });
  }
  if (status === 404) return new LlmError("not_found", `Not found${detail}`, { status });
  if (status >= 500)
    return new LlmError("upstream", `Ollama upstream error (HTTP ${status})${detail}`, { status });
  return new LlmError("bad_request", `Ollama rejected the request (HTTP ${status})${detail}`, {
    status,
  });
}
