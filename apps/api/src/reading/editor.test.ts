import { describe, expect, it } from "vitest";
import { createSettings } from "../settings/settings.service.ts";
import { createMemorySettingsStore } from "../settings/settings.store.ts";
import { LlmError } from "../shared/llm/errors.ts";
import { createFakeLlm, type FakeLlm } from "../shared/llm/fake.ts";
import { addDays, nextRunAt } from "./dates.ts";
import { createEditor, fallbackOrder, filterCandidates, nextTopic } from "./editor.ts";
import { createMemoryReadingStore } from "./reading.memory-store.ts";
import { type ArticleRecord, unitFocus } from "./reading.store.ts";
import { annotations, candidate, fakeSource } from "./reading.test-support.ts";

/** Memory fakes ignore the user; services still need one. */
const USER = "test-user";

const DATE = "2026-10-25";

function aiWith(llm: FakeLlm) {
  return createSettings({
    store: createMemorySettingsStore(),
    appSecret: "ab".repeat(32),
    createClient: () => llm,
  });
}

const wrap = (...candidates: ReturnType<typeof candidate>[]) =>
  candidates.map((c) => ({ candidate: c }));

function storedArticle(overrides: Partial<ArticleRecord>): ArticleRecord {
  return {
    id: crypto.randomUUID(),
    source: "theconversation",
    url: "https://x.test/old",
    title: "Old",
    authors: [],
    outlet: null,
    license: null,
    publishedAt: null,
    text: "old",
    topic: "tech",
    estLevel: null,
    selectedFor: "2026-10-24",
    annotations: null,
    ...overrides,
  };
}

