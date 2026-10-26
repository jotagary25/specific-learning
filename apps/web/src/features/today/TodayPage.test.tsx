import type { StudySessionView, TodayOverview } from "@english-course/shared";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Handler, mockApi, renderAt } from "../../test/render.tsx";
import { newActiveSession, STORAGE_KEY } from "./session.model.ts";

// 2026-10-26 is a Monday, 2026-10-24 a Saturday (local time).
const MONDAY = new Date(2026, 9, 26, 7, 0);
const SATURDAY = new Date(2026, 9, 24, 9, 0);

const plan: TodayOverview["plan"] = {
  mode: "full",
  budgetMin: 25,
  blocks: [
    {
      kind: "vocabulary",
      title: "Review 10 cards",
      minutes: 4,
      deepLink: "/vocabulary",
      reason: "12 reviews due",
    },
    {
      kind: "unit",
      title: "Unit 2: Present simple",
      minutes: 15,
      deepLink: "/units/2?step=exercises",
      reason: "Next: the exercises",
    },
    {
      kind: "reading",
      title: "Read: Why bees dance",
      minutes: 6,
      deepLink: "/reading",
      reason: "Today's article",
    },
  ],
};

const overview = (over: Partial<TodayOverview> = {}): TodayOverview => ({
  now: MONDAY.toISOString(),
  daypart: "morning",
  weekend: false,
  suggestedMode: "full",
  plan,
  teaser: { unit: 2, chapterTitle: "Houston", teaser: "And then the oxygen tank exploded." },
  parkingOpen: 0,
  sessionsToday: [],
  activeSession: null,
  ...over,
});

const session = (startedAt: Date): StudySessionView => ({
  id: "0199f000-0000-7000-8000-000000000001",
  mode: "full",
  budgetMin: 25,
  plan,
  startedAt: startedAt.toISOString(),
  endedAt: null,
  bonusMin: 0,
});

/** Stores a session that started `ago` ms before the (faked) current time. */
function seedSession(now: Date, agoMs: number) {
  const view = session(new Date(now.getTime() - agoMs));
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...newActiveSession(view), teaser: overview().teaser }),
  );
  return view;
}

const baseApi = (extra: Record<string, Handler> = {}): Record<string, Handler> => ({
  "GET /api/auth/me": () => Response.json({ authenticated: true }),
  "GET /api/health": () => Response.json({ status: "ok", db: "ok" }),
  "GET /api/today": () => Response.json(overview()),
  "GET /api/today/parking": () => Response.json({ items: [] }),
  ...extra,
});

