// Ollama web search adapter: POST /api/web_search for candidates, /api/web_fetch for full text.
import { type ArticleTopic, countWords } from "@english-course/shared";
import { z } from "zod";
import { type FetchFn, request } from "./http.ts";
import {
  type NewsArticle,
  type NewsCandidate,
  NewsError,
  type NewsSource,
  normalizeUrl,
} from "./types.ts";

export const WEBSEARCH_LICENSE = "unknown — personal use";

/** Rotating queries; one topic per run, picked by the day. */
export const WEBSEARCH_QUERIES: Array<{ topic: ArticleTopic; query: string }> = [
  { topic: "tech", query: "technology news analysis this week" },
  { topic: "science", query: "new scientific discovery explained this week" },
  { topic: "geopolitics", query: "geopolitics analysis this week" },
];

const SearchResponse = z.object({
  results: z
    .array(
      z.object({ title: z.string().default(""), url: z.string(), content: z.string().default("") }),
    )
    .default([]),
});
const FetchResponse = z.object({ title: z.string().default(""), content: z.string().default("") });

export type OllamaWebSearchOptions = {
  baseUrl?: string;
  /** Resolved on every call; the key never leaves the backend and is never logged. */
  getApiKey: () => Promise<string | undefined>;
  fetch?: FetchFn;
  now?: () => Date;
  maxResults?: number;
};

const dayIndex = (date: Date) => Math.floor(date.getTime() / 86_400_000);

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
};

/** Normalizes line endings and blank-line runs only; the words are kept as returned. */
const tidy = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export function createOllamaWebSearchSource(options: OllamaWebSearchOptions): NewsSource {
  const baseUrl = (options.baseUrl ?? "https://ollama.com").replace(/\/$/, "");
  const fetchFn = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());

  async function post(path: string, body: unknown): Promise<unknown> {
    const key = await options.getApiKey();
    if (!key) throw new NewsError("not_configured", "Ollama API key is not configured");
    const res = await request(fetchFn, `${baseUrl}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 30_000,
    });
    return res.json();
  }

  return {
    name: "ollama-websearch",

    async candidates() {
      const entry = WEBSEARCH_QUERIES[dayIndex(now()) % WEBSEARCH_QUERIES.length];
      if (!entry) return [];
      const parsed = SearchResponse.parse(
        await post("/api/web_search", { query: entry.query, max_results: options.maxResults ?? 5 }),
      );
      return parsed.results
        .filter((result) => result.url.startsWith("http"))
        .map((result) => ({
          source: "websearch" as const,
          url: normalizeUrl(result.url),
          title: result.title || hostOf(result.url),
          summary: result.content.slice(0, 400),
          publishedAt: null,
          topicHint: entry.topic,
          outlet: hostOf(result.url),
          authors: [],
          license: WEBSEARCH_LICENSE,
          // Search content may be truncated: the length is only an estimate until fetched.
          wordCount: countWords(result.content) || undefined,
        }));
    },

    async fetchFullText(candidate: NewsCandidate): Promise<NewsArticle> {
      const parsed = FetchResponse.parse(await post("/api/web_fetch", { url: candidate.url }));
      const text = tidy(parsed.content);
      if (!text) throw new NewsError("no_text", `No article text found at ${candidate.url}`);
      return {
        source: "websearch",
        url: candidate.url,
        title: parsed.title || candidate.title,
        authors: [],
        outlet: candidate.outlet,
        license: WEBSEARCH_LICENSE,
        publishedAt: null,
        text,
      };
    },
  };
}
