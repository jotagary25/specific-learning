import { z } from "zod";
import type { TimelineExpected } from "../content/index.ts";

const axis = z.number().min(-1).max(1);

/**
 * What the learner dropped on the timeline: the kind they picked and the handle positions
 * (same normalized axis as `TimelineExpected`: -1 past, 0 now, +1 future). Not refined, since
 * a wrong placement is a valid answer.
 */
export const TimelinePlacement = z.object({
  kind: z.enum(["point", "span", "ongoing-now", "interrupted", "habit", "state"]),
  start: axis,
  end: axis.optional(),
  interruptAt: axis.optional(),
});
export type TimelinePlacement = z.infer<typeof TimelinePlacement>;

export type TimelineHandle = "start" | "end" | "interruptAt";

export type TimelineCheck = {
  correct: boolean;
  kindCorrect: boolean;
  /** One flag per handle the expected shape has; `true` = inside the tolerance. */
  handles: Partial<Record<TimelineHandle, boolean>>;
};

// Guards against floating-point drift on the inclusive tolerance boundary.
const EPSILON = 1e-9;
const near = (actual: number | undefined, expected: number, tolerance: number) =>
  actual !== undefined && Math.abs(actual - expected) <= tolerance + EPSILON;

/**
 * Deterministic timeline-drag check (spec §3.2). The kind must match exactly; each handle of
 * the expected shape must be within `tolerance`; the kind's meaning must hold (a span ends
 * before now, an ongoing action is still running at now, an interruption falls inside the action).
 */
export function checkTimelinePlacement(
  expected: TimelineExpected,
  tolerance: number,
  placement: TimelinePlacement,
): TimelineCheck {
  const kindCorrect = placement.kind === expected.kind;
  let { start, end } = placement;
  if (end !== undefined && end < start) [start, end] = [end, start];

  const handles: TimelineCheck["handles"] = { start: near(start, expected.start, tolerance) };
  if (expected.end !== undefined) {
    let endOk = near(end, expected.end, tolerance);
    if (expected.kind === "span" && (end ?? 0) > 0) endOk = false;
    if (expected.kind === "ongoing-now" && (end === undefined || end < 0)) endOk = false;
    handles.end = endOk;
  }
  if (expected.kind === "ongoing-now" && start >= 0) handles.start = false;
  if (expected.interruptAt !== undefined) {
    const at = placement.interruptAt;
    handles.interruptAt =
      near(at, expected.interruptAt, tolerance) &&
      at !== undefined &&
      at > start &&
      at <= (end ?? start);
  }

  const correct = kindCorrect && Object.values(handles).every(Boolean);
  return { correct, kindCorrect, handles };
}