describe("TodayPage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("renders the plan with deep links and the story teaser", async () => {
    mockApi(baseApi());
    renderAt("/");

    expect(await screen.findByRole("heading", { name: "Good morning" })).toBeTruthy();
    const planList = screen.getByRole("list", { name: "Plan" });
    const unit = within(planList).getByRole("link", { name: "Unit 2: Present simple" });
    expect(unit.getAttribute("href")).toBe("/units/2?step=exercises");
    expect(
      within(planList).getByRole("link", { name: "Review 10 cards" }).getAttribute("href"),
    ).toBe("/vocabulary");
    expect(screen.getByText("15 min")).toBeTruthy();
    expect(screen.getByText("And then the oxygen tank exploded.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^25 min/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("starts a session and shows the persistent session bar", async () => {
    const started = session(new Date());
    const fetchMock = mockApi(
      baseApi({ "POST /api/today/sessions": () => Response.json(started, { status: 201 }) }),
    );
    renderAt("/");

    fireEvent.click(await screen.findByRole("button", { name: /Start session/ }));

    const bar = await screen.findByRole("region", { name: "Study session" });
    expect(within(bar).getByRole("timer").textContent).toMatch(/^2[45]:\d\d$/);
    expect(within(bar).getByRole("link", { name: /Review 10 cards/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/today/sessions",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ mode: "full" }) }),
    );
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").session.id).toBe(started.id);

    fireEvent.click(within(bar).getByRole("button", { name: "Next block" }));
    expect(within(bar).getByRole("link", { name: /Unit 2/ })).toBeTruthy();
  });

  it("shows the completion screen when the countdown reaches 0", async () => {
    vi.useFakeTimers({ now: MONDAY, toFake: ["Date"] });
    seedSession(MONDAY, 25 * 60_000 - 1500);
    mockApi(baseApi());
    renderAt("/");

    expect(await screen.findByRole("timer")).toBeTruthy();
    vi.setSystemTime(new Date(MONDAY.getTime() + 2000));
    const dialog = await screen.findByRole("dialog", {}, { timeout: 3000 });
    expect(within(dialog).getByRole("heading", { name: "Session complete" })).toBeTruthy();
    expect(within(dialog).getByText("And then the oxygen tank exploded.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Stop here" })).toBeTruthy();
  });

  it("offers one bonus on weekdays", async () => {
    vi.useFakeTimers({ now: MONDAY, toFake: ["Date"] });
    seedSession(MONDAY, 26 * 60_000);
    mockApi(baseApi());
    renderAt("/");

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "5 more minutes" }));
    expect(await screen.findByRole("timer")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    // The bonus runs out: no second bonus on a weekday.
    vi.setSystemTime(new Date(MONDAY.getTime() + 5 * 60_000 + 1000));
    const again = await screen.findByRole("dialog", {}, { timeout: 3000 });
    expect(within(again).queryByRole("button", { name: "5 more minutes" })).toBeNull();
  });

  it("offers repeated bonuses on weekends", async () => {
    vi.useFakeTimers({ now: SATURDAY, toFake: ["Date"] });
    seedSession(SATURDAY, 26 * 60_000);
    mockApi(baseApi({ "GET /api/today": () => Response.json(overview({ weekend: true })) }));
    renderAt("/");

    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "5 more minutes" }),
    );
    vi.setSystemTime(new Date(SATURDAY.getTime() + 5 * 60_000 + 1000));
    const again = await screen.findByRole("dialog", {}, { timeout: 3000 });
    expect(within(again).getByRole("button", { name: "5 more minutes" })).toBeTruthy();
  });

  it("stops the session with the bonus and blocks done", async () => {
    vi.useFakeTimers({ now: MONDAY, toFake: ["Date"] });
    const view = seedSession(MONDAY, 26 * 60_000);
    const fetchMock = mockApi(
      baseApi({
        [`POST /api/today/sessions/${view.id}/end`]: () =>
          Response.json({ ...view, endedAt: MONDAY.toISOString() }),
      }),
    );
    renderAt("/");

    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Stop here" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/today/sessions/${view.id}/end`,
      expect.objectContaining({
        body: JSON.stringify({ reason: "timer", bonusMinutes: 0, blocksDone: 0 }),
      }),
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("parks a thought from the session bar without leaving the page", async () => {
    seedSession(new Date(), 60_000);
    const fetchMock = mockApi(
      baseApi({
        "POST /api/today/parking": ({ body }) =>
          Response.json(
            {
              id: "p1",
              text: (body as { text: string }).text,
              done: false,
              createdAt: new Date().toISOString(),
            },
            { status: 201 },
          ),
      }),
    );
    const { router } = renderAt("/units/2");

    const bar = await screen.findByRole("region", { name: "Study session" });
    fireEvent.click(within(bar).getByRole("button", { name: "Park it" }));
    fireEvent.change(within(bar).getByPlaceholderText("Park a thought for later"), {
      target: { value: "Who was Jim Lovell?" },
    });
    fireEvent.click(within(bar).getByRole("button", { name: "Save" }));

    expect(await within(bar).findByRole("status")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/today/parking",
      expect.objectContaining({ body: JSON.stringify({ text: "Who was Jim Lovell?" }) }),
    );
    expect(router.state.location.pathname).toBe("/units/2");
  });

  it("lists parked items when no session runs", async () => {
    mockApi(
      baseApi({
        "GET /api/today/parking": () =>
          Response.json({
            items: [
              { id: "p1", text: "Apollo 1 fire", done: false, createdAt: MONDAY.toISOString() },
            ],
          }),
      }),
    );
    renderAt("/");
    expect(await screen.findByText("Apollo 1 fire")).toBeTruthy();
  });
});