describe("dates", () => {
  it("adds calendar days", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("computes the next run hour strictly after now", () => {
    const before = new Date(2026, 9, 25, 4, 30);
    expect(nextRunAt(before, 5)).toEqual(new Date(2026, 9, 25, 5, 0));
    const after = new Date(2026, 9, 25, 5, 0);
    expect(nextRunAt(after, 5)).toEqual(new Date(2026, 9, 26, 5, 0));
  });
});

describe("unitFocus", () => {
  it("does not double the subtitle's parentheses", () => {
    const base = { id: 1, title: "Present Continuous" };
    expect(unitFocus({ ...base, subtitle: "(I am doing)" }).grammarFocus).toBe(
      "Present Continuous (I am doing)",
    );
    expect(unitFocus({ ...base, subtitle: "I am doing" }).grammarFocus).toBe(
      "Present Continuous (I am doing)",
    );
    expect(unitFocus({ ...base, subtitle: "" }).grammarFocus).toBe("Present Continuous");
  });
});

describe("filters", () => {
  it("rotates topics tech → science → geopolitics", () => {
    expect(nextTopic([])).toBe("tech");
    expect(nextTopic(["tech"])).toBe("science");
    expect(nextTopic([null, "geopolitics", "tech"])).toBe("tech");
  });

  it("dedupes by URL and skips used URLs", () => {
    const kept = filterCandidates(
      wrap(
        candidate({ url: "https://a.test/1" }),
        candidate({ url: "https://a.test/1/#x" }),
        candidate({ url: "https://a.test/used" }),
      ),
      { date: DATE, usedUrls: new Set(["https://a.test/used"]) },
    );
    expect(kept.map((k) => k.candidate.url)).toEqual(["https://a.test/1"]);
  });

  it("keeps 500–1,200 words and ≤ 7 days, unknown dates and estimated lengths", () => {
    const kept = filterCandidates(
      wrap(
        candidate({ url: "https://a.test/short", text: "word ".repeat(499) }),
        candidate({ url: "https://a.test/long", text: "word ".repeat(1201) }),
        candidate({ url: "https://a.test/edge", text: "word ".repeat(1200) }),
        candidate({ url: "https://a.test/old", publishedAt: new Date(2026, 9, 17, 12) }),
        candidate({ url: "https://a.test/week", publishedAt: new Date(2026, 9, 18, 12) }),
        candidate({ url: "https://a.test/undated", publishedAt: null }),
        candidate({ url: "https://a.test/estimate", text: undefined, wordCount: 90 }),
      ),
      { date: DATE, usedUrls: new Set() },
    );
    expect(kept.map((k) => k.candidate.url)).toEqual([
      "https://a.test/edge",
      "https://a.test/week",
      "https://a.test/undated",
      "https://a.test/estimate",
    ]);
  });

  it("orders the deterministic pick by topic rotation, then length", () => {
    const order = fallbackOrder(
      wrap(
        candidate({ url: "https://a.test/tech", topicHint: "tech" }),
        candidate({ url: "https://a.test/geo", topicHint: "geopolitics" }),
        candidate({ url: "https://a.test/sci-long", topicHint: "science", wordCount: 1150 }),
        candidate({ url: "https://a.test/sci", topicHint: "science", wordCount: 800 }),
      ),
      ["tech"],
    );
    expect(order.map((o) => o.candidate.url)).toEqual([
      "https://a.test/sci",
      "https://a.test/sci-long",
      "https://a.test/geo",
      "https://a.test/tech",
    ]);
  });
});

describe("runEditor", () => {
  it("selects with the AI, annotates and stores the daily article", async () => {
    const store = createMemoryReadingStore();
    const source = fakeSource([
      candidate({ url: "https://a.test/1" }),
      candidate({ url: "https://a.test/2", topicHint: "science" }),
    ]);
    const llm = createFakeLlm({
      jsonReplies: [
        JSON.stringify({ chosenId: "c2", topic: "geopolitics", estLevel: "B2", reasons: ["new"] }),
        JSON.stringify(annotations()),
      ],
    });
    const editor = createEditor({ store, sources: [source], ai: aiWith(llm) });

    const result = await editor.run(USER, DATE);
    expect(result).toMatchObject({
      status: "selected",
      selection: "ai",
      annotated: true,
      candidates: 2,
    });
    const [stored] = store.articles;
    expect(stored).toMatchObject({ selectedFor: DATE, topic: "geopolitics", estLevel: "B2" });
    // The chosen id maps to the shortlist order (next topic after none is tech, so "science" is 2nd).
    expect(stored?.url).toBe("https://a.test/2");
    expect(stored?.annotations?.glossary).toHaveLength(3);
    const selectPrompt = llm.calls
      .find((c) => c.method === "chatJson")
      ?.req?.messages.at(-1)?.content;
    expect(selectPrompt).toContain("Present continuous");
  });

  it("is idempotent per date", async () => {
    const store = createMemoryReadingStore();
    const source = fakeSource([
      candidate({ url: "https://a.test/1" }),
      candidate({ url: "https://a.test/2" }),
    ]);
    const editor = createEditor({ store, sources: [source] });
    const [first, concurrent] = await Promise.all([editor.run(USER, DATE), editor.run(USER, DATE)]);
    const again = await editor.run(USER, DATE);
    expect(first.status).toBe("selected");
    expect(concurrent).toEqual(first);
    expect(again).toMatchObject({ status: "existing", articleId: first.articleId });
    expect(store.articles).toHaveLength(1);
    expect(source.fetched).toHaveLength(1);
  });

  it("falls back to a deterministic pick and no annotations when the AI fails", async () => {
    const store = createMemoryReadingStore();
    store.articles.push(storedArticle({ topic: "tech", url: "https://a.test/used" }));
    const source = fakeSource([
      candidate({ url: "https://a.test/used" }),
      candidate({ url: "https://a.test/tech", topicHint: "tech" }),
      candidate({ url: "https://a.test/science", topicHint: "science" }),
    ]);
    const llm = createFakeLlm({ failWith: new LlmError("not_configured", "no key") });
    const editor = createEditor({ store, sources: [source], ai: aiWith(llm) });

    const result = await editor.run(USER, DATE);
    expect(result).toMatchObject({ status: "selected", selection: "fallback", annotated: false });
    expect(result.warnings.join(" ")).toContain("deterministic");
    expect(store.articles.at(-1)).toMatchObject({
      url: "https://a.test/science",
      topic: "science",
      annotations: null,
      selectedFor: DATE,
    });
  });

  it("skips fetched articles outside the word range and survives a failing source", async () => {
    const store = createMemoryReadingStore();
    const estimate = candidate({
      url: "https://web.test/a",
      source: "websearch",
      text: undefined,
      wordCount: 800,
    });
    const good = candidate({
      url: "https://web.test/b",
      source: "websearch",
      text: undefined,
      wordCount: 700,
      topicHint: "science",
    });
    const source = fakeSource([estimate, good], "web", { "https://web.test/a": "too short" });
    const broken = fakeSource(async () => {
      throw new Error("feed down");
    }, "broken");
    const editor = createEditor({ store, sources: [broken, source] });

    const result = await editor.run(USER, DATE);
    expect(result.sources).toEqual([
      { name: "broken", candidates: 0, error: "feed down" },
      { name: "web", candidates: 2 },
    ]);
    expect(result.status).toBe("selected");
    expect(store.articles[0]?.url).toBe("https://web.test/b");
    expect(result.warnings.some((w) => w.includes("2 words"))).toBe(true);
  });

  it("reports no candidates without storing anything", async () => {
    const store = createMemoryReadingStore();
    const editor = createEditor({ store, sources: [fakeSource([])] });
    expect(await editor.run(USER, DATE)).toMatchObject({
      status: "no-candidates",
      articleId: null,
    });
    expect(store.articles).toHaveLength(0);
  });
});
