import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  classifyErrors,
  compareWriting,
  mirrorDue,
  mirrorWords,
  pickMirrorReading,
  summarize,
} from "./aggregate.ts";
import {
  at,
  card,
  event,
  reading,
  scores,
  submission,
  unitRecord,
  writingError,
} from "./progress.fixtures.ts";

describe("buildTimeline", () => {
  const units = [unitRecord(1, { title: "Present continuous", canDo: ["Puedo describir…"] })];

  it("groups events and learner can-do entries by local Monday, oldest first", () => {
    // 2026-10-19 and 2026-10-26 are Mondays.
    const weeks = buildTimeline({
      events: [
        event("session_completed", at(2026, 10, 20), {
          minutes: 25,
          blocksDone: 2,
          blocksPlanned: 3,
        }),
        event("unit_completed", at(2026, 10, 25, 22), { unitId: 1, ratio: 0.85, graded: 20 }),
        event("session_completed", at(2026, 10, 26), { minutes: 12 }),
        event("writing_submitted", at(2026, 10, 26), { scores: scores(60) }),
        event("reading_completed", at(2026, 10, 27), {
          articleId: "a1",
          title: "Why bees dance",
          wordCount: 800,
          savedWords: 3,
        }),
      ],
      canDos: [
        { id: "c1", text: "order coffee", source: "learner", createdAt: at(2026, 10, 27, 10) },
        { id: "c2", text: "suggested", source: "suggested", createdAt: at(2026, 10, 27, 10) },
      ],
      units,
      from: at(2026, 10, 1, 0),
      to: at(2026, 11, 1, 0),
      timeZone: "UTC",
    });

    expect(weeks.map((w) => [w.weekStart, w.minutes, w.items.length])).toEqual([
      ["2026-10-19", 25, 2],
      ["2026-10-26", 12, 3],
    ]);
    const [first, second] = weeks;
    expect(first?.items[1]).toMatchObject({
      kind: "unit_completed",
      title: "Completed unit 1: Present continuous",
      detail: "First-attempt score 85%",
      link: "/units/1",
      canDo: ["Puedo describir…"],
    });
    expect(second?.items.map((i) => i.kind)).toEqual([
      "study_session",
      "reading_completed",
      "can_do",
    ]);
    expect(second?.items[1]?.detail).toBe("800 words · 3 words saved");
    expect(second?.items[2]?.title).toBe("Now I can: order coffee");
  });

  it("buckets weeks by the user's local Monday", () => {
    // 02:00 UTC on Monday 2026-10-26 is still Sunday 22:00 in La Paz.
    const input = {
      events: [event("session_completed", new Date("2026-10-26T02:00:00Z"), { minutes: 10 })],
      canDos: [],
      units,
      from: at(2026, 10, 1, 0),
      to: at(2026, 11, 1, 0),
    };
    const weekOf = (timeZone: string) => buildTimeline({ ...input, timeZone })[0]?.weekStart;
    expect(weekOf("UTC")).toBe("2026-10-26");
    expect(weekOf("America/La_Paz")).toBe("2026-10-19");
  });

  it("leaves out events outside the range", () => {
    const weeks = buildTimeline({
      events: [event("session_completed", at(2026, 9, 30), { minutes: 10 })],
      canDos: [],
      units,
      from: at(2026, 10, 1, 0),
      to: at(2026, 11, 1, 0),
      timeZone: "UTC",
    });
    expect(weeks).toEqual([]);
  });
});

