import type {
  LevelView,
  MissionView,
  SubmissionView,
  WritingErrorView,
  WritingMissionResponse,
} from "@english-course/shared";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Handler, mockApi, renderAt } from "../../test/render.tsx";

const level: LevelView = { level: 1, format: "tweet", completed: 0, needed: 3, average: null };

const mission: MissionView = {
  id: "m1",
  level: 1,
  format: "tweet",
  title: "The story behind the news",
  topic: "Recycling robots",
  promptEn: "Tell what happened when the robots arrived.",
  whyEs: "Practica el pasado simple.",
  targetUnit: { id: 5, title: "Simple Past" },
  grammarTargets: ["simple past for the events"],
  suggestedWords: ["sort"],
  limits: { minWords: 15, maxWords: 50, maxChars: 280 },
  inspiration: [{ title: "Robots that sort recycling", opinion: "Robots help." }],
  source: "ai",
  createdAt: "2026-10-25T08:00:00.000Z",
};

const DRAFT = "Yesterday the company launch a new robot. It sort trash very fast.";

const can = (patch: Partial<SubmissionView["can"]> = {}): SubmissionView["can"] => ({
  saveDraft: true,
  submit: true,
  recheck: false,
  rewrite: false,
  complete: false,
  skip: true,
  markPublished: false,
  ...patch,
});

const error = (patch: Partial<WritingErrorView>): WritingErrorView => ({
  id: "x1",
  span: "launch",
  type: "grammar",
  unit: { id: 5, title: "Simple Past" },
  hintEs: "Pasado simple: piensa en la terminación.",
  status: "open",
  feedbackEs: null,
  origin: "review",
  reveal: null,
  ...patch,
});

function submission(patch: Partial<SubmissionView> = {}): SubmissionView {
  return {
    id: "s1",
    status: "draft",
    round: 0,
    maxRounds: 2,
    text: "",
    submittedText: null,
    scores: null,
    overall: null,
    strengthEs: null,
    errors: [],
    rewrites: [],
    publishedAt: null,
    publishedVersion: null,
    completedAt: null,
    can: can(),
    ...patch,
  };
}

const respond = (sub: SubmissionView, extra: Partial<WritingMissionResponse> = {}) =>
  Response.json({ level, mission, submission: sub, ...extra });

const reviewed = submission({
  status: "reviewed",
  text: DRAFT,
  submittedText: DRAFT,
  scores: { grammar: 60, clarity: 80, vocabulary: 70, naturalness: 66 },
  overall: 69,
  strengthEs: "Buen uso de 'Yesterday'.",
  errors: [
    error({ id: "x1", span: "launch" }),
    error({ id: "x2", span: "It sort", unit: null, hintEs: "Mira el sujeto: it." }),
  ],
  can: can({ submit: false, recheck: true }),
});

function writingApi(current: SubmissionView | null, handlers: Record<string, Handler> = {}) {
  return mockApi({
    "GET /api/auth/me": () => Response.json({ authenticated: true }),
    "GET /api/writing/missions/current": () =>
      Response.json({ level, mission: current ? mission : null, submission: current }),
    ...handlers,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("WritingPage", () => {
  it("generates a mission and shows its goal and inspiration", async () => {
    writingApi(null, {
      "POST /api/writing/missions/generate": () => respond(submission()),
    });
    renderAt("/writing");
    fireEvent.click(await screen.findByRole("button", { name: "Get a mission" }));
    expect(await screen.findByRole("heading", { name: mission.title })).toBeTruthy();
    expect(screen.getByText(/Unit 5 · Simple Past/)).toBeTruthy();
    expect(screen.getByText(/Robots help\./)).toBeTruthy();
    expect(screen.getByText(/0 \/ 50 words/)).toBeTruthy();
  });

  it("submits the text and shows highlighted spans with Spanish hints, never corrections", async () => {
    const calls: unknown[] = [];
    writingApi(submission(), {
      "POST /api/writing/missions/m1/submit": ({ body }) => {
        calls.push(body);
        return respond(reviewed);
      },
    });
    renderAt("/writing");
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: DRAFT } });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));

    const list = await screen.findByRole("list", { name: "Errors to fix" });
    expect(calls).toEqual([{ text: DRAFT }]);
    expect(within(list).getByText("Pasado simple: piensa en la terminación.")).toBeTruthy();
    expect(within(list).getByText("Mira el sujeto: it.")).toBeTruthy();
    const marks = screen.getByTestId("highlighted-text").querySelectorAll("mark");
    expect([...marks].map((m) => m.firstChild?.textContent)).toEqual(["launch", "It sort"]);
    expect(screen.queryByText(/launched/)).toBeNull();
    expect(screen.queryByText(/Correct form/)).toBeNull();
    expect(screen.getByRole("button", { name: "Check my fixes (1 of 2)" })).toBeTruthy();
  });

  it("keeps the text and explains when the AI is unavailable", async () => {
    writingApi(submission({ text: DRAFT }), {
      "POST /api/writing/missions/m1/submit": () =>
        respond(submission({ text: DRAFT }), { error: "ai-unavailable" }),
    });
    renderAt("/writing");
    fireEvent.click(await screen.findByRole("button", { name: "Submit for review" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/not available/);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(DRAFT);
  });

  it("rechecks the fixed text and updates each error's status", async () => {
    const fixedText = "Yesterday the company launched a new robot. It sort trash very fast.";
    writingApi(reviewed, {
      "POST /api/writing/missions/m1/recheck": ({ body }) => {
        expect(body).toEqual({ text: fixedText });
        return respond({
          ...reviewed,
          status: "rechecked",
          round: 1,
          text: fixedText,
          errors: [
            error({ id: "x1", status: "fixed", feedbackEs: "Bien: pasado simple." }),
            error({
              id: "x2",
              span: "It sort",
              status: "remaining",
              hintEs: "Mira el sujeto: it.",
            }),
          ],
        });
      },
    });
    renderAt("/writing");
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: fixedText } });
    fireEvent.click(screen.getByRole("button", { name: "Check my fixes (1 of 2)" }));

    expect(await screen.findByText("Fixed")).toBeTruthy();
    expect(screen.getByText("Not changed yet")).toBeTruthy();
    expect(screen.getByText("Bien: pasado simple.")).toBeTruthy();
    const marks = screen.getByTestId("highlighted-text").querySelectorAll("mark");
    expect([...marks].map((m) => m.firstChild?.textContent)).toEqual(["It sort"]);
  });

  it("shows rewrites next to the learner's text and copies a version", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    writingApi(
      submission({
        ...reviewed,
        status: "rewritten",
        text: "Yesterday the company launched a robot.",
        rewrites: [
          {
            register: "casual",
            text: "The company just launched a robot.",
            noteEs: "just + pasado",
          },
          { register: "professional", text: "The company launched a robot.", noteEs: "Directo." },
        ],
        can: can({ saveDraft: false, submit: false, complete: true, markPublished: true }),
      }),
    );
    renderAt("/writing");
    const casual = await screen.findByRole("article", { name: "Casual (X)" });
    expect(screen.getByRole("article", { name: "My version" }).textContent).toContain(
      "Yesterday the company launched a robot.",
    );
    fireEvent.click(within(casual).getByRole("button", { name: "Copy Casual (X)" }));
    expect(await within(casual).findByText("Copied")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith("The company just launched a robot.");
  });
});
