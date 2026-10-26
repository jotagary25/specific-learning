import type { ArticleDetail, ReadingStep, RecallResponse } from "@english-course/shared";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Handler, mockApi, renderAt } from "../../test/render.tsx";

const TEXT =
  "Engineers are testing small robots in a busy plant.\n\nThe city is growing fast, and the plant is working day and night.";

function detail(
  step: ReadingStep,
  overrides: Partial<ArticleDetail["session"]> = {},
): ArticleDetail {
  return {
    article: {
      id: "a1",
      title: "Robots that sort recycling",
      url: "https://theconversation.com/robots-1",
      outlet: "The Conversation",
      topic: "tech",
      selectedFor: "2026-10-25",
      wordCount: 22,
      completed: step === "done",
      source: "theconversation",
      authors: ["Ada Lovelace, Professor, Example University"],
      license: "CC BY-ND 4.0",
      publishedAt: "2026-10-24T10:00:00.000Z",
      text: TEXT,
      estLevel: "B1",
      annotations: {
        predictPrompt: "What are the robots doing?",
        glossary: [
          {
            term: "busy",
            lemma: "busy",
            partOfSpeech: "adjective",
            glossEs: "concurrido",
            definitionEn: "full of activity",
            example: "The station is busy.",
          },
          {
            term: "plant",
            lemma: "plant",
            partOfSpeech: "noun",
            glossEs: "planta",
            definitionEn: "a factory",
            example: "The car plant closed.",
          },
          {
            term: "sort",
            lemma: "sort",
            partOfSpeech: "verb",
            glossEs: "clasificar",
            definitionEn: "to put into groups",
            example: "Sort the mail.",
          },
        ],
        grammarSpots: [
          { quote: "is growing fast", form: "present continuous", whyEs: "Cambio en curso." },
        ],
        questions: [0, 1, 2].map((n) => ({
          question: `Question ${n}?`,
          answerGuideEs: `Guía ${n}`,
        })),
        opinionPrompt: "Would you trust a robot?",
      },
    },
    session: {
      step,
      prediction: step === "predict" ? null : "Robots",
      answers: [],
      spots: [],
      spotsRevealed: false,
      retell: null,
      opinion: null,
      savedWords: [],
      completedAt: null,
      ...overrides,
    },
    unit: { id: 1, title: "Present continuous", grammarFocus: "Present continuous (I am doing)" },
    spotTarget: 1,
  };
}

const NO_RECALL: RecallResponse = { status: "none", article: null, questions: [] };