describe("classifyErrors", () => {
  it("splits texts into older and recent windows and classifies each recurring type", () => {
    // 6 reviewed texts → recent window = 3.
    const subs = [1, 2, 3, 4, 5, 6].map((d) =>
      submission(at(2026, 9 + Math.floor(d / 4), d), scores(60)),
    );
    const [s1, s2, s3, s4, s5, s6] = subs as [
      (typeof subs)[0],
      (typeof subs)[0],
      (typeof subs)[0],
      (typeof subs)[0],
      (typeof subs)[0],
      (typeof subs)[0],
    ];
    const errors = [
      // third person -s: 3 in the older texts, none recently → beating
      writingError(s1, "third_person_s", 2),
      writingError(s2, "third_person_s", 2),
      writingError(s3, "third_person_s", 2),
      // articles: 1 older, 3 recent → recurring
      writingError(s1, "articles"),
      writingError(s4, "articles"),
      writingError(s5, "articles"),
      writingError(s6, "articles"),
      // past simple: 2 older, 1 recent → rate 0.67 → 0.33 (exactly half) → beating
      writingError(s2, "past_simple", 5),
      writingError(s3, "past_simple", 5),
      writingError(s6, "past_simple", 5),
      // prepositions: once
      writingError(s6, "prepositions"),
    ];
    const units = [
      unitRecord(2, { title: "Present simple" }),
      unitRecord(5, { title: "Past simple" }),
    ];

    const result = classifyErrors({ submissions: subs, errors, units, timeZone: "UTC" });

    expect(result.submissions).toBe(6);
    expect(result.recentWindow).toBe(3);
    const trend = Object.fromEntries(result.types.map((t) => [t.type, t.trend]));
    expect(trend).toEqual({
      articles: "recurring",
      third_person_s: "beating",
      past_simple: "beating",
      prepositions: "once",
    });
    expect(result.beating.map((t) => t.type)).toEqual(["third_person_s", "past_simple"]);
    expect(result.recurring.map((t) => t.type)).toEqual(["articles"]);
    expect(result.types.find((t) => t.type === "third_person_s")?.units).toEqual([
      { unit: 2, title: "Present simple" },
    ]);
    expect(result.months).toEqual(["2026-09", "2026-10"]);
    expect(result.units.map((u) => [u.unit, u.total, u.months.map((m) => m.count)])).toEqual([
      [2, 3, [3, 0]],
      [5, 3, [2, 1]],
    ]);
  });

  it("calls nothing beaten before there is an older window", () => {
    const s = submission(at(2026, 10, 1), scores(50));
    const result = classifyErrors({
      submissions: [s],
      errors: [writingError(s, "articles"), writingError(s, "articles")],
      units: [],
      timeZone: "UTC",
    });
    expect(result.recentWindow).toBe(0);
    expect(result.beating).toEqual([]);
    expect(result.recurring.map((t) => t.type)).toEqual(["articles"]);
  });

  it("buckets errors by the user's local month", () => {
    // 02:00 UTC on 1 November is still 31 October in La Paz.
    const s = submission(new Date("2026-11-01T02:00:00Z"), scores(50));
    const monthsIn = (timeZone: string) =>
      classifyErrors({
        submissions: [s],
        errors: [writingError(s, "articles")],
        units: [],
        timeZone,
      }).months;
    expect(monthsIn("UTC")).toEqual(["2026-11"]);
    expect(monthsIn("America/La_Paz")).toEqual(["2026-10"]);
  });

  it("ignores texts that were never reviewed when sizing the windows", () => {
    const result = classifyErrors({
      submissions: [submission(at(2026, 10, 1), null)],
      errors: [],
      units: [],
      timeZone: "UTC",
    });
    expect(result).toMatchObject({ submissions: 0, recentWindow: 0, types: [], months: [] });
  });
});

