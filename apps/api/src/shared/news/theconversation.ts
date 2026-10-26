// The Conversation adapter: section Atom feeds carry the full article HTML (CC BY-ND 4.0).
import type { ArticleTopic } from "@english-course/shared";
import { countWords } from "@english-course/shared";
import { type FeedEntry, parseFeed } from "./feed.ts";
import { extractElement, htmlToText } from "./html-text.ts";
import { type FetchFn, request } from "./http.ts";
import {
  type NewsArticle,
  type NewsCandidate,
  NewsError,
  type NewsSource,
  normalizeUrl,
} from "./types.ts";

export const THE_CONVERSATION_OUTLET = "The Conversation";
export const THE_CONVERSATION_LICENSE = "CC BY-ND 4.0";

export type FeedConfig = { url: string; topic: ArticleTopic };

/** US-edition section feeds (verified live, Oct 2026). */
export const THE_CONVERSATION_FEEDS: FeedConfig[] = [
  { url: "https://theconversation.com/us/technology/articles.atom", topic: "tech" },
  { url: "https://theconversation.com/us/environment/articles.atom", topic: "science" },
  { url: "https://theconversation.com/us/politics/articles.atom", topic: "geopolitics" },
  { url: "https://theconversation.com/us/world/articles.atom", topic: "geopolitics" },
];

/** Below this the feed body is treated as a teaser and the page is fetched instead. */
const MIN_FEED_WORDS = 300;

export type TheConversationOptions = {
  feeds?: FeedConfig[];
  fetch?: FetchFn;
};

function toCandidate(entry: FeedEntry, topic: ArticleTopic): NewsCandidate | null {
  if (!entry.url || !entry.title) return null;
  const text = htmlToText(entry.contentHtml);
  const wordCount = countWords(text);
  return {
    source: "theconversation",
    url: normalizeUrl(entry.url),
    title: entry.title,
    summary: entry.summary || text.slice(0, 300),
    publishedAt: entry.publishedAt,
    topicHint: topic,
    outlet: THE_CONVERSATION_OUTLET,
    authors: entry.authors,
    license: THE_CONVERSATION_LICENSE,
    ...(wordCount >= MIN_FEED_WORDS ? { text, wordCount } : {}),
  };
}

export function createTheConversationSource(options: TheConversationOptions = {}): NewsSource {
  const feeds = options.feeds ?? THE_CONVERSATION_FEEDS;
  const fetchFn = options.fetch ?? fetch;

  return {
    name: "theconversation",

    async candidates() {
      const results = await Promise.allSettled(
        feeds.map(async (feed) => {
          const xml = await (await request(fetchFn, feed.url)).text();
          return parseFeed(xml).flatMap((entry) => toCandidate(entry, feed.topic) ?? []);
        }),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length === results.length && failed.length > 0) {
        throw (failed[0] as PromiseRejectedResult).reason;
      }
      // An article listed in two sections keeps the first section's topic.
      const byUrl = new Map<string, NewsCandidate>();
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        for (const candidate of result.value) {
          if (!byUrl.has(candidate.url)) byUrl.set(candidate.url, candidate);
        }
      }
      return [...byUrl.values()];
    },

    async fetchFullText(candidate) {
      let text = candidate.text;
      if (!text) {
        const html = await (await request(fetchFn, candidate.url)).text();
        const body = extractElement(html, /<div\b[^>]*itemprop=["']articleBody["'][^>]*>/i);
        text = body ? htmlToText(body) : "";
      }
      if (!text) throw new NewsError("no_text", `No article text found at ${candidate.url}`);
      return {
        source: "theconversation",
        url: candidate.url,
        title: candidate.title,
        authors: candidate.authors,
        outlet: THE_CONVERSATION_OUTLET,
        license: THE_CONVERSATION_LICENSE,
        publishedAt: candidate.publishedAt,
        text,
      } satisfies NewsArticle;
    },
  };
}
