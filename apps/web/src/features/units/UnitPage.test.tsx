import type { AttemptResponse, ItemCheckResult } from "@english-course/shared";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Handler, mockApi, renderAt } from "../../test/render.tsx";
import { unitFixture } from "./units.fixture.ts";

const completion = { graded: 1, correct: 0, almost: 0, pending: 0, ratio: 0, completed: false };

function attemptReply(result: ItemCheckResult, extra: Partial<AttemptResponse> = {}) {
  return Response.json({
    itemId: "1.1-2",
    status: result.status,
    result,
    method: "deterministic",
    attemptNo: 1,
    completion,
    unitCompleted: false,
    canDoEs: [],
    ...extra,
  } satisfies AttemptResponse);
}

function unitApi(handlers: Record<string, Handler> = {}) {
  const attempts: unknown[] = [];
  const fetchMock = mockApi({
    "GET /api/auth/me": () => Response.json({ authenticated: true }),
    "GET /api/units/1": () => Response.json(unitFixture()),
    "POST /api/units/1/items/1.1-2/attempts": ({ body }) => {
      attempts.push(body);
      return attemptReply({ status: "correct", blanks: [{ verdict: "correct" }], score: 1 });
    },
    ...handlers,
  });
  return { fetchMock, attempts };
}

const stepButton = (name: string) =>
  within(screen.getByRole("navigation", { name: "Unit steps" })).getByRole("button", {
    name: new RegExp(name),
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UnitsPage", () => {
  it("groups units by block with status badges and scores", async () => {
    mockApi({
      "GET /api/auth/me": () => Response.json({ authenticated: true }),
      "GET /api/units": () =>
        Response.json({
          blocks: [
            {
              id: 1,
              title: "Present and past",
              units: [
                {
                  number: 1,
                  title: "Present continuous",
                  subtitle: "I am doing",
                  status: "completed",
                  score: 0.85,
                  priority: false,
                },
                {
                  number: 2,
                  title: "Present simple",
                  subtitle: "I do",
                  status: "not-started",
                  score: null,
                  priority: true,
                },
              ],
            },
          ],
        }),
    });
    renderAt("/units");

    expect(await screen.findByRole("heading", { name: "Present and past" })).toBeTruthy();
    const first = screen.getByRole("link", { name: /Unit 1/ });
    expect(first.getAttribute("href")).toBe("/units/1");
    expect(within(first).getByText("Completed")).toBeTruthy();
    expect(within(first).getByText("85%")).toBeTruthy();
    const second = screen.getByRole("link", { name: /Unit 2/ });
    expect(within(second).getByText("Not started")).toBeTruthy();
    expect(within(second).getByText("Review")).toBeTruthy();
  });
});

