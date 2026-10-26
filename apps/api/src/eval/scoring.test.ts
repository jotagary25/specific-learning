import type { EvalSampleResult, ReviewWritingOutput } from "@english-course/shared";
import { describe, expect, it } from "vitest";
import {
  aggregate,
  failedMetrics,
  looksSpanish,
  overallScore,
  scoreExerciseHint,
  scoreReview,
  scoreRewrite,
  spansOverlap,
} from "./scoring.ts";

const TEXT =
  "Right now many companies are using AI agents for write code. I think this trend grow very fast this year, and developers is worried about her jobs.";

const EXPECTED = [
  { span: "for write", type: "grammar", unitId: 62, correction: "to write" },
  { span: "this trend grow", type: "grammar", unitId: 1, correction: "this trend is growing" },
  { span: "developers is", type: "grammar", unitId: 77, correction: "developers are" },
  { span: "her jobs", type: "word_choice", unitId: null, correction: "their jobs" },
];

const CATALOG = new Set([1, 2, 3, 4, 5, 6]);

type Finding = ReviewWritingOutput["errors"][number];
const finding = (id: string, span: string, extra: Partial<Finding> = {}): Finding => ({
  id,
  span,
  type: "grammar",
  unitId: null,
  hintEs: "Revisa el verbo: el sujeto es plural y la acción está en curso.",
  ...extra,
});
const review = (errors: Finding[]): ReviewWritingOutput => ({
  errors,
  scores: { grammar: 50, clarity: 70, vocabulary: 60, naturalness: 55 },
  strengthEs: "Buen uso de conectores.",
});

const scoreOf = (errors: Finding[]) =>
  scoreReview({ text: TEXT, expected: EXPECTED, catalogUnitIds: CATALOG }, review(errors));

describe("spansOverlap", () => {
  it("matches overlapping spans ignoring case and extra spaces", () => {
    expect(spansOverlap(TEXT, "TREND   grow very", "this trend grow")).toBe(true);
    expect(spansOverlap(TEXT, "grow", "this trend grow")).toBe(true);
  });

  it("rejects disjoint spans", () => {
    expect(spansOverlap(TEXT, "her jobs", "developers is")).toBe(false);
    expect(spansOverlap(TEXT, "many companies", "for write")).toBe(false);
  });

  it("falls back to normalized containment when a span is not in the text", () => {
    expect(spansOverlap(TEXT, "developers is worried", "developers is")).toBe(true);
    expect(spansOverlap(TEXT, "developers was worried", "developers is")).toBe(false);
  });
});

describe("scoreReview", () => {
  it("scores a perfect review: recall over min(expected, 3), unit links, no leaks", () => {
    const { metrics, review: detail } = scoreOf([
      finding("e1", "trend grow", { unitId: 1 }),
      finding("e2", "developers is", { unitId: null }),
      finding("e3", "her jobs", { type: "word_choice" }),
    ]);
    expect(metrics.recall).toBe(1);
    expect(metrics.precision).toBe(1);
    // unit 77 is outside the eval catalog, so null is the right link.
    expect(metrics.unitAccuracy).toBe(1);
    expect(metrics.hintLeakFree).toBe(1);
    expect(metrics.spanishHints).toBe(1);
    expect(metrics.errorLimit).toBe(1);
    expect(detail.expected.map((e) => e.foundBy)).toEqual([null, "e1", "e2", "e3"]);
  });

  it("flags unmatched findings as possible real errors with a half penalty", () => {
    const { metrics, review: detail } = scoreOf([
      finding("e1", "for write"),
      finding("e2", "Right now"),
    ]);
    expect(metrics.recall).toBeCloseTo(1 / 3);
    expect(metrics.precision).toBeCloseTo(0.75);
    expect(detail.reported[1]).toMatchObject({ verdict: "possible_real_error", matches: [] });
  });

  it("checks unit links against the expected unit", () => {
    const { metrics, review: detail } = scoreOf([
      finding("e1", "this trend grow", { unitId: 2 }),
      finding("e2", "her jobs", { unitId: null }),
    ]);
    expect(metrics.unitAccuracy).toBe(0.5);
    expect(detail.reported.map((r) => r.unitCorrect)).toEqual([false, true]);
  });

  it("detects a hint that contains the correction after normalization", () => {
    const { metrics, review: detail } = scoreOf([
      finding("e1", "developers is", { hintEs: 'Debería ser "Developers  ARE" porque es plural.' }),
      finding("e2", "her jobs", { hintEs: "El posesivo no concuerda con el sujeto plural." }),
    ]);
    expect(detail.reported.map((r) => r.leak)).toEqual([true, false]);
    expect(metrics.hintLeakFree).toBe(0.5);
  });

  it("does not call a leak when only part of the correction appears as a word", () => {
    const { metrics } = scoreOf([
      finding("e1", "trend grow", {
        hintEs: "Esta acción está pasando ahora: ¿qué tiempo verbal usas con this trend?",
      }),
    ]);
    expect(metrics.hintLeakFree).toBe(1);
  });

  it("returns zero recall and null precision when nothing is reported", () => {
    const { metrics } = scoreOf([]);
    expect(metrics.recall).toBe(0);
    expect(metrics.precision).toBeNull();
    expect(metrics.hintLeakFree).toBeNull();
    expect(metrics.spanishHints).toBeNull();
  });

  it("flags English hints", () => {
    const { metrics } = scoreOf([
      finding("e1", "her jobs", { hintEs: "Check the possessive pronoun for a plural subject." }),
    ]);
    expect(metrics.spanishHints).toBe(0);
  });
});

