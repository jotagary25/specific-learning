import type {
  CanDoListResponse,
  ErrorsResponse,
  ErrorTypeTrend,
  MirrorDueResponse,
  ProgressSummary,
  TimelineResponse,
} from "@english-course/shared";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Handler, mockApi, renderAt } from "../../test/render.tsx";

const summary: ProgressSummary = {
  units: { total: 6, completed: 2, inProgress: 1, needsReview: 0 },
  words: { saved: 40, new: 8, learning: 20, mature: 12 },
  writing: {
    reviewed: 3,
    dimensions: [
      { dimension: "grammar", values: [50, 60, 72], average: 60.7, change: 22 },
      { dimension: "clarity", values: [60, 65, 70], average: 65, change: 10 },
      { dimension: "vocabulary", values: [55, 55, 60], average: 56.7, change: 5 },
      { dimension: "naturalness", values: [40, 52, 66], average: 52.7, change: 26 },
    ],
  },
  minutes: { last7Days: 95, last30Days: 300 },
  articlesRead: 5,
};

const trend = (type: string, over: Partial<ErrorTypeTrend>): ErrorTypeTrend => ({
  type,
  total: 3,
  before: { count: 3, submissions: 3 },
  recent: { count: 0, submissions: 3 },
  trend: "beating",
  units: [],
  months: [{ month: "2026-10", count: 3 }],
  ...over,
});

const beating = trend("third_person_s", { units: [{ unit: 2, title: "Present simple" }] });
const recurring = trend("articles", {
  before: { count: 1, submissions: 3 },
  recent: { count: 3, submissions: 3 },
  total: 4,
  trend: "recurring",
});

const errors: ErrorsResponse = {
  submissions: 6,
  recentWindow: 3,
  months: ["2026-10"],
  types: [recurring, beating],
  units: [{ unit: 2, title: "Present simple", total: 3, months: [{ month: "2026-10", count: 3 }] }],
  beating: [beating],
  recurring: [recurring],
};

const timeline: TimelineResponse = {
  from: "2026-08-03",
  to: "2026-10-25",
  weeks: [
    {
      weekStart: "2026-10-12",
      minutes: 25,
      items: [
        {
          at: new Date(2026, 9, 13, 9).toISOString(),
          kind: "unit_completed",
          title: "Completed unit 1: Present continuous",
          detail: "First-attempt score 85%",
          link: "/units/1",
          canDo: ["Puedo hablar de lo que pasa ahora."],
          scores: null,
        },
      ],
    },
    {
      weekStart: "2026-10-19",
      minutes: 0,
      items: [
        {
          at: new Date(2026, 9, 20, 9).toISOString(),
          kind: "reading_completed",
          title: "Read “Why bees dance”",
          detail: "800 words · 3 words saved",
          link: "/reading/a1",
          canDo: [],
          scores: null,
        },
      ],
    },
  ],
};

const due: MirrorDueResponse = { due: true, month: "2026-10", reason: "due", historyDays: 20 };

function api(extra: Record<string, Handler> = {}) {
  let canDo: CanDoListResponse = { entries: [] };
  return mockApi({
    "GET /api/auth/me": () => Response.json({ authenticated: true }),
    "GET /api/health": () => Response.json({ status: "ok", db: "ok" }),
    "GET /api/progress/summary": () => Response.json(summary),
    "GET /api/progress/errors": () => Response.json(errors),
    "GET /api/progress/timeline": () => Response.json(timeline),
    "GET /api/progress/mirror/due": () => Response.json(due),
    "GET /api/progress/can-do": () => Response.json(canDo),
    "POST /api/progress/can-do": ({ body }) => {
      const entry = {
        id: "c1",
        text: (body as { text: string }).text,
        source: "learner",
        createdAt: new Date(2026, 9, 25).toISOString(),
      } as const;
      canDo = { entries: [entry] };
      return Response.json(entry, { status: 201 });
    },
    ...extra,
  });
}

describe("ProgressPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the summary with context, score lines, errors and the timeline", async () => {
    api();
    renderAt("/progress");

    expect(await screen.findByRole("heading", { name: "Progress", level: 1 })).toBeTruthy();
    const glance = await screen.findByRole("list", { name: "At a glance" });
    expect(within(glance).getByText(/of 6 units completed/).textContent).toBe(
      "2 of 6 units completed",
    );
    expect(within(glance).getByText(/you know well/).textContent).toBe("12 words you know well");
    expect(within(glance).getByText(/studied in the last 7 days/).textContent).toBe(
      "1 h 35 min studied in the last 7 days",
    );
    expect(
      screen.getByRole("img", {
        name: "Grammar scores of your last 3 reviewed texts, oldest to newest: 50, 60, 72",
      }),
    ).toBeTruthy();

    const beatingSection = screen.getByRole("region", { name: "Errors you are beating" });
    expect(within(beatingSection).getByText("Third person s")).toBeTruthy();
    expect(
      within(beatingSection)
        .getByRole("link", { name: "Unit 2: Present simple" })
        .getAttribute("href"),
    ).toBe("/units/2");
    const recurringSection = screen.getByRole("region", { name: "Still recurring" });
    expect(within(recurringSection).getByText("Articles")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Writing errors by unit, per month" })).toBeTruthy();

    const weeks = screen.getByRole("region", { name: "Timeline" });
    const headings = within(weeks).getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Week of Oct 19",
      "Week of Oct 12 · 25 min studied",
    ]);
    expect(within(weeks).getByText("Puedo hablar de lo que pasa ahora.")).toBeTruthy();

    const mirror = screen.getByRole("link", { name: "Monthly mirror: October 2026" });
    expect(mirror.getAttribute("href")).toBe("/progress/mirror/2026-10");
    expect(screen.getByText(/Your monthly mirror is ready/)).toBeTruthy();
  });

  it("adds a can-do entry", async () => {
    const fetchMock = api();
    renderAt("/progress");

    const input = await screen.findByLabelText("Now I can…");
    fireEvent.change(input, { target: { value: "order coffee in English" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    const log = await screen.findByRole("list", { name: "Can-do log" });
    expect(within(log).getByText("order coffee in English")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/progress/can-do",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "order coffee in English" }),
      }),
    );
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
  });

  it("shows empty states without data", async () => {
    api({
      "GET /api/progress/errors": () =>
        Response.json({ ...errors, types: [], units: [], beating: [], recurring: [], months: [] }),
      "GET /api/progress/timeline": () => Response.json({ ...timeline, weeks: [] }),
      "GET /api/progress/summary": () =>
        Response.json({
          ...summary,
          writing: {
            reviewed: 0,
            dimensions: summary.writing.dimensions.map((d) => ({
              ...d,
              values: [],
              average: null,
              change: null,
            })),
          },
        }),
    });
    renderAt("/progress");

    expect(await screen.findByText("No writing errors recorded yet.")).toBeTruthy();
    expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();
    expect(await screen.findByText(/after your first reviewed text/)).toBeTruthy();
  });
});
