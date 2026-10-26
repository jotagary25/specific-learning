// AI editor pipeline (docs/spec.md §3.4.1): gather → filter → select → fetch → annotate → store.
import {
  type ArticleAnnotations,
  ArticleTopic,
  type CefrLevel,
  countWords,
  type EditorRunResponse,
  type FocusUnit,
} from "@english-course/shared";
import type { ArticleCandidate } from "../prompts/index.ts";
import { addDays } from "../shared/clock.ts";
import type { NewsArticle, NewsCandidate, NewsSource } from "../shared/news/types.ts";
import { normalizeUrl } from "../shared/news/types.ts";
import { type ReadingAi, runReadingAi } from "./ai.ts";
import type { ReadingStore } from "./reading.store.ts";

export const WORD_RANGE = { min: 500, max: 1200 } as const;
export const MAX_AGE_DAYS = 7;
const IDEAL_WORDS = 850;
const RECENT_ARTICLES = 6;
const MAX_SELECT_CANDIDATES = 20;
const MAX_FETCH_ATTEMPTS = 4;

export const TOPIC_ROTATION: readonly ArticleTopic[] = ["tech", "science", "geopolitics"];

/** Used when no unit is seeded: the prompts always need a grammar target. */
const GENERAL_FOCUS: FocusUnit = {
  id: 0,
  title: "General reading",
  grammarFocus: "any verb tense",
};

type Sourced = { candidate: NewsCandidate; source: NewsSource };

/** Candidates gathered from every source; one pool can serve several users' runs. */
export type CandidatePool = { items: Sourced[]; sources: EditorRunResponse["sources"] };

/** The topic after the most recent one in the rotation tech → science → geopolitics. */
export function nextTopic(recentTopics: ReadonlyArray<string | null>): ArticleTopic {
  const last = recentTopics.find((topic) => TOPIC_ROTATION.includes(topic as ArticleTopic));
  if (!last) return TOPIC_ROTATION[0] as ArticleTopic;
  const index = TOPIC_ROTATION.indexOf(last as ArticleTopic);
  return TOPIC_ROTATION[(index + 1) % TOPIC_ROTATION.length] as ArticleTopic;
}

const inRange = (words: number, range: { min: number; max: number }) =>
  words >= range.min && words <= range.max;

export type FilterOptions = {
  date: string;
  usedUrls: ReadonlySet<string>;
  wordRange?: { min: number; max: number };
  maxAgeDays?: number;
};

/**
 * Dedupes by URL, drops already-used URLs, articles older than `maxAgeDays` before `date` (when
 * the date is known) and articles whose known full text is outside the word range. Candidates
 * whose length is only an estimate are kept and checked after fetching.
 */
export function filterCandidates<T extends { candidate: NewsCandidate }>(
  items: readonly T[],
  options: FilterOptions,
): T[] {
  const range = options.wordRange ?? WORD_RANGE;
  const cutoff = new Date(
    `${addDays(options.date, -(options.maxAgeDays ?? MAX_AGE_DAYS))}T00:00:00Z`,
  );
  const seen = new Set<string>();
  return items.filter(({ candidate }) => {
    const url = normalizeUrl(candidate.url);
    if (seen.has(url) || options.usedUrls.has(url) || options.usedUrls.has(candidate.url)) {
      return false;
    }
    seen.add(url);
    if (candidate.publishedAt && candidate.publishedAt < cutoff) return false;
    if (candidate.text !== undefined && !inRange(countWords(candidate.text), range)) return false;
    return true;
  });
}

/**
 * Deterministic pick order used when the AI editor is unavailable: the next topic in the
 * rotation first, then known in-range lengths closest to ~850 words, then the newest.
 */
