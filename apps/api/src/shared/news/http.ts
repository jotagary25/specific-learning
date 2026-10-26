import { DEFAULT_NEWS_TIMEOUT_MS, NEWS_USER_AGENT, NewsError } from "./types.ts";

export type FetchFn = typeof fetch;

/** GET/POST with a timeout; non-2xx → NewsError("http"), transport failures → NewsError("network"). */
export async function request(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_NEWS_TIMEOUT_MS, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetchFn(url, {
      ...rest,
      headers: { "user-agent": NEWS_USER_AGENT, ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new NewsError("network", `Request to ${new URL(url).host} failed`, { cause: error });
  }
  if (!res.ok) {
    throw new NewsError("http", `${new URL(url).host} answered HTTP ${res.status}`);
  }
  return res;
}