describe("looksSpanish", () => {
  it("needs two Spanish stop-words", () => {
    expect(looksSpanish("Fíjate en el sujeto de la frase.")).toBe(true);
    expect(looksSpanish("Look at the subject.")).toBe(false);
  });
});

describe("scoreRewrite", () => {
  const input =
    "Many companies are using AI agents to write code. I think this trend is growing very fast this year.";

  it("passes distinct registers, kept meaning and similar length", () => {
    const { metrics, checks } = scoreRewrite(input, {
      versions: [
        {
          register: "casual",
          text: "Lots of companies are using AI agents to write code. This trend is growing fast this year.",
          noteEs: "Lots of es más informal.",
        },
        {
          register: "professional",
          text: "Many companies now use AI agents to write code, and I expect this trend to keep growing fast this year.",
          noteEs: "keep growing es natural.",
        },
      ],
    });
    expect(checks).toEqual({ registers: 1, meaning: 1, length: 1 });
    expect(metrics.rewriteQuality).toBe(1);
  });

  it("fails duplicated registers, lost meaning and length drift", () => {
    const { checks, metrics } = scoreRewrite(input, {
      versions: [
        { register: "casual", text: "Wow.", noteEs: "Corto." },
        {
          register: "casual",
          text: "The weather in Madrid is lovely today and it will be sunny again tomorrow.",
          noteEs: "Otro.",
        },
      ],
    });
    expect(checks).toEqual({ registers: 0, meaning: 0, length: 0.5 });
    expect(metrics.rewriteQuality).toBeCloseTo(1 / 6);
  });
});

describe("scoreExerciseHint", () => {
  const blanks = [["’m looking", "am looking"]];

  it("detects an answer leak", () => {
    expect(
      scoreExerciseHint({ level: 2, hintEs: "Usa am looking aquí." }, blanks).exerciseHintLeakFree,
    ).toBe(0);
  });

  it("accepts a hint without the answer", () => {
    expect(
      scoreExerciseHint({ level: 2, hintEs: "La acción pasa ahora: usa be + verbo-ing." }, blanks)
        .exerciseHintLeakFree,
    ).toBe(1);
  });
});

const sample = (overrides: Partial<EvalSampleResult>): EvalSampleResult => ({
  functionId: "review_writing",
  sampleId: "s",
  label: "s",
  ok: true,
  latencyMs: 100,
  attempts: 1,
  tokens: 10,
  metrics: {},
  ...overrides,
});

describe("aggregate", () => {
  it("averages metrics, rates JSON failures and computes latency percentiles", () => {
    const result = aggregate([
      sample({ latencyMs: 100, metrics: { recall: 1, hintLeakFree: 1 } }),
      sample({
        latencyMs: 300,
        attempts: 2,
        tokens: 20,
        metrics: { recall: 0.5, hintLeakFree: null },
      }),
      sample({
        ok: false,
        latencyMs: 200,
        attempts: 0,
        tokens: null,
        error: { code: "invalid_output", message: "bad" },
        metrics: failedMetrics("review_writing"),
      }),
      sample({
        ok: false,
        latencyMs: 400,
        attempts: 0,
        tokens: null,
        error: { code: "timeout", message: "slow" },
        metrics: failedMetrics("review_writing"),
      }),
    ]);
    expect(result.metrics.recall).toBe(0.375);
    expect(result.metrics.hintLeakFree).toBe(1);
    expect(result.metrics.jsonValidity).toBe(0.75);
    expect(result).toMatchObject({
      calls: 4,
      failures: 2,
      jsonFailureRate: 0.25,
      retryRate: 0.25,
      latencyMeanMs: 250,
      latencyP95Ms: 400,
      totalTokens: 30,
    });
  });

  it("returns empty stats for a run without samples", () => {
    expect(aggregate([])).toMatchObject({ calls: 0, overall: null, latencyMeanMs: null });
  });
});

describe("overallScore", () => {
  it("weights recall and hint leaks most", () => {
    const highRecall = overallScore({ recall: 1, hintLeakFree: 1, precision: 0, unitAccuracy: 0 });
    const highPrecision = overallScore({
      recall: 0,
      hintLeakFree: 0,
      precision: 1,
      unitAccuracy: 1,
    });
    expect(highRecall).toBeCloseTo((0.55 / 0.75) * 100);
    expect(highPrecision).toBeCloseTo((0.2 / 0.75) * 100);
  });

  it("renormalizes over measurable metrics and is null when none are", () => {
    expect(overallScore({ recall: 0.5, precision: null })).toBeCloseTo(50);
    expect(overallScore({})).toBeNull();
  });
});
