import type { CardView, QueueCard, QueueResponse } from "@english-course/shared";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Handler, mockApi, renderAt } from "../../test/render.tsx";

const recognition: QueueCard = {
  id: "c1",
  source: "word",
  direction: "recognition",
  phase: "new",
  task: "What does the word mean here?",
  prompt: "Small firms thrive in busy cities.",
  highlight: "thrive",
  hintEs: null,
  answers: null,
  back: "prosperar (verb) — to grow well",
  context: "Robots that sort recycling",
};

const production: QueueCard = {
  id: "c2",
  source: "word",
  direction: "production",
  phase: "review",
  task: "Type the missing word",
  prompt: "The plant is _____ day and night.",
  highlight: null,
  hintEs: "trabajando",
  answers: ["working"],
  back: "trabajar (verb)",
  context: null,
};

const fix: QueueCard = {
  id: "c3",
  source: "own_error",
  direction: "fix",
  phase: "new",
  task: "Fix the sentence",
  prompt: "She go to work every day.",
  highlight: null,
  hintEs: "Tercera persona: -s",
  answers: ["She goes to work every day."],
  back: "She goes to work every day.\nTercera persona: -s",
  context: "Written on 2026-10-20",
};

function queue(cards: QueueCard[]): QueueResponse {
  return { cards, dueRemaining: 0, newPerDay: 5, newToday: 0 };
}

function vocabularyApi(cards: QueueCard[], handlers: Record<string, Handler> = {}) {
  const reviews: Array<{ id: string; body: unknown }> = [];
  const sessions: unknown[] = [];
  const reviewHandlers = Object.fromEntries(
    cards.map((card) => [
      `POST /api/vocabulary/cards/${card.id}/review`,
      (({ body }) => {
        reviews.push({ id: card.id, body });
        return Response.json({
          cardId: card.id,
          rating: (body as { rating: number }).rating,
          phase: "review",
          due: "2026-10-27T13:00:00.000Z",
        });
      }) as Handler,
    ]),
  );
  const fetchMock = mockApi({
    "GET /api/auth/me": () => Response.json({ authenticated: true }),
    "GET /api/vocabulary/queue?limit=10": () => Response.json(queue(cards)),
    "POST /api/vocabulary/sessions": ({ body }) => {
      sessions.push(body);
      return Response.json({ recorded: true });
    },
    ...reviewHandlers,
    ...handlers,
  });
  return { fetchMock, reviews, sessions };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VocabularyPage", () => {
  it("runs a session: reveal + self-rate, typed answer, then the end screen", async () => {
    const { reviews, sessions } = vocabularyApi([recognition, production]);
    renderAt("/vocabulary");

    expect(await screen.findByText("1/2")).toBeTruthy();
    expect(screen.getByText("thrive").tagName).toBe("MARK");
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    expect(screen.getByText("prosperar (verb) — to grow well")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Good/ }));

    expect(await screen.findByText("2/2")).toBeTruthy();
    expect(screen.getByText("trabajando")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "Working" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Correct!")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Enter" });

    expect(await screen.findByText("That's it for now")).toBeTruthy();
    expect(screen.getByText("Good: 2")).toBeTruthy();
    expect(reviews).toEqual([
      { id: "c1", body: { rating: 3 } },
      { id: "c2", body: { rating: 3, answer: "Working" } },
    ]);
    await vi.waitFor(() => expect(sessions).toHaveLength(1));
    expect(sessions[0]).toMatchObject({ reviewed: 2, again: 0, hard: 0, good: 2, easy: 0 });
  });

  it("shows feedback for a wrong typed answer and lets keys override the rating", async () => {
    const { reviews } = vocabularyApi([production]);
    renderAt("/vocabulary");
    fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "walking" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Not quite.")).toBeTruthy();
    expect(screen.getByText("working")).toBeTruthy();
    fireEvent.keyDown(window, { key: "2" });
    expect(await screen.findByText("That's it for now")).toBeTruthy();
    expect(reviews).toEqual([{ id: "c2", body: { rating: 2, answer: "walking" } }]);
  });

  it("shows a diff for an own-error card that is not exact", async () => {
    vocabularyApi([fix]);
    renderAt("/vocabulary");
    expect(await screen.findByText("Written on 2026-10-20")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your answer"), {
      target: { value: "She go to work every day." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText(/^go\s*$/).tagName).toBe("DEL");
    expect(screen.getByText(/^goes\s*$/).tagName).toBe("INS");
  });

  it("ends right away when nothing is due", async () => {
    const { sessions } = vocabularyApi([]);
    renderAt("/vocabulary");
    expect(await screen.findByText("That's it for now")).toBeTruthy();
    expect(screen.getByText("Nothing is due right now. Come back later.")).toBeTruthy();
    expect(sessions).toHaveLength(0);
  });
});

describe("CardsPage", () => {
  const card: CardView = {
    id: "c1",
    source: "word",
    front: "thrive\nSmall firms thrive.",
    back: "prosperar",
    phase: "new",
    due: "2026-10-25T13:00:00.000Z",
    suspended: false,
    reps: 0,
    lapses: 0,
    createdAt: "2026-10-25T13:00:00.000Z",
  };

  it("lists, filters, suspends and deletes cards", async () => {
    const patched: unknown[] = [];
    const fetchMock = vocabularyApi([], {
      "GET /api/vocabulary/cards": () => Response.json({ cards: [card] }),
      "GET /api/vocabulary/cards?source=own_error": () => Response.json({ cards: [] }),
      "PATCH /api/vocabulary/cards/c1": ({ body }) => {
        patched.push(body);
        return Response.json({ ...card, suspended: true });
      },
      "DELETE /api/vocabulary/cards/c1": () => Response.json({ deleted: true }),
    }).fetchMock;
    renderAt("/vocabulary/cards");

    expect(await screen.findByText("prosperar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    await vi.waitFor(() => expect(patched).toEqual([{ suspended: true }]));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/vocabulary/cards/c1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );

    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "own_error" } });
    expect(await screen.findByText("No cards found.")).toBeTruthy();
  });
});
