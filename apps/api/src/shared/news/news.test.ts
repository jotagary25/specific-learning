import { readFileSync } from "node:fs";
import { countWords } from "@english-course/shared";
import { describe, expect, it, vi } from "vitest";
import { parseFeed } from "./feed.ts";
import { decodeEntities, extractElement, htmlToParagraphs } from "./html-text.ts";
import { createTheConversationSource, THE_CONVERSATION_LICENSE } from "./theconversation.ts";
import { NewsError, normalizeUrl } from "./types.ts";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const ATOM = fixture("theconversation.atom");
const RSS = fixture("news.rss");

/** A fetch stub keyed by URL; anything else fails like a missing page. */
function stubFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const route = routes[String(input)];
    return route ? route(init) : new Response("not found", { status: 404 });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("html-text", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("Tom&#8217;s &ldquo;AI&rdquo; &amp; &#x2014; &bogus;")).toBe(
      "Tom’s “AI” & — &bogus;",
    );
  });

  it("keeps paragraphs and drops images, figures and embeds", () => {
    const paragraphs = htmlToParagraphs(
      '<figure><img src="a.jpg"><figcaption>Caption</figcaption></figure><p>One <a href="#">link</a>.</p><p><iframe src="x"></iframe></p><h2>Next</h2><p>Two<br>lines</p>',
    );
    expect(paragraphs).toEqual(["One link.", "Next", "Two", "lines"]);
  });

  it("extracts a nested element body", () => {
    const html =
      '<div class="x"><div itemprop="articleBody"><p>A</p><div><p>B</p></div></div><p>C</p></div>';
    expect(extractElement(html, /<div\b[^>]*itemprop="articleBody"[^>]*>/)).toBe(
      "<p>A</p><div><p>B</p></div>",
    );
  });
});

describe("parseFeed", () => {
  it("parses Atom entries with authors, dates, links and HTML content", () => {
    const entries = parseFeed(ATOM);
    expect(entries).toHaveLength(2);
    const [first] = entries;
    expect(first).toMatchObject({
      title: "Robots that sort recycling – and what they get wrong",
      url: "https://theconversation.com/robots-that-sort-recycling-1001",
      summary: "Sorting robots are learning fast.",
      authors: [
        "Ada Lovelace, Professor of Computing, Example University",
        "Grace Hopper, Researcher, Navy Lab",
      ],
    });
    expect(first?.publishedAt?.toISOString()).toBe("2026-10-23T19:42:58.000Z");
    expect(first?.contentHtml).toContain("<figure>");
  });

  it("parses RSS items with CDATA", () => {
    const [item] = parseFeed(RSS);
    expect(item).toMatchObject({
      title: "Ice sheets & the sea",
      url: "https://news.example.com/ice?utm_source=rss#top",
      authors: ["Jane Doe"],
      summary: "Short & sweet summary.",
    });
    expect(item?.contentHtml).toBe(
      "<p>Scientists are measuring the ice.</p><p>It is melting faster.</p>",
    );
  });

  it("ignores documents that are not feeds", () => {
    expect(parseFeed("<html><body>hi</body></html>")).toEqual([]);
  });
});

describe("normalizeUrl", () => {
  it("drops hash, tracking params and trailing slash", () => {
    expect(normalizeUrl("https://news.example.com/ice/?utm_source=rss&id=3#top")).toBe(
      "https://news.example.com/ice?id=3",
    );
  });
});

describe("theconversation source", () => {
  const feed = { url: "https://feeds.test/tech.atom", topic: "tech" as const };

  it("lists candidates with full text, attribution and license", async () => {
    const fetchFn = stubFetch({ [feed.url]: () => new Response(ATOM) });
    const source = createTheConversationSource({ feeds: [feed], fetch: fetchFn });
    const candidates = await source.candidates();
    expect(candidates).toHaveLength(2);
    const [full, teaser] = candidates;
    expect(full).toMatchObject({
      source: "theconversation",
      topicHint: "tech",
      outlet: "The Conversation",
      license: THE_CONVERSATION_LICENSE,
    });
    expect(full?.text).toBeDefined();
    expect(full?.text).not.toContain("<");
    expect(full?.text).not.toContain("robot arm");
    expect(full?.text).toContain("The team’s results look “promising”.");
    expect(full?.text?.split("\n\n")).toContain("What comes next");
    expect(full?.wordCount).toBe(countWords(full?.text ?? ""));
    expect(full?.wordCount).toBeGreaterThan(500);
    // A teaser body is not trusted as the full text.
    expect(teaser?.text).toBeUndefined();
    expect(teaser?.wordCount).toBeUndefined();
  });

  it("uses the feed text, or fetches the page body for teasers", async () => {
    const page = `<html><body><div class="grid" itemprop="articleBody"><p>Page paragraph one.</p><figure><img src="x"></figure><p>Page paragraph two.</p></div><footer>Footer</footer></body></html>`;
    const fetchFn = stubFetch({
      [feed.url]: () => new Response(ATOM),
      "https://theconversation.com/a-teaser-only-1002": () => new Response(page),
    });
    const source = createTheConversationSource({ feeds: [feed], fetch: fetchFn });
    const [full, teaser] = await source.candidates();
    if (!full || !teaser) throw new Error("fixture changed");

    const fromFeed = await source.fetchFullText(full);
    expect(fromFeed.text).toBe(full.text);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const fromPage = await source.fetchFullText(teaser);
    expect(fromPage).toMatchObject({
      text: "Page paragraph one.\n\nPage paragraph two.",
      authors: ["Alan Turing, Fellow, King's College"],
      url: "https://theconversation.com/a-teaser-only-1002",
    });
  });

  it("survives one failing feed but not all of them", async () => {
    const ok = createTheConversationSource({
      feeds: [feed, { url: "https://feeds.test/down.atom", topic: "science" }],
      fetch: stubFetch({ [feed.url]: () => new Response(ATOM) }),
    });
    expect(await ok.candidates()).toHaveLength(2);

    const down = createTheConversationSource({
      feeds: [{ url: "https://feeds.test/down.atom", topic: "science" }],
      fetch: stubFetch({}),
    });
    await expect(down.candidates()).rejects.toBeInstanceOf(NewsError);
  });
});
