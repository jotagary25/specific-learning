import type { TimelineExpected, TimelinePlacement } from "@english-course/shared";
import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import styles from "./Timeline.module.css";
import { describeValue, toPercent, valueFromKey, valueFromPointer } from "./timeline-geometry.ts";

type Handle = "start" | "end" | "interruptAt";

const HANDLE_LABELS: Record<Handle, string> = {
  start: "Start",
  end: "End",
  interruptAt: "Interruption",
};

type Props = {
  placement: TimelinePlacement;
  onChange?: (next: TimelinePlacement) => void;
  /** Drawn as an overlay after checking. */
  expected?: TimelineExpected;
  disabled?: boolean;
};

function handlesOf(placement: { kind: string; end?: number; interruptAt?: number }): Handle[] {
  const handles: Handle[] = ["start"];
  if (placement.kind !== "point") handles.push("end");
  if (placement.kind === "interrupted") handles.push("interruptAt");
  return handles;
}

/** Visual shape of a placement: a point, a bar, habit ticks or an interruption marker. */
function Shape({
  shape,
  variant,
}: {
  shape: TimelineExpected | TimelinePlacement;
  variant: string;
}) {
  const start = Math.min(shape.start, shape.end ?? shape.start);
  const end = Math.max(shape.start, shape.end ?? shape.start);
  if (shape.kind === "point") {
    return (
      <span
        className={styles.point}
        data-variant={variant}
        style={{ left: `${toPercent(shape.start)}%` }}
      />
    );
  }
  const ticks =
    shape.kind === "habit"
      ? Array.from({ length: 7 }, (_, i) => start + ((end - start) * i) / 6)
      : [];
  return (
    <>
      <span
        className={styles.bar}
        data-kind={shape.kind}
        data-variant={variant}
        style={{ left: `${toPercent(start)}%`, width: `${toPercent(end) - toPercent(start)}%` }}
      />
      {ticks.map((tick) => (
        <span
          key={tick}
          className={styles.tick}
          data-variant={variant}
          style={{ left: `${toPercent(tick)}%` }}
        />
      ))}
      {shape.kind === "interrupted" && shape.interruptAt !== undefined ? (
        <span
          className={styles.interrupt}
          data-variant={variant}
          style={{ left: `${toPercent(shape.interruptAt)}%` }}
        />
      ) : null}
    </>
  );
}

/**
 * Horizontal past–now–future axis. Handles drag with pointer events (mouse, touch, pen) and are
 * sliders for the keyboard (arrows, Page Up/Down, Home/End).
 */
export function TimelineAxis({ placement, onChange, expected, disabled }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<Handle | null>(null);

  const move = (handle: Handle, value: number) => {
    if (disabled || !onChange) return;
    onChange({ ...placement, [handle]: value });
  };

  const onPointerDown = (handle: Handle) => (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    dragging.current = handle;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus();
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const handle = dragging.current;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!handle || !rect) return;
    move(handle, valueFromPointer(event.clientX, rect));
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    dragging.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const onKeyDown = (handle: Handle) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = valueFromKey(placement[handle] ?? 0, event.key);
    if (next === undefined) return;
    event.preventDefault();
    move(handle, next);
  };

  return (
    <div className={styles.axis}>
      <div ref={trackRef} className={styles.track}>
        <span className={styles.line} aria-hidden="true" />
        <span className={styles.now} style={{ left: "50%" }} aria-hidden="true" />
        {expected ? <Shape shape={expected} variant="expected" /> : null}
        <Shape shape={placement} variant="learner" />
        {handlesOf(placement).map((handle) => {
          const value = placement[handle] ?? 0;
          return (
            <button
              key={handle}
              type="button"
              role="slider"
              className={styles.handle}
              data-handle={handle}
              aria-label={HANDLE_LABELS[handle]}
              aria-valuemin={-1}
              aria-valuemax={1}
              aria-valuenow={value}
              aria-valuetext={describeValue(value)}
              aria-disabled={disabled || undefined}
              style={{ left: `${toPercent(value)}%` }}
              onPointerDown={onPointerDown(handle)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown(handle)}
            />
          );
        })}
      </div>
      <div className={styles.labels} aria-hidden="true">
        <span>Past</span>
        <span className={styles.nowLabel}>Now</span>
        <span>Future</span>
      </div>
    </div>
  );
}
