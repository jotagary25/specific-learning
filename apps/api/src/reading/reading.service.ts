import {
  type ArticleDetail,
  type ArticleSummary,
  type ArticlesListResponse,
  type ArticleView,
  countWords,
  type EditorRunResponse,
  findQuote,
  type GlossResponse,
  type GlossWordOutput,
  matchSpot,
  paragraphsOf,
  type QuestionGradeResponse,
  type ReadingSessionView,
  type ReadingStep,
  type RecallAnswerResponse,
  type RecallQuestionView,
  type RecallResponse,
  type RetellResponse,
  type SaveWordResponse,
  type SpotRequest,
  type SpotResponse,
  type TodayResponse,
} from "@english-course/shared";
import { type ReadingAi, runReadingAi } from "./ai.ts";
import { addDays, localDate } from "./dates.ts";
import type { Editor } from "./editor.ts";
import {
  type ArticleRecord,
  emptySession,
  type ReadingStore,
  type SessionEntry,
  type SessionRecord,
} from "./reading.store.ts";

export type ReadingDeps = {
  store: ReadingStore;
  editor: Editor;
  ai?: ReadingAi;
  /** Today's date (YYYY-MM-DD) in server time. */
  today?: () => string;
  editorEnabled?: boolean;
};

export class ReadingError extends Error {
  override readonly name = "ReadingError";
  readonly code: "not_found" | "invalid" | "not_annotated" | "ai-unavailable";