describe("monthly mirror", () => {
  it("picks the first article of the previous month, else the first one ever", () => {
    const readings = [
      reading("sept", at(2026, 9, 10)),
      reading("oct-1", at(2026, 10, 2)),
      reading("oct-2", at(2026, 10, 3)),
    ];
    expect(pickMirrorReading(readings, "2026-11", "UTC")?.articleId).toBe("oct-1");
    expect(pickMirrorReading(readings, "2026-10", "UTC")?.articleId).toBe("sept");
    expect(pickMirrorReading(readings.slice(1), "2026-12", "UTC")?.articleId).toBe("oct-1");
    expect(pickMirrorReading(readings, "2026-08", "UTC")).toBeUndefined();
  });

  it("counts the words unknown then vs the words without a mature card now", () => {
    const r = reading("a1", at(2026, 10, 2), ["Wield", "thrive", "wield", "loom"]);
    const result = mirrorWords(r, [
      card("wield", "mature", "a1"),
      card("thrive", "learning", "other"),
      card("thrive", "mature", "other"),
      card("scarce", "young", "a1"),
      card("unrelated", "mature", "zzz"),
    ]);
    expect(result.words).toEqual([
      { word: "wield", status: "mature" },
      { word: "thrive", status: "mature" },
      { word: "loom", status: "not_saved" },
      { word: "scarce", status: "learning" },
    ]);
    expect(result.unknownThen).toBe(4);
    expect(result.unknownNow).toBe(2);
  });

  it("puts the first post next to the latest one with score deltas", () => {
    const first = submission(at(2026, 9, 1), scores(50, 60, 55, 40), { text: "I have 30 years." });
    const retell = submission(at(2026, 9, 2), scores(90), { missionId: null, title: null });
    const middle = submission(at(2026, 10, 1), scores(65));
    const latest = submission(at(2026, 10, 20), scores(72, 75, 70, 66), { text: "I'm 30." });
    const later = submission(at(2026, 11, 2), scores(99));
    const result = compareWriting(
      [first, retell, middle, latest, later],
      [writingError(first, "false_friend"), writingError(first, "false_friend")],
      at(2026, 11, 1, 0),
      "UTC",
    );
    expect(result?.first).toMatchObject({
      submissionId: first.id,
      text: "I have 30 years.",
      overall: 51,
      errorCount: 2,
      errorTypes: ["false_friend"],
    });
    expect(result?.latest).toMatchObject({ submissionId: latest.id, overall: 71, errorCount: 0 });
    expect(result?.deltas).toEqual([
      { dimension: "grammar", change: 22 },
      { dimension: "clarity", change: 15 },
      { dimension: "vocabulary", change: 15 },
      { dimension: "naturalness", change: 26 },
      { dimension: "overall", change: 20 },
    ]);
  });

  it("has no comparison with a single post and nothing without posts", () => {
    const only = submission(at(2026, 10, 1), scores(60));
    expect(compareWriting([only], [], at(2026, 11, 1, 0), "UTC")).toMatchObject({
      latest: null,
      deltas: [],
    });
    expect(compareWriting([], [], at(2026, 11, 1, 0), "UTC")).toBeNull();
  });

  it("is due once per month after two weeks of history", () => {
    const now = at(2026, 10, 25);
    expect(mirrorDue(now, undefined, new Set(), "UTC")).toMatchObject({
      due: false,
      reason: "not_enough_history",
      historyDays: 0,
    });
    expect(mirrorDue(now, at(2026, 10, 12), new Set(), "UTC")).toMatchObject({
      due: false,
      reason: "not_enough_history",
      historyDays: 13,
    });
    expect(mirrorDue(now, at(2026, 10, 11), new Set(), "UTC")).toEqual({
      due: true,
      month: "2026-10",
      reason: "due",
      historyDays: 14,
    });
    expect(mirrorDue(now, at(2026, 9, 1), new Set(["2026-10"]), "UTC")).toMatchObject({
      due: false,
      reason: "already_seen",
    });
  });
});

describe("summarize", () => {
  it("reports plain counts and per-dimension score trends", () => {
    const now = at(2026, 10, 25);
    const subs = Array.from({ length: 12 }, (_, i) =>
      submission(at(2026, 10, i + 1), scores(50 + i * 2)),
    );
    const summary = summarize({
      units: [
        unitRecord(1, { status: "completed" }),
        unitRecord(2, { status: "in_progress" }),
        unitRecord(3, { status: "needs_review" }),
        unitRecord(4),
      ],
      cards: [card("a", "new"), card("b", "learning"), card("c", "young"), card("d", "mature")],
      submissions: [...subs, submission(at(2026, 10, 24), null)],
      readings: [
        reading("x", at(2026, 10, 1)),
        reading("y", at(2026, 10, 2), [], { completedAt: null }),
      ],
      sessionEvents: [
        event("session_completed", at(2026, 10, 24), { minutes: 25 }),
        event("session_completed", at(2026, 10, 10), { minutes: 10 }),
        event("session_completed", at(2026, 9, 1), { minutes: 99 }),
      ],
      now,
    });
    expect(summary.units).toEqual({ total: 4, completed: 1, inProgress: 1, needsReview: 1 });
    expect(summary.words).toEqual({ saved: 4, new: 1, learning: 2, mature: 1 });
    expect(summary.minutes).toEqual({ last7Days: 25, last30Days: 35 });
    expect(summary.articlesRead).toBe(1);
    expect(summary.writing.reviewed).toBe(12);
    const grammar = summary.writing.dimensions.find((d) => d.dimension === "grammar");
    expect(grammar?.values).toHaveLength(10);
    expect(grammar?.values[0]).toBe(54);
    expect(grammar?.change).toBe(18);
    expect(grammar?.average).toBe(63);
  });
});
