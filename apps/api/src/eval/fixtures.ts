import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type EvalFunctionId,
  type EvalSampleResult,
  type ExerciseItem,
  type HintExerciseOutput,
  type ReviewWritingOutput,
  type RewriteNaturalOutput,
  Unit,
  UnitIndex,
  WritingEvalSamples,
} from "@english-course/shared";
import type { z } from "zod";
import { prompts } from "../prompts/index.ts";
import type { ChatMessage } from "../shared/llm/types.ts";

const reviewWritingPrompt = prompts.review_writing;
const rewriteNaturalPrompt = prompts.rewrite_natural;
const hintExercisePrompt = prompts.hint_exercise;

import { scoreExerciseHint, scoreReview, scoreRewrite } from "./scoring.ts";

/** What scoring adds to a sample result. */
export type CaseScore = Pick<EvalSampleResult, "metrics" | "checks" | "review">;

/** One fixture call: the real prompt messages plus its deterministic scorer. */
export type EvalCase = {
  functionId: EvalFunctionId;
  sampleId: string;
  label: string;
  messages: ChatMessage[];
  schema: z.ZodType;
  /** `output` has already been validated by `schema`. */
  score: (output: unknown) => CaseScore;
};

export type EvalFixtures = Record<EvalFunctionId, EvalCase[]>;

/**
 * Exercise items with deterministic keys from units 1–6 used for the hint leak check. Each
 * carries a plausible wrong answer and the hint attempt (level) requested.
 */
export const HINT_ITEMS = [
  { unit: 1, exercise: "1.1", num: "2.", attempt: 2, previous: "I look" },
  { unit: 2, exercise: "2.3", num: "3.", attempt: 3, previous: "rise" },
  { unit: 4, exercise: "4.4", num: "2.", attempt: 3, previous: "is" },
  { unit: 5, exercise: "5.2", num: "2.", attempt: 2, previous: "teached" },
  { unit: 6, exercise: "6.4", num: "2.", attempt: 3, previous: "did you do" },
] as const;

const LEVEL = "B1";

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const theorySummary = (unit: Unit, maxChars = 2500) =>
  unit.theory
    .map((section) => `${section.letter}. ${stripHtml(section.html)}`)
    .join("\n")
    .slice(0, maxChars);

/** Applies every known correction to the sample text: the input of `rewrite_natural`. */
export function correctedText(
  text: string,
  errors: readonly { span: string; correction: string }[],
) {
  return errors.reduce((acc, e) => acc.replace(e.span, e.correction), text);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadEvalFixtures(contentDir: string): Promise<EvalFixtures> {
  const samples = WritingEvalSamples.parse(
    await readJson(join(contentDir, "eval", "writing-samples.json")),
  ).samples;
  const index = UnitIndex.parse(await readJson(join(contentDir, "units", "index.json")));
  const units = new Map<number, Unit>();
  for (const summary of index.units) {
    units.set(summary.number, Unit.parse(await readJson(join(contentDir, "units", summary.file))));
  }
  const catalog = [...units.values()].map((u) => ({ id: u.number, title: u.title }));
  const catalogUnitIds = new Set(catalog.map((u) => u.id));

  const review: EvalCase[] = samples.map((sample) => {
    const target = catalog.find((u) => u.id === sample.targetUnitId) ?? {
      id: sample.targetUnitId,
      title: `Unit ${sample.targetUnitId}`,
    };
    return {
      functionId: "review_writing",
      sampleId: sample.id,
      label: sample.topic,
      messages: reviewWritingPrompt.build({
        text: sample.text,
        mission: {
          title: sample.topic,
          format: sample.format,
          promptEn: `Write a ${sample.format} post about: ${sample.topic}.`,
          targetUnit: target,
        },
        level: LEVEL,
        units: catalog,
      }),
      schema: reviewWritingPrompt.schema,
      score: (output) =>
        scoreReview(
          { text: sample.text, expected: sample.knownErrors, catalogUnitIds },
          output as ReviewWritingOutput,
        ),
    };
  });

  const rewrite: EvalCase[] = samples.map((sample) => {
    const text = correctedText(sample.text, sample.knownErrors);
    return {
      functionId: "rewrite_natural",
      sampleId: sample.id,
      label: sample.topic,
      messages: rewriteNaturalPrompt.build({ text, format: sample.format }),
      schema: rewriteNaturalPrompt.schema,
      score: (output) => scoreRewrite(text, output as RewriteNaturalOutput),
    };
  });

  const hint: EvalCase[] = HINT_ITEMS.map((fixture) => {
    const unit = units.get(fixture.unit);
    const exercise = unit?.exercises.find((e) => e.id === fixture.exercise);
    const item: ExerciseItem | undefined = exercise?.items.find((i) => i.num === fixture.num);
    if (!unit || !exercise || !item?.answer) {
      throw new Error(`eval: hint fixture ${fixture.exercise} ${fixture.num} not found in content`);
    }
    const blanks = item.answer.blanks;
    return {
      functionId: "hint_exercise",
      sampleId: `${fixture.exercise}-${fixture.num.replace(/\.$/, "")}`,
      label: `Unit ${unit.number}, exercise ${fixture.exercise} item ${fixture.num}`,
      messages: hintExercisePrompt.build({
        unit: {
          id: unit.number,
          title: unit.title,
          grammarFocus: unit.subtitle ? `${unit.title} (${unit.subtitle})` : unit.title,
        },
        theorySummary: theorySummary(unit),
        instruction: exercise.instruction,
        lines: item.lines,
        keyAnswers: blanks.map((alternatives) => alternatives[0] ?? "").filter(Boolean),
        attempt: fixture.attempt,
        previousAnswers: [fixture.previous],
      }),
      schema: hintExercisePrompt.schema,
      score: (output) => ({ metrics: scoreExerciseHint(output as HintExerciseOutput, blanks) }),
    };
  });

  return { review_writing: review, rewrite_natural: rewrite, hint_exercise: hint };
}

export const fixtureCounts = (fixtures: EvalFixtures) =>
  ({
    review_writing: fixtures.review_writing.length,
    rewrite_natural: fixtures.rewrite_natural.length,
    hint_exercise: fixtures.hint_exercise.length,
  }) satisfies Record<EvalFunctionId, number>;