export function fallbackOrder<T extends { candidate: NewsCandidate }>(
  items: readonly T[],
  recentTopics: ReadonlyArray<string | null>,
  wordRange: { min: number; max: number } = WORD_RANGE,
): T[] {
  const target = nextTopic(recentTopics);
  const start = TOPIC_ROTATION.indexOf(target);
  const topicRank = (topic: ArticleTopic | undefined) => {
    const index = topic ? TOPIC_ROTATION.indexOf(topic) : -1;
    return index < 0
      ? TOPIC_ROTATION.length
      : (index - start + TOPIC_ROTATION.length) % TOPIC_ROTATION.length;
  };
  const lengthRank = (c: NewsCandidate) =>
    c.text !== undefined && c.wordCount !== undefined && inRange(c.wordCount, wordRange) ? 0 : 1;
  const distance = (c: NewsCandidate) => Math.abs((c.wordCount ?? 0) - IDEAL_WORDS);
  const time = (c: NewsCandidate) => c.publishedAt?.getTime() ?? 0;
  return [...items].sort(
    (a, b) =>
      topicRank(a.candidate.topicHint) - topicRank(b.candidate.topicHint) ||
      lengthRank(a.candidate) - lengthRank(b.candidate) ||
      distance(a.candidate) - distance(b.candidate) ||
      time(b.candidate) - time(a.candidate),
  );
}

export type EditorDeps = {
  store: ReadingStore;
  sources: NewsSource[];
  ai?: ReadingAi;
  wordRange?: { min: number; max: number };
  maxAgeDays?: number;
};