describe("UnitPage flow", () => {
  it("starts with the story chapter and moves through the stepper", async () => {
    unitApi();
    renderAt("/units/1");

    expect(await screen.findByRole("heading", { name: "Live from Space" })).toBeTruthy();
    expect(stepButton("Story").getAttribute("aria-current")).toBe("step");
    // Grammar spans are highlighted and explain themselves on tap.
    fireEvent.click(screen.getByRole("button", { name: "are flying" }));
    expect(screen.getByText("Action in progress.")).toBeTruthy();
    expect(screen.getByText(/nothing will be ordinary again/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next: Puzzle" }));
    expect(await screen.findByText("Is the sentence still correct?")).toBeTruthy();
    const reveal = screen.getByRole("button", { name: "Reveal the answer" }) as HTMLButtonElement;
    expect(reveal.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Your guess"), { target: { value: "Yes, it is" } });
    fireEvent.click(reveal);
    expect(screen.getByText(/está en curso estos días/)).toBeTruthy();

    fireEvent.click(stepButton("Theory"));
    expect(await screen.findByText("is driving")).toBeTruthy();
    expect(screen.getByText("Look! It rains.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(stepButton("Puzzle").getAttribute("aria-current")).toBe("step"));
  });

  it("shows the story title above the chapter when the api has one", async () => {
    const unit = unitFixture();
    unitApi({
      "GET /api/units/1": () =>
        Response.json({
          ...unit,
          story: unit.story && { ...unit.story, title: "Apollo 13: The Successful Failure" },
        }),
    });
    renderAt("/units/1");

    expect(await screen.findByText("Apollo 13: The Successful Failure · Chapter 1")).toBeTruthy();
  });

  it("goes straight to the exercises from any step", async () => {
    unitApi();
    renderAt("/units/1");

    fireEvent.click(await screen.findByRole("button", { name: "Go straight to exercises" }));
    expect(await screen.findByLabelText("Item 2 answer")).toBeTruthy();
    expect(stepButton("Exercises").getAttribute("aria-current")).toBe("step");
  });
});

describe("exercise items", () => {
  it("render blanks, show the example filled and submit the answer", async () => {
    const { attempts } = unitApi();
    renderAt("/units/1?step=exercises");

    const example = (await screen.findByLabelText("Item 1 example answer")) as HTMLInputElement;
    expect(example.disabled).toBe(true);
    expect(example.value).toBe("'re working");

    const blank = screen.getByLabelText("Item 2 answer") as HTMLInputElement;
    fireEvent.change(blank, { target: { value: "am looking" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Check" })[0] as HTMLElement);

    expect(await screen.findByText("Correct!")).toBeTruthy();
    expect(attempts).toEqual([{ inputs: ["am looking"] }]);
    expect(blank.dataset.verdict).toBe("correct");
  });

  it.each<[string, ItemCheckResult, RegExp]>([
    [
      "almost",
      { status: "correct", blanks: [{ verdict: "almost" }], score: 1 },
      /Almost: accepted/,
    ],
    [
      "incorrect",
      { status: "incorrect", blanks: [{ verdict: "incorrect" }], score: 0 },
      /Not quite/,
    ],
  ])("show the %s verdict", async (verdict, result, text) => {
    unitApi({
      "POST /api/units/1/items/1.1-2/attempts": () => attemptReply(result),
    });
    renderAt("/units/1?step=exercises");

    const blank = (await screen.findByLabelText("Item 2 answer")) as HTMLInputElement;
    fireEvent.change(blank, { target: { value: "am lookin" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Check" })[0] as HTMLElement);

    const status = await screen.findByText(text);
    expect(status.closest("[data-verdict]")?.getAttribute("data-verdict")).toBe(verdict);
    expect(blank.dataset.verdict).toBe(verdict);
  });

  it("show the stored AI feedback of the latest attempt after a reload", async () => {
    const unit = unitFixture();
    unitApi({
      "GET /api/units/1": () =>
        Response.json({
          ...unit,
          progress: {
            ...unit.progress,
            status: "in-progress",
            items: [
              {
                itemId: "1.1-2",
                attempts: 1,
                latest: {
                  inputs: ["am look"],
                  result: { status: "incorrect", blanks: [{ verdict: "incorrect" }], score: 0 },
                  method: "ai",
                  feedbackEs: "Falta el -ing.",
                  hintEs: "Piensa en una acción en curso.",
                },
              },
            ],
          },
        }),
    });
    renderAt("/units/1?step=exercises");

    expect(await screen.findByText("Falta el -ing.")).toBeTruthy();
    expect(screen.getByText(/Piensa en una acción en curso/)).toBeTruthy();
  });

  it("say when the AI check is unavailable", async () => {
    unitApi({
      "POST /api/units/1/items/1.1-2/attempts": () =>
        attemptReply({ status: "needs-ai", blanks: [], score: 0 }, { error: "ai-unavailable" }),
    });
    renderAt("/units/1?step=exercises");

    fireEvent.change(await screen.findByLabelText("Item 2 answer"), {
      target: { value: "I was coding" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Check" })[0] as HTMLElement);
    expect(await screen.findByText(/AI check is unavailable/)).toBeTruthy();
  });

  it("insert a word-bank chip into the focused blank and show graduated hints", async () => {
    unitApi({
      "POST /api/units/1/items/1.1-2/hint": ({ body }) =>
        Response.json({
          level: (body as { shown: number }).shown + 1,
          hintEs: `Pista ${(body as { shown: number }).shown + 1}`,
          source: "ai",
        }),
    });
    renderAt("/units/1?step=exercises");

    const blank = (await screen.findByLabelText("Item 2 answer")) as HTMLInputElement;
    fireEvent.focus(blank);
    fireEvent.click(screen.getByRole("button", { name: "look" }));
    expect(blank.value).toBe("look");

    fireEvent.click(screen.getByRole("button", { name: "Hint" }));
    expect(await screen.findByText("Pista 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Another hint" }));
    expect(await screen.findByText("Pista 2")).toBeTruthy();
  });
});

describe("I don't get it", () => {
  it("opens the Spanish explanation and returns to the same step and item", async () => {
    const explains: unknown[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    unitApi({
      "POST /api/units/1/explain": async ({ body }) => {
        explains.push(body);
        await gate;
        return Response.json({
          explanationEs: "El present continuous habla de algo en curso.",
          examplesEn: ["The build is running."],
          backToTaskEs: "Vuelve al ítem 2.",
        });
      },
    });
    renderAt("/units/1?step=exercises");

    const blank = (await screen.findByLabelText("Item 2 answer")) as HTMLInputElement;
    blank.focus();
    fireEvent.focus(blank);
    fireEvent.click(screen.getByRole("button", { name: "I don't get it" }));

    const sheet = await screen.findByRole("dialog", { name: "No entiendo" });
    expect(within(sheet).getByText("Preparing an explanation…")).toBeTruthy();
    release();
    expect(await within(sheet).findByText(/habla de algo en curso/)).toBeTruthy();
    expect(explains).toEqual([
      {
        context: expect.objectContaining({
          step: "exercises",
          itemId: "1.1-2",
          previousExplanations: [],
        }),
      },
    ]);

    fireEvent.click(within(sheet).getByRole("button", { name: "Back to where I was" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(stepButton("Exercises").getAttribute("aria-current")).toBe("step");
    await waitFor(() => expect(document.activeElement).toBe(blank));
  });

  it("explains that the tutor is unavailable without an AI key", async () => {
    unitApi({
      "POST /api/units/1/explain": () =>
        Response.json(
          { error: "ai-unavailable", message: "The AI tutor is unavailable right now" },
          { status: 503 },
        ),
    });
    renderAt("/units/1");

    fireEvent.click(await screen.findByRole("button", { name: "I don't get it" }));
    expect(await screen.findByText(/Your doubt was saved for later/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to where I was" }));
    expect(stepButton("Story").getAttribute("aria-current")).toBe("step");
  });
});

describe("completion", () => {
  it("shows the banner with the can-do statement when the unit crosses 80%", async () => {
    unitApi({
      "POST /api/units/1/items/1.1-2/attempts": () =>
        attemptReply(
          { status: "correct", blanks: [{ verdict: "correct" }], score: 1 },
          {
            completion: { ...completion, correct: 1, ratio: 1, completed: true },
            unitCompleted: true,
            canDoEs: ["Puedo contar lo que está pasando ahora."],
          },
        ),
    });
    renderAt("/units/1?step=exercises");

    fireEvent.change(await screen.findByLabelText("Item 2 answer"), {
      target: { value: "am looking" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Check" })[0] as HTMLElement);

    const banner = await screen.findByRole("status", { name: "Unit completed" });
    expect(within(banner).getByText(/Unit completed!/)).toBeTruthy();
    expect(within(banner).getByText("Puedo contar lo que está pasando ahora.")).toBeTruthy();
  });
});

describe("timeline drag", () => {
  it("places the action with the keyboard and checks it on the server", async () => {
    const placements: unknown[] = [];
    unitApi({
      "POST /api/units/1/timeline/tl-1-1": ({ body }) => {
        placements.push(body);
        return Response.json({
          correct: true,
          kindCorrect: true,
          handles: { start: true, end: true },
          expected: { kind: "ongoing-now", start: -0.05, end: 0.05 },
          explanationEs: "Está pasando ahora mismo.",
        });
      },
    });
    renderAt("/units/1?step=timeline");

    fireEvent.click(await screen.findByLabelText("Happening around now"));
    const start = screen.getByRole("slider", { name: "Start" });
    expect(start.getAttribute("aria-valuenow")).toBe("0.3");
    fireEvent.keyDown(start, { key: "Home" });
    fireEvent.keyDown(start, { key: "PageUp" });
    expect(start.getAttribute("aria-valuenow")).toBe("-0.8");

    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Está pasando ahora mismo.")).toBeTruthy();
    expect(placements).toEqual([{ placement: { kind: "ongoing-now", start: -0.8, end: 0.7 } }]);
  });
});
