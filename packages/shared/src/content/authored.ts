import { z } from "zod";

/**
 * Authored content contract (content/authored/**): material the book lacks, written for the
 * learner — the serial story per block, per-unit extras and timeline-drag items. Validated by
 * the api seed and consumed by the web. Spanish fields end in `Es`; everything else is English.
 */

const unitId = z.number().int().positive();

// ---------------------------------------------------------------------------------------------
// Serial story (spec §3.3)
// ---------------------------------------------------------------------------------------------

export const GrammarSpan = z.object({
  /** Exact substring of the chapter body (first occurrence is highlighted). */
  text: z.string().min(1),
  /** Unit whose grammar this span shows. */
  unitId,
  /** Short English note on why this form is used here. */
  note: z.string().min(1),
});
export type GrammarSpan = z.infer<typeof GrammarSpan>;

export const StoryChapter = z.object({
  /** Stable id: `b<block>-c<position>` ("b1-c1"). */
  id: z.string().regex(/^b\d+-c\d+$/),
  /** 1-based order inside the block. */
  position: z.number().int().positive(),
  /** Unit whose grammar the chapter is written in (one chapter per unit). */
  unitId,
  title: z.string().min(1),
  /** Chapter text; paragraphs separated by a blank line ("\n\n"). */
  body: z.string().min(1),
  grammarSpans: z.array(GrammarSpan).min(1),
  /** Cliffhanger line shown at the end of the chapter, pointing to the next one. */
  teaser: z.string().min(1),
});
export type StoryChapter = z.infer<typeof StoryChapter>;

export const StorySource = z.object({
  title: z.string().min(1),
  url: z.url(),
});
export type StorySource = z.infer<typeof StorySource>;

export const Story = z.object({
  blockId: z.number().int().positive(),
  title: z.string().min(1),
  /** One-line Spanish pitch shown before chapter 1. */
  pitchEs: z.string().min(1),
  /** Sources used to verify the historical facts. */
  sources: z.array(StorySource).min(1),
  chapters: z.array(StoryChapter).min(1),
});
export type Story = z.infer<typeof Story>;

// ---------------------------------------------------------------------------------------------
// Unit extras (spec §3.2): puzzle-before-rule, programmer analogy, Spanish-speaker pitfalls
// ---------------------------------------------------------------------------------------------

export const UnitPuzzle = z.object({
  /** Two contrasting sentences, both shown before the theory. */
  sentenceA: z.string().min(1),
  sentenceB: z.string().min(1),
  /** Question the learner answers (a guess) before seeing the reveal. */
  question: z.string().min(1),
  /** Explanation in Spanish, revealed after the guess. */
  revealEs: z.string().min(1),
});
export type UnitPuzzle = z.infer<typeof UnitPuzzle>;

export const Pitfall = z.object({
  wrong: z.string().min(1),
  right: z.string().min(1),
  explanationEs: z.string().min(1),
});
export type Pitfall = z.infer<typeof Pitfall>;

export const UnitExtras = z.object({
  puzzle: UnitPuzzle,
  /** Programmer analogy in Spanish (2–4 sentences). */
  analogyEs: z.string().min(1),
  /** Typical errors of Spanish speakers for this unit. */
  pitfalls: z.array(Pitfall).min(3).max(5),
  /** "Now I can…" statements (Spanish) added to the can-do log when the unit is completed. */
  canDoEs: z.array(z.string().min(1)).min(1).max(2),
});
export type UnitExtras = z.infer<typeof UnitExtras>;

/** File shape of `content/authored/units/unit-NNN.extras.json`. */
export const UnitExtrasFile = UnitExtras.extend({ unitId });
export type UnitExtrasFile = z.infer<typeof UnitExtrasFile>;

// ---------------------------------------------------------------------------------------------
// Timeline drag (spec §3.2): the learner places the action of a sentence on a time axis
// ---------------------------------------------------------------------------------------------

/**
 * Normalized time axis: -1 = distant past, 0 = now (the moment of speaking), +1 = future.
 * Values are positions on that axis, so the UI maps them linearly to its width.
 */
const axis = z.number().min(-1).max(1);

/**
 * Expected answer. The learner first picks a kind, then drags its handles:
 * - `point`: one finished event at `start` (e.g. simple past "It exploded").
 * - `span`: a finished period from `start` to `end`, both in the past (`end <= 0`).
 * - `ongoing-now`: an unfinished action around now: `start < 0 <= end` ("is getting smaller").
 * - `interrupted`: a longer action from `start` to `end`, cut by a short event at
 *   `interruptAt` with `start < interruptAt <= end` (past continuous + simple past).
 * - `habit`: repeated occurrences spread between `start` and `end` (drawn as ticks).
 * - `state`: a continuous situation without an "action" (know, live, need) from `start` to `end`.
 * `end` is required for every kind except `point`.
 */
export const TimelineExpected = z
  .object({
    kind: z.enum(["point", "span", "ongoing-now", "interrupted", "habit", "state"]),
    start: axis,
    end: axis.optional(),
    interruptAt: axis.optional(),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (v.kind !== "point" && v.end === undefined) issue(`${v.kind} needs an end`);
    if (v.end !== undefined && v.end < v.start) issue("end must be >= start");
    if (v.kind === "span" && (v.end ?? 0) > 0) issue("span must be finished (end <= 0)");
    if (v.kind === "ongoing-now" && !(v.start < 0 && (v.end ?? -1) >= 0)) {
      issue("ongoing-now must start before now and not end before now");
    }
    if (v.kind === "interrupted") {
      if (v.interruptAt === undefined) issue("interrupted needs interruptAt");
      else if (!(v.start < v.interruptAt && v.interruptAt <= (v.end ?? v.start))) {
        issue("interruptAt must fall inside (start, end]");
      }
    } else if (v.interruptAt !== undefined) {
      issue("interruptAt is only valid for interrupted");
    }
  });
export type TimelineExpected = z.infer<typeof TimelineExpected>;

export const TimelineItem = z.object({
  /** Stable id: `tl-<unit>-<n>` ("tl-1-2"). */
  id: z.string().regex(/^tl-\d+-\d+$/),
  sentence: z.string().min(1),
  expected: TimelineExpected,
  /**
   * Max distance per handle on the axis to count as correct (the kind must match exactly).
   * Larger for vague time words ("these days").
   */
  tolerance: z.number().positive().max(0.5).default(0.15),
  /** Spanish explanation shown after answering. */
  explanationEs: z.string().min(1),
});
export type TimelineItem = z.infer<typeof TimelineItem>;

/** File shape of `content/authored/units/unit-NNN.timeline.json`. */
export const UnitTimelineFile = z.object({
  unitId,
  items: z.array(TimelineItem).min(1),
});
export type UnitTimelineFile = z.infer<typeof UnitTimelineFile>;