  constructor(code: ReadingError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** How many grammar examples the hunt asks for at most. */
export const SPOT_TARGET = 3;

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

type EntryOf<T extends SessionEntry["type"]> = Extract<SessionEntry, { type: T }>;

const entriesOf = <T extends SessionEntry["type"]>(session: SessionRecord, type: T) =>
  session.entries.filter((e): e is EntryOf<T> => e.type === type);

/** Replaces entries matching `same` with `entry` (keeps one per key). */
function upsert(session: SessionRecord, entry: SessionEntry, same: (e: SessionEntry) => boolean) {
  session.entries = [...session.entries.filter((e) => !same(e)), entry];
}

function stepOf(session: SessionRecord): ReadingStep {
  if (session.completedAt) return "done";
  return entriesOf(session, "step").at(-1)?.step ?? (session.prediction ? "read" : "predict");
}

const wordKey = (word: string) => word.trim().toLowerCase();

function summaryOf(article: ArticleRecord, completed: boolean): ArticleSummary {
  return {
    id: article.id,
    title: article.title,
    url: article.url,
    outlet: article.outlet,
    topic: article.topic,
    selectedFor: article.selectedFor,
    wordCount: countWords(article.text),
    completed,
  };
}

function viewOf(article: ArticleRecord, completed: boolean): ArticleView {
  return {
    ...summaryOf(article, completed),
    source: article.source,
    authors: article.authors,
    license: article.license,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    text: article.text,
    estLevel: article.estLevel,
    annotations: article.annotations,
  };
}

function sessionView(session: SessionRecord, savedWords: string[]): ReadingSessionView {
  const retell = entriesOf(session, "retell").at(-1);
  return {
    step: stepOf(session),
    prediction: session.prediction,
    answers: entriesOf(session, "question")
      .map(({ qid, answer, grade }) => ({ qid, answer, grade }))
      .sort((a, b) => a.qid - b.qid),
    spots: session.spots,
    spotsRevealed: entriesOf(session, "spots-revealed").length > 0,
    retell: retell ? { text: retell.text, grade: retell.grade } : null,
    opinion: session.opinion,
    savedWords,
    completedAt: session.completedAt?.toISOString() ?? null,
  };
}

/** The paragraph that contains a quote: enough context to judge an explanation. */
function paragraphWith(text: string, quote: string): string {
  const range = findQuote(text, quote);
  if (!range) return quote;
  return paragraphsOf(text).find((p) => p.includes(text.slice(range.start, range.end))) ?? quote;
}

// ---------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------

export function createReading(deps: ReadingDeps) {
  const { store, editor } = deps;
  const today = deps.today ?? (() => localDate(new Date()));

  async function articleOr404(userId: string, id: string): Promise<ArticleRecord> {
    const found = await store.getArticle(userId, id);
    if (!found) throw new ReadingError("not_found", "Article not found");
    return found;
  }

  async function sessionFor(userId: string, articleId: string): Promise<SessionRecord> {
    return (await store.getSession(userId, articleId)) ?? emptySession(articleId);
  }

  async function detailOf(
    userId: string,
    article: ArticleRecord,
    session?: SessionRecord,
  ): Promise<ArticleDetail> {
    const current = session ?? (await sessionFor(userId, article.id));
    const [savedWords, unit] = await Promise.all([
      store.savedWords(userId, article.id),
      store.currentUnit(userId),
    ]);
    return {
      article: viewOf(article, current.completedAt !== null),
      session: sessionView(current, savedWords),
      unit,
      spotTarget: Math.min(SPOT_TARGET, article.annotations?.grammarSpots.length ?? 0),
    };
  }

  /** Loads, mutates and saves the session of an article that is not completed yet. */
  async function update(
    userId: string,
    articleId: string,
    mutate: (session: SessionRecord, article: ArticleRecord) => void | Promise<void>,
  ) {
    const article = await articleOr404(userId, articleId);
    const session = await sessionFor(userId, articleId);
    await mutate(session, article);
    return { article, session: await store.saveSession(userId, session) };
  }

  function annotationsOf(article: ArticleRecord) {
    if (!article.annotations) {
      throw new ReadingError("not_annotated", "This article has no annotations yet");
    }
    return article.annotations;
  }

  async function gloss(
    userId: string,
    article: ArticleRecord,
    session: SessionRecord,
    word: string,
    sentence: string,
  ): Promise<{ gloss: GlossWordOutput; source: GlossResponse["source"] }> {
    const key = wordKey(word);
    const entry = article.annotations?.glossary.find(
      (g) => wordKey(g.term) === key || wordKey(g.lemma) === key,
    );
    if (entry) {
      const { term: _term, ...rest } = entry;
      return { gloss: rest, source: "glossary" };
    }
    const cached = entriesOf(session, "gloss").find((g) => g.word === key);
    if (cached) return { gloss: cached.gloss, source: "cache" };
    const fresh = await runReadingAi(deps.ai, userId, "gloss_word", { word, sentence });
    if (!fresh) throw new ReadingError("ai-unavailable", "The glossary is unavailable right now");
    session.entries.push({ type: "gloss", word: key, gloss: fresh });
    return { gloss: fresh, source: "ai" };
  }

  async function recallState(userId: string) {
    const date = addDays(today(), -1);
    const article = await store.getArticleForDate(userId, date);
    const session = article ? await store.getSession(userId, article.id) : undefined;
    if (!article || !session?.completedAt) return undefined;
    return { article, session };
  }

  function recallQuestions(session: SessionRecord): RecallQuestionView[] {
    const cached = entriesOf(session, "recall-questions").at(-1);
    if (!cached) return [];
    const answers = entriesOf(session, "recall-answer");
    return cached.questions.map((q, qid) => {
      const answer = answers.find((a) => a.qid === qid);
      return { ...q, qid, answer: answer?.answer ?? null, grade: answer?.grade ?? null };
    });
  }

  const recallDone = (questions: RecallQuestionView[]) =>
    questions.length > 0 && questions.every((q) => q.answer !== null);

  return {
    async today(userId: string): Promise<TodayResponse> {
      const date = today();
      const article = await store.getArticleForDate(userId, date);
      return {
        date,
        reading: article ? await detailOf(userId, article) : null,
        editorEnabled: deps.editorEnabled ?? true,
      };
    },

    async list(userId: string): Promise<ArticlesListResponse> {
      const articles = await store.listDailyArticles(userId);
      return { articles: articles.map((a) => summaryOf(a, a.completed)) };
    },

    async detail(userId: string, id: string): Promise<ArticleDetail> {
      return detailOf(userId, await articleOr404(userId, id));
    },

    runEditor(userId: string): Promise<EditorRunResponse> {
      return editor.run(userId, today());
    },

    /** Retries annotation for an article stored without it. */
    async annotate(userId: string, id: string): Promise<ArticleDetail> {
      const article = await articleOr404(userId, id);
      if (!article.annotations) {
        const annotations = await editor.annotate(userId, article);
        if (!annotations) {
          throw new ReadingError("ai-unavailable", "Annotations are unavailable right now");
        }
        await store.setAnnotations(id, annotations);
        article.annotations = annotations;
      }
      return detailOf(userId, article);
    },

    async prediction(userId: string, id: string, prediction: string): Promise<ArticleDetail> {
      const { article, session } = await update(userId, id, (s) => {
        const wasPredict = stepOf(s) === "predict";
        s.prediction = prediction;
        if (wasPredict) upsert(s, { type: "step", step: "read" }, (e) => e.type === "step");
      });
      return detailOf(userId, article, session);
    },

    async step(userId: string, id: string, step: ReadingStep): Promise<ArticleDetail> {
      if (step === "done") throw new ReadingError("invalid", "Use complete to finish the reading");
      const { article, session } = await update(userId, id, (s) => {
        upsert(s, { type: "step", step }, (e) => e.type === "step");
      });
      return detailOf(userId, article, session);
    },

    async gloss(
      userId: string,
      id: string,
      word: string,
      sentence: string,
    ): Promise<GlossResponse> {
      let result: Awaited<ReturnType<typeof gloss>> | undefined;
      await update(userId, id, async (session, article) => {
        result = await gloss(userId, article, session, word, sentence);
      });
      const saved = await store.findWordCard(userId, id, wordKey(word));
      if (!result)
        throw new ReadingError("ai-unavailable", "The glossary is unavailable right now");
      return { ...result.gloss, word, source: result.source, saved: saved !== undefined };
    },

    async saveWord(
      userId: string,
      id: string,
      word: string,
      sentence: string,
    ): Promise<SaveWordResponse> {
      const key = wordKey(word);
      const existing = await store.findWordCard(userId, id, key);
      if (existing) return { cardId: existing, word: key, created: false };
      let entry: GlossWordOutput | undefined;
      const { article } = await update(userId, id, async (session, a) => {
        entry = (await gloss(userId, a, session, word, sentence)).gloss;
      });
      if (!entry) throw new ReadingError("ai-unavailable", "The glossary is unavailable right now");
      const cardId = await store.insertWordCard(userId, {
        articleId: id,
        word: key,
        front: `${word.trim()}\n${sentence}`,
        back: `${entry.glossEs} (${entry.partOfSpeech}) — ${entry.definitionEn}\nExample: ${entry.example}`,
        ref: {
          articleTitle: article.title,
          sentence,
          lemma: entry.lemma,
          partOfSpeech: entry.partOfSpeech,
        },
      });
      return { cardId, word: key, created: true };
    },

    async answer(
      userId: string,
      id: string,
      qid: number,
      answer: string,
    ): Promise<QuestionGradeResponse> {
      let response: QuestionGradeResponse | undefined;
      await update(userId, id, async (session, article) => {
        const question = annotationsOf(article).questions[qid];
        if (!question) throw new ReadingError("not_found", "Question not found");
        const grade = await runReadingAi(deps.ai, userId, "grade_comprehension", {
          mode: "question",
          question: question.question,
          answerGuideEs: question.answerGuideEs,
          articleText: article.text,
          answer,
        });
        upsert(
          session,
          { type: "question", qid, answer, grade: grade ?? null },
          (e) => e.type === "question" && e.qid === qid,
        );
        response = {
          qid,
          grade: grade ?? null,
          answerGuideEs: question.answerGuideEs,
          ...(grade ? {} : { error: "ai-unavailable" as const }),
        };
      });
      return response as QuestionGradeResponse;
    },

    async spot(userId: string, id: string, request: SpotRequest): Promise<SpotResponse> {
      let response: SpotResponse | undefined;
      await update(userId, id, async (session, article) => {
        const spots = annotationsOf(article).grammarSpots;
        const spotIndex = matchSpot(
          article.text,
          { text: request.text, start: request.start },
          spots.map((s) => s.quote),
        );
        const matched = spotIndex === null ? undefined : spots[spotIndex];
        let feedback: SpotResponse["attempt"]["feedback"];
        if (matched && request.explanation) {
          // No dedicated AI function: judged as a comprehension question about the writer's choice.
          feedback =
            (await runReadingAi(deps.ai, userId, "grade_comprehension", {
              mode: "question",
              question: `Why did the writer use "${matched.form}" in: "${matched.quote}"?`,
              answerGuideEs: matched.whyEs,
              articleText: paragraphWith(article.text, matched.quote),
              answer: request.explanation,
            })) ?? null;
        }
        const attempt = {
          text: request.text.trim(),
          spotIndex,
          ...(request.explanation ? { explanation: request.explanation, feedback } : {}),
        };
        session.spots = [...session.spots, attempt];
        const found = [
          ...new Set(session.spots.flatMap((s) => (s.spotIndex === null ? [] : [s.spotIndex]))),
        ];
        response = {
          attempt,
          found,
          target: Math.min(SPOT_TARGET, spots.length),
          ...(feedback === null ? { error: "ai-unavailable" as const } : {}),
        };
      });
      return response as SpotResponse;
    },

    async revealSpots(userId: string, id: string): Promise<ArticleDetail> {
      const { article, session } = await update(userId, id, (s) => {
        upsert(s, { type: "spots-revealed" }, (e) => e.type === "spots-revealed");
      });
      return detailOf(userId, article, session);
    },

    async retell(userId: string, id: string, text: string): Promise<RetellResponse> {
      let grade: RetellResponse["grade"] = null;
      await update(userId, id, async (session, article) => {
        grade =
          (await runReadingAi(deps.ai, userId, "grade_comprehension", {
            mode: "retell",
            articleText: article.text,
            answer: text,
          })) ?? null;
        upsert(session, { type: "retell", text, grade }, (e) => e.type === "retell");
      });
      return grade ? { grade } : { grade: null, error: "ai-unavailable" };
    },

    async opinion(userId: string, id: string, opinion: string): Promise<ArticleDetail> {
      const { article, session } = await update(userId, id, (s) => {
        s.opinion = opinion;
      });
      return detailOf(userId, article, session);
    },

    async complete(userId: string, id: string): Promise<ArticleDetail> {
      const article = await articleOr404(userId, id);
      let session = await sessionFor(userId, id);
      if (!session.id) session = await store.saveSession(userId, session);
      if (!session.completedAt && session.id) {
        const savedWords = await store.savedWords(userId, id);
        await store.completeSession(userId, session.id, {
          articleId: id,
          title: article.title,
          topic: article.topic,
          wordCount: countWords(article.text),
          savedWords: savedWords.length,
          hasOpinion: session.opinion !== null,
        });
      }
      return detailOf(userId, article);
    },

    async recall(userId: string): Promise<RecallResponse> {
      const state = await recallState(userId);
      if (!state) return { status: "none", article: null, questions: [] };
      const { article, session } = state;
      const ref = { id: article.id, title: article.title };
      let questions = recallQuestions(session);
      if (questions.length === 0) {
        const generated = await runReadingAi(deps.ai, userId, "recall_questions", {
          article: { title: article.title, text: article.text },
          savedWords: await store.savedWords(userId, article.id),
          opinion: session.opinion ?? undefined,
        });
        if (!generated) return { status: "ai-unavailable", article: ref, questions: [] };
        session.entries.push({ type: "recall-questions", questions: generated.questions });
        await store.saveSession(userId, session);
        questions = recallQuestions(session);
      }
      return { status: recallDone(questions) ? "done" : "ready", article: ref, questions };
    },

    async recallAnswer(userId: string, qid: number, answer: string): Promise<RecallAnswerResponse> {
      const state = await recallState(userId);
      const question = state ? recallQuestions(state.session)[qid] : undefined;
      if (!state || !question) throw new ReadingError("not_found", "Recall question not found");
      const { article, session } = state;
      const wasDone = recallDone(recallQuestions(session));
      const grade =
        (await runReadingAi(deps.ai, userId, "grade_comprehension", {
          mode: "question",
          question: question.question,
          answerGuideEs: question.answerGuideEs,
          articleText: article.text,
          answer,
        })) ?? null;
      upsert(
        session,
        { type: "recall-answer", qid, answer, grade },
        (e) => e.type === "recall-answer" && e.qid === qid,
      );
      await store.saveSession(userId, session);
      const questions = recallQuestions(session);
      const done = recallDone(questions);
      if (done && !wasDone) {
        await store.insertEvent(userId, "reading_recall_completed", {
          articleId: article.id,
          scores: questions.map((q) => q.grade?.score ?? null),
        });
      }
      return {
        question: questions[qid] as RecallQuestionView,
        done,
        ...(grade ? {} : { error: "ai-unavailable" as const }),
      };
    },
  };
}

export type Reading = ReturnType<typeof createReading>;
