import {
  ArticleDetail,
  ArticlesListResponse,
  EditorRunResponse,
  GlossResponse,
  QuestionGradeResponse,
  RecallAnswerResponse,
  RecallResponse,
  RetellResponse,
  SaveWordResponse,
  SpotResponse,
  TodayResponse,
} from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createAuth } from "../auth/auth.ts";
import { createSettings } from "../settings/settings.service.ts";
import { createMemorySettingsStore } from "../settings/settings.store.ts";
import { LlmError } from "../shared/llm/errors.ts";
import { createFakeLlm, type FakeLlm } from "../shared/llm/fake.ts";
import { createEditor } from "./editor.ts";
import { createMemoryReadingStore, type MemoryReadingStore } from "./reading.memory-store.ts";
import { createReading } from "./reading.service.ts";
import {
  ARTICLE_TEXT,
  annotations,
  candidate,
  fakeSource,
  gradeReply,
} from "./reading.test-support.ts";

const APP_SECRET = "cd".repeat(32);
const PASSWORD = "pw";
const TODAY = "2026-10-25";

type Setup = { llm?: FakeLlm; today?: string; store?: MemoryReadingStore };

async function setup(options: Setup = {}) {
  const store = options.store ?? createMemoryReadingStore();
  const llm = options.llm ?? createFakeLlm();
  const settings = createSettings({
    store: createMemorySettingsStore(),
    appSecret: APP_SECRET,
    createClient: () => llm,
  });
  const source = fakeSource([candidate({ url: "https://a.test/robots" })]);
  const editor = createEditor({ store, sources: [source], ai: settings });
  const reading = createReading({
    store,
    editor,
    ai: settings,
    today: () => options.today ?? TODAY,
  });
  const auth = createAuth({ password: PASSWORD, appSecret: APP_SECRET });
  const app = createApp({ pingDb: async () => true, auth, reading });
  const login = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
    app.request(`/api/reading${path}`, {
      method: init.method ?? "GET",
      headers: { cookie, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const post = (path: string, body: unknown = {}) => call(path, { method: "POST", body });
  return { app, call, post, store, llm };
}

/** Stores today's article directly (no editor run), annotated unless told otherwise. */
function seedArticle(store: MemoryReadingStore, date = TODAY, annotated = true) {
  const id = crypto.randomUUID();
  store.articles.push({
    id,
    source: "theconversation",
    url: `https://a.test/${date}`,
    title: "Robots that sort recycling",
    authors: ["Ada Lovelace, Professor, Example University"],
    outlet: "The Conversation",
    license: "CC BY-ND 4.0",
    publishedAt: new Date("2026-10-24T10:00:00Z"),
    text: ARTICLE_TEXT,
    topic: "tech",
    estLevel: "B1",
    selectedFor: date,
    annotations: annotated ? annotations() : null,
  });
  return id;
}

describe("reading routes", () => {
  it("require a session", async () => {
    const { app } = await setup();
    expect((await app.request("/api/reading/today")).status).toBe(401);
  });

  it("show an empty today, then run the editor and serve the article", async () => {
    const llm = createFakeLlm({ failWith: new LlmError("not_configured", "no key") });
    const { call, post } = await setup({ llm });
    const empty = TodayResponse.parse(await (await call("/today")).json());
    expect(empty).toMatchObject({ date: TODAY, reading: null });

    const run = EditorRunResponse.parse(await (await post("/editor/run")).json());
    expect(run).toMatchObject({ status: "selected", selection: "fallback", annotated: false });

    const today = TodayResponse.parse(await (await call("/today")).json());
    expect(today.reading?.article).toMatchObject({
      title: "Title of https://a.test/robots",
      license: "CC BY-ND 4.0",
      annotations: null,
      completed: false,
    });
    expect(today.reading?.article.text).toBe(ARTICLE_TEXT);
    expect(today.reading?.session.step).toBe("predict");

    const history = ArticlesListResponse.parse(await (await call("/articles")).json());
    expect(history.articles).toHaveLength(1);
  });

  it("retry annotation for an article stored without it", async () => {
    const llm = createFakeLlm({ jsonReplies: [JSON.stringify(annotations())] });
    const { post, store } = await setup({ llm });
    const id = seedArticle(store, TODAY, false);
    expect((await post(`/articles/${id}/questions/0`, { answer: "x" })).status).toBe(409);
    const detail = ArticleDetail.parse(await (await post(`/articles/${id}/annotate`)).json());
    expect(detail.article.annotations?.questions).toHaveLength(3);
    expect(detail.spotTarget).toBe(2);
  });

  it("walk the 6 steps and complete with an event", async () => {
    const llm = createFakeLlm({
      jsonReplies: [
        gradeReply(2),
        gradeReply(1, { hintEs: "Relee el párrafo 2." }),
        gradeReply(2, { missingPointsEs: ["El costo"] }),
      ],
    });
    const { call, post, store } = await setup({ llm });
    const id = seedArticle(store);

    let detail = ArticleDetail.parse(
      await (await post(`/articles/${id}/prediction`, { prediction: "Robots and trash" })).json(),
    );
    expect(detail.session).toMatchObject({ step: "read", prediction: "Robots and trash" });

    detail = ArticleDetail.parse(
      await (await post(`/articles/${id}/step`, { step: "questions" })).json(),
    );
    expect(detail.session.step).toBe("questions");

    const q0 = QuestionGradeResponse.parse(
      await (await post(`/articles/${id}/questions/0`, { answer: "Because cities grow." })).json(),
    );
    expect(q0).toMatchObject({ qid: 0, grade: { score: 2 }, answerGuideEs: "Guía 0" });
    const q1 = QuestionGradeResponse.parse(
      await (await post(`/articles/${id}/questions/1`, { answer: "No idea" })).json(),
    );
    expect(q1.grade?.hintEs).toBe("Relee el párrafo 2.");
    expect((await post(`/articles/${id}/questions/7`, { answer: "x" })).status).toBe(404);

    const miss = SpotResponse.parse(
      await (await post(`/articles/${id}/spots`, { text: "small robots" })).json(),
    );
    expect(miss).toMatchObject({ attempt: { spotIndex: null }, found: [], target: 2 });
    const hit = SpotResponse.parse(
      await (await post(`/articles/${id}/spots`, { text: "is growing" })).json(),
    );
    expect(hit).toMatchObject({ attempt: { spotIndex: 0 }, found: [0] });
    await post(`/articles/${id}/spots/reveal`);

    const retell = RetellResponse.parse(
      await (
        await post(`/articles/${id}/retell`, { text: "Robots sort. Cities grow. Plants work." })
      ).json(),
    );
    expect(retell.grade?.missingPointsEs).toEqual(["El costo"]);
    const gradePrompt = llm.calls.at(-1)?.req?.messages.at(-1)?.content ?? "";
    expect(gradePrompt).toContain("Mode: retell");

    await post(`/articles/${id}/opinion`, { opinion: "I would trust them." });
    detail = ArticleDetail.parse(await (await post(`/articles/${id}/complete`)).json());
    expect(detail.session).toMatchObject({
      step: "done",
      opinion: "I would trust them.",
      spotsRevealed: true,
      retell: { text: "Robots sort. Cities grow. Plants work." },
    });
    expect(detail.session.answers.map((a) => a.qid)).toEqual([0, 1]);
    expect(detail.article.completed).toBe(true);

    await post(`/articles/${id}/complete`);
    expect(store.events.filter((e) => e.type === "reading_completed")).toHaveLength(1);
    expect(store.events[0]?.payload).toMatchObject({
      articleId: id,
      title: "Robots that sort recycling",
    });

    const history = ArticlesListResponse.parse(await (await call("/articles")).json());
    expect(history.articles[0]?.completed).toBe(true);
  });

  it("keep answers when the AI is unavailable", async () => {
    const llm = createFakeLlm({ failWith: new LlmError("network", "offline") });
    const { post, call, store } = await setup({ llm });
    const id = seedArticle(store);
    const q = QuestionGradeResponse.parse(
      await (await post(`/articles/${id}/questions/2`, { answer: "Maybe" })).json(),
    );
    expect(q).toMatchObject({ grade: null, error: "ai-unavailable" });
    const retell = RetellResponse.parse(
      await (await post(`/articles/${id}/retell`, { text: "A." })).json(),
    );
    expect(retell).toEqual({ grade: null, error: "ai-unavailable" });
    const detail = ArticleDetail.parse(await (await call(`/articles/${id}`)).json());
    expect(detail.session.answers).toEqual([{ qid: 2, answer: "Maybe", grade: null }]);
  });

  it("gloss from the glossary, then the AI with a per-article cache, and save words as SRS cards", async () => {
    const llm = createFakeLlm({
      jsonReplies: [
        JSON.stringify({
          lemma: "engineer",
          partOfSpeech: "noun",
          glossEs: "ingeniero",
          definitionEn: "a person who designs machines",
          example: "My sister is an engineer.",
        }),
      ],
    });
    const { post, store } = await setup({ llm });
    const id = seedArticle(store);
    const sentence =
      "Engineers are testing small robots that sort plastic in a busy recycling plant.";

    const fromGlossary = GlossResponse.parse(
      await (await post(`/articles/${id}/gloss`, { word: "Sort", sentence })).json(),
    );
    expect(fromGlossary).toMatchObject({ source: "glossary", glossEs: "clasificar", saved: false });

    const fromAi = GlossResponse.parse(
      await (await post(`/articles/${id}/gloss`, { word: "Engineers", sentence })).json(),
    );
    expect(fromAi).toMatchObject({ source: "ai", glossEs: "ingeniero" });
    const cached = GlossResponse.parse(
      await (await post(`/articles/${id}/gloss`, { word: "engineers", sentence })).json(),
    );
    expect(cached.source).toBe("cache");
    expect(llm.calls.filter((c) => c.method === "chatJson")).toHaveLength(1);

    const saved = SaveWordResponse.parse(
      await (await post(`/articles/${id}/save-word`, { word: "Engineers", sentence })).json(),
    );
    expect(saved).toMatchObject({ word: "engineers", created: true });
    const again = SaveWordResponse.parse(
      await (await post(`/articles/${id}/save-word`, { word: "engineers", sentence })).json(),
    );
    expect(again).toMatchObject({ cardId: saved.cardId, created: false });
    expect(store.cards).toHaveLength(1);
    expect(store.cards[0]).toMatchObject({
      word: "engineers",
      front: `Engineers\n${sentence}`,
      back: expect.stringContaining("ingeniero"),
      ref: expect.objectContaining({ sentence, lemma: "engineer" }),
    });
    const glossAfter = GlossResponse.parse(
      await (await post(`/articles/${id}/gloss`, { word: "engineers", sentence })).json(),
    );
    expect(glossAfter.saved).toBe(true);
  });

  it("answer 503 for a gloss when the AI is unavailable and 404 for unknown articles", async () => {
    const llm = createFakeLlm({ failWith: new LlmError("network", "offline") });
    const { post, call, store } = await setup({ llm });
    const id = seedArticle(store);
    const res = await post(`/articles/${id}/gloss`, { word: "robots", sentence: "Robots work." });
    expect(res.status).toBe(503);
    expect((await call(`/articles/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await post(`/articles/${id}/prediction`, {})).status).toBe(400);
  });

  it("serve next-day recall for yesterday's completed article", async () => {
    const llm = createFakeLlm({
      jsonReplies: [
        JSON.stringify({
          questions: [
            { type: "recall", question: "What was the article about?", answerGuideEs: "Robots." },
            { type: "word", question: "Use 'sort' in a sentence.", answerGuideEs: "Uso correcto." },
            { type: "inference", question: "Why does it matter?", answerGuideEs: "Reciclaje." },
          ],
        }),
        gradeReply(2),
        gradeReply(1),
        gradeReply(2),
      ],
    });
    const { call, post, store } = await setup({ llm });
    expect(RecallResponse.parse(await (await call("/recall")).json()).status).toBe("none");

    const id = seedArticle(store, "2026-10-24");
    await post(`/articles/${id}/opinion`, { opinion: "Robots help." });
    expect(RecallResponse.parse(await (await call("/recall")).json()).status).toBe("none");
    await post(`/articles/${id}/complete`);

    const recall = RecallResponse.parse(await (await call("/recall")).json());
    expect(recall).toMatchObject({ status: "ready", article: { id } });
    expect(recall.questions).toHaveLength(3);
    // Cached per article: a second load does not call the AI again.
    await call("/recall");
    expect(llm.calls.filter((c) => c.method === "chatJson")).toHaveLength(1);

    for (const qid of [0, 1, 2]) {
      const answer = RecallAnswerResponse.parse(
        await (await post(`/recall/${qid}`, { answer: "Robots sort trash." })).json(),
      );
      expect(answer.done).toBe(qid === 2);
    }
    expect(RecallResponse.parse(await (await call("/recall")).json()).status).toBe("done");
    expect(store.events.filter((e) => e.type === "reading_recall_completed")).toHaveLength(1);
    expect((await post("/recall/9", { answer: "x" })).status).toBe(404);
  });
});