function readingApi(today: ArticleDetail | null, handlers: Record<string, Handler> = {}) {
  return mockApi({
    "GET /api/auth/me": () => Response.json({ authenticated: true }),
    "GET /api/reading/today": () =>
      Response.json({ date: "2026-10-25", reading: today, editorEnabled: true }),
    "GET /api/reading/recall": () => Response.json(NO_RECALL),
    ...handlers,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReadingPage", () => {
  it("shows the empty state and runs the editor on demand", async () => {
    let reading: ArticleDetail | null = null;
    const fetchMock = readingApi(null, {
      "GET /api/reading/today": () =>
        Response.json({ date: "2026-10-25", reading, editorEnabled: true }),
      "POST /api/reading/editor/run": () => {
        reading = detail("predict");
        return Response.json({
          date: "2026-10-25",
          status: "selected",
          articleId: "a1",
          title: "Robots that sort recycling",
          selection: "fallback",
          annotated: true,
          candidates: 3,
          sources: [],
          warnings: [],
        });
      },
    });
    renderAt("/reading");
    fireEvent.click(await screen.findByRole("button", { name: "Run editor now" }));
    expect(await screen.findByText("What are the robots doing?")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/reading/editor/run", expect.anything());
  });

  it("starts with the headline only, then saves the prediction", async () => {
    const posted: unknown[] = [];
    readingApi(detail("predict"), {
      "POST /api/reading/articles/a1/prediction": ({ body }) => {
        posted.push(body);
        return Response.json(detail("read"));
      },
    });
    renderAt("/reading");
    expect(await screen.findByText("Robots that sort recycling")).toBeTruthy();
    expect(screen.queryByText(/small robots/)).toBeNull();
    fireEvent.change(screen.getByLabelText("What are the robots doing?"), {
      target: { value: "Robots sorting trash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start reading" }));
    await waitFor(() => expect(posted).toEqual([{ prediction: "Robots sorting trash" }]));
  });

  it("shows attribution and saves a tapped word from its popover", async () => {
    const saved: unknown[] = [];
    readingApi(detail("read"), {
      "POST /api/reading/articles/a1/gloss": ({ body }) =>
        Response.json({
          word: (body as { word: string }).word,
          lemma: "robot",
          partOfSpeech: "noun",
          glossEs: "robot",
          definitionEn: "a machine that works by itself",
          example: "The robot cleans the floor.",
          source: "ai",
          saved: false,
        }),
      "POST /api/reading/articles/a1/save-word": ({ body }) => {
        saved.push(body);
        return Response.json({ cardId: "c1", word: "robots", created: true });
      },
    });
    renderAt("/reading");
    expect(await screen.findByText("Ada Lovelace, Professor, Example University")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Read the original" }).getAttribute("href")).toBe(
      "https://theconversation.com/robots-1",
    );
    expect(screen.getByRole("link", { name: "CC BY-ND 4.0" })).toBeTruthy();
    // Glossary words are marked.
    expect(screen.getAllByText("busy")[0]?.className).toMatch(/glossWord/);

    fireEvent.click(screen.getByText("robots"));
    const sheet = await screen.findByRole("dialog", { name: "Meaning of robots" });
    expect(await within(sheet).findByText("a machine that works by itself")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Save word" }));
    await waitFor(() =>
      expect(saved).toEqual([
        { word: "robots", sentence: "Engineers are testing small robots in a busy plant." },
      ]),
    );
    expect(await within(sheet).findByRole("button", { name: "Saved" })).toBeTruthy();
  });

  it("grades an inference question and shows feedback", async () => {
    let current = detail("questions");
    readingApi(null, {
      "GET /api/reading/today": () =>
        Response.json({ date: "2026-10-25", reading: current, editorEnabled: true }),
      "POST /api/reading/articles/a1/questions/0": ({ body }) => {
        const grade = { score: 1 as const, feedbackEs: "Casi.", hintEs: "Relee el final." };
        current = detail("questions", {
          answers: [{ qid: 0, answer: (body as { answer: string }).answer, grade }],
        });
        return Response.json({ qid: 0, grade, answerGuideEs: "Guía 0" });
      },
    });
    renderAt("/reading");
    fireEvent.change(await screen.findByLabelText("1. Question 0?"), {
      target: { value: "Because cities grow" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Answer" })[0] as HTMLElement);
    expect(await screen.findByText("Score 1/2")).toBeTruthy();
    expect(screen.getByText("💡 Relee el final.")).toBeTruthy();
  });

  it("checks a grammar-hunt example", async () => {
    readingApi(detail("spots"), {
      "POST /api/reading/articles/a1/spots": () =>
        Response.json({
          attempt: { text: "is growing", spotIndex: 0 },
          found: [0],
          target: 1,
        }),
    });
    renderAt("/reading");
    expect(await screen.findByText(/Find 1 example of Present continuous/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Example"), { target: { value: "is growing" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText(/Yes! “is growing fast”/)).toBeTruthy();
  });

  it("hides the article during the retell", async () => {
    readingApi(detail("retell"));
    renderAt("/reading");
    expect(await screen.findByLabelText(/Write 3 sentences/)).toBeTruthy();
    expect(screen.getByText("The article is hidden. Retell it from memory.")).toBeTruthy();
    expect(screen.queryByText(/small robots/)).toBeNull();
    expect(screen.queryByText("robots")).toBeNull();
  });

  it("resumes at the saved step and lets the learner revisit earlier ones only", async () => {
    readingApi(detail("questions"));
    renderAt("/reading");
    const steps = await screen.findByRole("navigation", { name: "Reading steps" });
    expect(
      within(steps)
        .getByRole("button", { name: /Questions/ })
        .getAttribute("aria-current"),
    ).toBe("step");
    expect(
      within(steps)
        .getByRole("button", { name: /Retell/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(within(steps).getByRole("button", { name: /Read/ }));
    expect(await screen.findByText("Tap a word to see its meaning and save it.")).toBeTruthy();
  });

  it("shows the recall card for yesterday's article", async () => {
    readingApi(detail("done", { completedAt: "2026-10-25T10:00:00.000Z" }), {
      "GET /api/reading/recall": () =>
        Response.json({
          status: "ready",
          article: { id: "y1", title: "Yesterday's story" },
          questions: [
            {
              qid: 0,
              type: "recall",
              question: "What was it about?",
              answerGuideEs: "La idea.",
              answer: null,
              grade: null,
            },
          ],
        } satisfies RecallResponse),
    });
    renderAt("/reading");
    expect(await screen.findByText("2-minute recall: Yesterday's story")).toBeTruthy();
    expect(screen.getByLabelText("What was it about?")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Reading completed" })).toBeTruthy();
  });

  it("lists past readings", async () => {
    mockApi({
      "GET /api/auth/me": () => Response.json({ authenticated: true }),
      "GET /api/reading/articles": () =>
        Response.json({
          articles: [
            {
              id: "a1",
              title: "Robots that sort recycling",
              url: "https://x.test",
              outlet: "The Conversation",
              topic: "tech",
              selectedFor: "2026-10-25",
              wordCount: 800,
              completed: true,
            },
          ],
        }),
    });
    renderAt("/reading/history");
    const link = await screen.findByRole("link", { name: /Robots that sort recycling/ });
    expect(link.getAttribute("href")).toBe("/reading/a1");
    expect(within(link).getByText("Done")).toBeTruthy();
  });
});