export function createEditor(deps: EditorDeps) {
  const { store } = deps;
  const wordRange = deps.wordRange ?? WORD_RANGE;
  /** In-flight runs, keyed by user and date. */
  const running = new Map<string, Promise<EditorRunResponse>>();

  async function annotate(
    userId: string,
    article: {
      title: string;
      outlet: string | null;
      url: string;
      text: string;
    },
  ): Promise<ArticleAnnotations | null> {
    const [unit, knownWords] = await Promise.all([
      store.currentUnit(userId),
      store.knownWords(userId),
    ]);
    const result = await runReadingAi(deps.ai, userId, "annotate_article", {
      article: { title: article.title, source: article.outlet ?? article.url, text: article.text },
      currentUnit: unit ?? GENERAL_FOCUS,
      knownWords,
    });
    return result ?? null;
  }

  /** 1. Gather: a failing source is reported, never fatal. */
  async function gather(): Promise<CandidatePool> {
    const pool: CandidatePool = { items: [], sources: [] };
    for (const source of deps.sources) {
      try {
        const list = await source.candidates();
        pool.items.push(...list.map((candidate) => ({ candidate, source })));
        pool.sources.push({ name: source.name, candidates: list.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`editor: source ${source.name} failed: ${message}`);
        pool.sources.push({ name: source.name, candidates: 0, error: message });
      }
    }
    return pool;
  }

  async function run(
    userId: string,
    date: string,
    candidates: () => Promise<CandidatePool>,
  ): Promise<EditorRunResponse> {
    const base = {
      date,
      selection: null,
      annotated: false,
      candidates: 0,
      sources: [] as EditorRunResponse["sources"],
      warnings: [] as string[],
    };
    const existing = await store.getArticleForDate(userId, date);
    if (existing) {
      return {
        ...base,
        status: "existing",
        articleId: existing.id,
        title: existing.title,
        annotated: existing.annotations !== null,
      };
    }

    // 1. Gather (or reuse the pool the scheduler fetched for this tick).
    const { items: gathered, sources } = await candidates();
    base.sources.push(...sources);

    // 2. Filter: drop what this user already read (other users' picks stay eligible).
    const usedUrls = await store.usedUrls(
      userId,
      gathered.map((g) => normalizeUrl(g.candidate.url)),
    );
    const pool = filterCandidates(gathered, {
      date,
      usedUrls,
      wordRange,
      maxAgeDays: deps.maxAgeDays,
    });
    base.candidates = pool.length;
    if (pool.length === 0) {
      return { ...base, status: "no-candidates", articleId: null, title: null };
    }

    // 3. Select: the AI editor, else the deterministic rotation.
    const recent = await store.recentArticles(userId, date, RECENT_ARTICLES);
    const recentTopics = recent.map((a) => a.topic);
    const ordered = fallbackOrder(pool, recentTopics, wordRange);
    const shortlist = ordered.slice(0, MAX_SELECT_CANDIDATES);
    const unit = (await store.currentUnit(userId)) ?? GENERAL_FOCUS;
    const promptCandidates: ArticleCandidate[] = shortlist.map(({ candidate }, index) => ({
      id: `c${index + 1}`,
      title: candidate.title,
      summary: candidate.summary.slice(0, 400),
      source: candidate.outlet,
      wordCount: candidate.wordCount ?? 0,
      publishedAt: candidate.publishedAt?.toISOString() ?? "unknown",
      topicHint: candidate.topicHint,
    }));
    const choice = await runReadingAi(deps.ai, userId, "select_article", {
      candidates: promptCandidates,
      currentUnit: unit,
      recentTopics: recentTopics.filter(
        (t): t is ArticleTopic => ArticleTopic.safeParse(t).success,
      ),
      recentTitles: recent.map((a) => a.title),
      wordRange,
    });
    const chosenIndex = choice ? promptCandidates.findIndex((c) => c.id === choice.chosenId) : -1;
    const chosen = chosenIndex >= 0 ? shortlist[chosenIndex] : undefined;
    if (choice && !chosen)
      base.warnings.push(`select_article chose an unknown id "${choice.chosenId}"`);
    if (!choice) base.warnings.push("select_article unavailable: deterministic pick");
    const attempts = chosen ? [chosen, ...ordered.filter((item) => item !== chosen)] : ordered;

    // 4. Fetch the full text and check its real length.
    let picked: { item: Sourced; article: NewsArticle } | undefined;
    for (const item of attempts.slice(0, MAX_FETCH_ATTEMPTS)) {
      try {
        const article = await item.source.fetchFullText(item.candidate);
        const words = countWords(article.text);
        if (inRange(words, wordRange)) {
          picked = { item, article };
          break;
        }
        base.warnings.push(`skipped ${item.candidate.url}: ${words} words`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        base.warnings.push(`skipped ${item.candidate.url}: ${message}`);
      }
    }
    if (!picked) return { ...base, status: "no-candidates", articleId: null, title: null };

    // 5. Annotate (null on failure: plain reading plus a retry button) and store.
    const byAi = chosen !== undefined && picked.item === chosen;
    const annotations = await annotate(userId, picked.article);
    if (!annotations)
      base.warnings.push("annotate_article unavailable: stored without annotations");
    const { article: stored } = await store.insertArticle(userId, {
      source: picked.article.source,
      url: normalizeUrl(picked.article.url),
      title: picked.article.title,
      authors: picked.article.authors,
      outlet: picked.article.outlet,
      license: picked.article.license,
      publishedAt: picked.article.publishedAt,
      text: picked.article.text,
      topic: (byAi ? choice?.topic : undefined) ?? picked.item.candidate.topicHint ?? "other",
      estLevel: byAi ? ((choice?.estLevel as CefrLevel | undefined) ?? null) : null,
      selectedFor: date,
      annotations,
    });
    return {
      ...base,
      status: "selected",
      articleId: stored.id,
      title: stored.title,
      selection: byAi ? "ai" : "fallback",
      annotated: stored.annotations !== null,
    };
  }

  return {
    annotate,
    gather,
    /**
     * Selects and stores the user's article for `date` (YYYY-MM-DD); idempotent per user and
     * date. `candidates` supplies a shared pool; without it the sources are queried.
     */
    run(
      userId: string,
      date: string,
      candidates: () => Promise<CandidatePool> = gather,
    ): Promise<EditorRunResponse> {
      const key = `${userId}/${date}`;
      const inFlight = running.get(key);
      if (inFlight) return inFlight;
      const job = run(userId, date, candidates).finally(() => running.delete(key));
      running.set(key, job);
      return job;
    },
  };
}

export type Editor = ReturnType<typeof createEditor>;
