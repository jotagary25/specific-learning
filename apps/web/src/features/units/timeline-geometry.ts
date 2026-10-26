import type { TimelinePlacement } from "@english-course/shared";

export type TimelineKind = TimelinePlacement["kind"];

export const KIND_LABELS: Record<TimelineKind, string> = {
  point: "One moment",
  span: "Finished period",
  "ongoing-now": "Happening around now",
  interrupted: "Interrupted action",
  habit: "Repeated habit",
  state: "Ongoing state",
};

/** Axis value (-1 past, 0 now, 1 future) → percentage from the left edge. */
export const toPercent = (value: number) => ((value + 1) / 2) * 100;

const clamp = (value: number) => Math.min(1, Math.max(-1, value));
const round = (value: number) => Math.round(value * 100) / 100;

/** Pointer x position over the axis element → axis value. */
export function valueFromPointer(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 0;
  return round(clamp(((clientX - rect.left) / rect.width) * 2 - 1));
}

const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -0.05,
  ArrowDown: -0.05,
  ArrowRight: 0.05,
  ArrowUp: 0.05,
  PageDown: -0.2,
  PageUp: 0.2,
};

/** Keyboard alternative to dragging: returns the new value, or undefined for other keys. */
export function valueFromKey(value: number, key: string): number | undefined {
  if (key === "Home") return -1;
  if (key === "End") return 1;
  const step = KEY_STEPS[key];
  return step === undefined ? undefined : round(clamp(value + step));
}

/**
 * Starting handles for a freshly picked kind. They sit in the near future on purpose, so no
 * past/now answer is accepted before the learner drags anything.
 */
export function initialPlacement(kind: TimelineKind): TimelinePlacement {
  if (kind === "point") return { kind, start: 0.5 };
  if (kind === "interrupted") return { kind, start: 0.3, end: 0.7, interruptAt: 0.5 };
  return { kind, start: 0.3, end: 0.7 };
}

/** Describes a value for screen readers. */
export function describeValue(value: number): string {
  if (Math.abs(value) < 0.03) return "now";
  const distance = Math.abs(value) > 0.6 ? "far" : Math.abs(value) > 0.25 ? "" : "just";
  const side = value < 0 ? "in the past" : "in the future";
  return [distance, side].filter(Boolean).join(" ");
}
