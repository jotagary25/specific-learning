import type { MirrorResponse } from "@english-course/shared";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderAt } from "../../test/render.tsx";

const post = (over: Partial<NonNullable<MirrorResponse["writing"]>["first"]>) => ({
  submissionId: "s1",
  title: "My first tweet",
  format: "tweet",
  writtenOn: "2026-09-05",
  text: "I have 30 years and I work in Madrid since 2019.",
  scores: { grammar: 50, clarity: 60, vocabulary: 55, naturalness: 40 },
  overall: 51,
  errorCount: 2,
  errorTypes: ["false_friend", "present_perfect"],
  ...over,
});

const mirror: MirrorResponse = {
  month: "2026-10",
  label: "October 2026",
  article: {
    articleId: "a1",
    title: "Why bees dance",
    readOn: "2026-09-03",
    daysAgo: 52,
    text: "Bees wield a dance while storms loom.",
    words: [
      { word: "wield", status: "mature" },
      { word: "loom", status: "learning" },
    ],
    unknownThen: 2,
    unknownNow: 1,
  },
  writing: {
    first: post({}),
    latest: post({
      submissionId: "s2",
      title: "Shipping a feature",
      writtenOn: "2026-10-18",
      text: "I'm 30 and I've worked in Madrid since 2019.",
      scores: { grammar: 72, clarity: 75, vocabulary: 70, naturalness: 66 },
      overall: 71,
      errorCount: 0,
      errorTypes: [],
    }),
    deltas: [
      { dimension: "grammar", change: 22 },
      { dimension: "clarity", change: 15 },
      { dimension: "vocabulary", change: 15 },
      { dimension: "naturalness", change: 26 },
      { dimension: "overall", change: 20 },
    ],
  },
  units: [
    {
      unit: 2,
      title: "Present simple",
      completedOn: "2026-10-10",
      canDo: ["Puedo describir rutinas."],
    },
  ],
  reflectionPrompt: "What can you do now that you couldn't before?",
  reflection: null,
  seen: false,
};

function api(data: MirrorResponse = mirror) {
  return mockApi({
    "GET /api/auth/me": () => Response.json({ authenticated: true }),
    "GET /api/health": () => Response.json({ status: "ok", db: "ok" }),
    "GET /api/progress/mirror?month=2026-10": () => Response.json(data),
    "GET /api/progress/mirror/due": () =>
      Response.json({ due: false, month: "2026-10", reason: "already_seen", historyDays: 20 }),
    "POST /api/progress/mirror/2026-10/seen": () => Response.json({ month: "2026-10", seen: true }),
    "POST /api/progress/mirror/2026-10/reflection": ({ body }) =>
      Response.json(
        {
          month: "2026-10",
          text: (body as { text: string }).text,
          savedAt: new Date().toISOString(),
        },
        { status: 201 },
      ),
  });
}

describe("MirrorPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows words then vs now, the posts side by side and the units", async () => {
    const fetchMock = api();
    renderAt("/progress/mirror/2026-10");

    expect(
      await screen.findByRole("heading", { name: "Monthly mirror: October 2026", level: 1 }),
    ).toBeTruthy();
    expect((await screen.findByText(/you didn't know/)).textContent).toBe(
      "In September you didn't know 2 of these words — today 1.",
    );
    const words = screen.getByRole("list", { name: "Words you looked up in October 2026" });
    expect(within(words).getByText("known now")).toBeTruthy();
    expect(screen.getByText("wield", { selector: "mark" })).toBeTruthy();

    const first = screen.getByRole("article", { name: "Your first post" });
    const latest = screen.getByRole("article", { name: "Your latest post" });
    expect(
      within(first).getByText("I have 30 years and I work in Madrid since 2019."),
    ).toBeTruthy();
    expect(within(latest).getByText("I'm 30 and I've worked in Madrid since 2019.")).toBeTruthy();
    const deltas = screen.getByRole("list", { name: "Change from your first post to your latest" });
    expect(within(deltas).getByText("+22")).toBeTruthy();

    expect(screen.getByRole("link", { name: "Unit 2: Present simple" }).getAttribute("href")).toBe(
      "/units/2",
    );
    expect(screen.getByText("Puedo describir rutinas.")).toBeTruthy();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/progress/mirror/2026-10/seen",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("saves the reflection", async () => {
    const fetchMock = api();
    renderAt("/progress/mirror/2026-10");

    const box = await screen.findByLabelText("What can you do now that you couldn't before?");
    fireEvent.change(box, { target: { value: "I can read the news without a dictionary." } });
    fireEvent.click(screen.getByRole("button", { name: "Save reflection" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved."));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/progress/mirror/2026-10/reflection",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "I can read the news without a dictionary." }),
      }),
    );
  });

  it("explains empty months honestly", async () => {
    api({ ...mirror, article: null, writing: null, units: [], seen: true });
    renderAt("/progress/mirror/2026-10");

    expect(await screen.findByText(/No article read yet/)).toBeTruthy();
    expect(screen.getByText("No reviewed posts yet.")).toBeTruthy();
    expect(screen.getByText("No units completed this month yet.")).toBeTruthy();
  });
});
