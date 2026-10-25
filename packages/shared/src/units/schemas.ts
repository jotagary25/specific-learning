import { z } from "zod";

/** Answer-checking result contract shared by web (instant feedback) and api (persistence). */

export const BlankVerdict = z.enum(["correct", "almost", "incorrect"]);
export type BlankVerdict = z.infer<typeof BlankVerdict>;

export const BlankResult = z.object({
  verdict: BlankVerdict,
  /** The key alternative the input matched (or nearly matched). */
  matched: z.string().optional(),
});
export type BlankResult = z.infer<typeof BlankResult>;

export const ItemStatus = z.enum(["correct", "partial", "incorrect", "needs-ai"]);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const ItemCheckResult = z.object({
  status: ItemStatus,
  blanks: z.array(BlankResult),
  /** Share of blanks accepted (correct or almost), 0..1. Always 0 for needs-ai. */
  score: z.number().min(0).max(1),
});
export type ItemCheckResult = z.infer<typeof ItemCheckResult>;

/** One attempted item of a unit. A needs-ai result is replaced once the AI resolves it. */
export const ItemOutcome = z.object({
  isExample: z.boolean(),
  result: ItemCheckResult,
});
export type ItemOutcome = z.infer<typeof ItemOutcome>;

export const UnitCompletion = z.object({
  /** Items that count toward the score: not examples, not awaiting AI. */
  graded: z.number().int().nonnegative(),
  /** Graded items fully accepted (almost included). */
  correct: z.number().int().nonnegative(),
  /** Graded items accepted with at least one "almost" blank. */
  almost: z.number().int().nonnegative(),
  /** Items still waiting for the AI check. */
  pending: z.number().int().nonnegative(),
  /** Mean item score over graded items, 0..1. */
  ratio: z.number().min(0).max(1),
  completed: z.boolean(),
});
export type UnitCompletion = z.infer<typeof UnitCompletion>;
