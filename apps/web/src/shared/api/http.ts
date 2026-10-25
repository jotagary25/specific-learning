import { ApiError } from "@english-course/shared";

export class HttpError extends Error {
  override readonly name = "HttpError";
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const isUnauthorized = (error: unknown) =>
  error instanceof HttpError && error.status === 401;

/** JSON request to the api; non-2xx answers become an `HttpError` with the api's message. */
export async function apiRequest<T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  init: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const parsed = ApiError.safeParse(await res.json().catch(() => null));
    throw parsed.success
      ? new HttpError(res.status, parsed.data.error, parsed.data.message)
      : new HttpError(res.status, "http_error", `Request failed with HTTP ${res.status}`);
  }
  return schema.parse(await res.json());
}
