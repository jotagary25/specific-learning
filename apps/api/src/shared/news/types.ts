import type { ArticleSourceKind, ArticleTopic } from "@english-course/shared";

/** A possible daily article, as listed by a news source (full text may not be in hand yet). */
export type NewsCandidate = {
  source: ArticleSourceKind;
  /** Canonical URL; also the dedupe key. */
  url: string;
  title: string;
  summary: string;
  publishedAt: Date | null;
  topicHint?: ArticleTopic;
  outlet: string;
  /** Author lines as published (name, role, institution). */
  authors: string[];
  license: string | null;
  /** Word count when the full text is already known (e.g. carried by the feed). */
  wordCount?: number;
  /** Full verbatim text when the feed carries it. */
  text?: string;
};

/** A fetched article: text is verbatim, paragraphs separated by blank lines. */
export type NewsArticle = {
  source: ArticleSourceKind;
  url: string;
  title: string;
  authors: string[];
  outlet: string;
  license: string | null;
  publishedAt: Date | null;
  text: string;
};

/** Port for daily-article sources (docs/spec.md §5): RSS/Atom feeds, web search. */
export interface NewsSource {
  readonly name: string;
  candidates(): Promise<NewsCandidate[]>;
  fetchFullText(candidate: NewsCandidate): Promise<NewsArticle>;
}

export class NewsError extends Error {
  override readonly name = "NewsError";
  readonly code: "not_configured" | "http" | "network" | "no_text";

  constructor(code: NewsError["code"], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

export const DEFAULT_NEWS_TIMEOUT_MS = 15_000;
export const NEWS_USER_AGENT = "english-course/0.1 (personal reading app)";

/** Canonical form used to dedupe URLs: no hash, no tracking query, no trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$)/i.test(key)) parsed.searchParams.delete(key);
    }
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return url.trim();
  }
}
