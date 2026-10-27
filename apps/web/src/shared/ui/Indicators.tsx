import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Indicators.module.css";

const join = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

export type StateTone = "neutral" | "correct" | "almost" | "incorrect";

export type StatusDotProps = {
  /** Filled (active, live, on) or outline (inactive, off). */
  filled?: boolean;
  tone?: "current" | Exclude<StateTone, "neutral">;
  /** Gentle pulse for "in motion" states (off with reduced motion). */
  pulse?: boolean;
  /** Read by assistive tech; omit when the adjacent text already says it. */
  label?: string;
  className?: string;
};

/** 7px dot: filled = active, outline = inactive. Never the only carrier of meaning. */
export function StatusDot({
  filled = true,
  tone = "current",
  pulse = false,
  label,
  className,
}: StatusDotProps) {
  const classes = join(styles.dot, filled && styles.dotFilled, pulse && styles.pulse, className);
  const state = tone === "current" ? undefined : tone;
  return label ? (
    <span className={classes} data-state={state} role="img" aria-label={label} />
  ) : (
    <span className={classes} data-state={state} aria-hidden="true" />
  );
}

export type StatProps = {
  label: ReactNode;
  value: ReactNode;
  /** Small trailing unit, e.g. "%" or "min". */
  unit?: ReactNode;
  size?: "md" | "lg";
  /** Label above the number instead of beside it. */
  stacked?: boolean;
  className?: string;
};

/** A labelled Gloock number, e.g. "Breeze 34". */
export function Stat({ label, value, unit, size = "md", stacked = false, className }: StatProps) {
  return (
    <p className={join(styles.stat, styles[`stat-${size}`], stacked && styles.stacked, className)}>
      <span className={styles.statLabel}>{label}</span>{" "}
      <span className={join("numeral", styles.statValue)}>
        {value}
        {unit ? <span className={styles.statUnit}>{unit}</span> : null}
      </span>
    </p>
  );
}

export type ProgressLineProps = {
  /** 0–100. */
  value: number;
  /** Accessible name, e.g. "Unit progress". */
  label: string;
  /** Show the percentage at the right. */
  showValue?: boolean;
  className?: string;
};

/** Thin line with a filled segment and an optional percentage. */
export function ProgressLine({ value, label, showValue = true, className }: ProgressLineProps) {
  const clamped = Math.round(Math.min(100, Math.max(0, value)));
  return (
    <div className={join(styles.progress, className)}>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
      >
        <span className={styles.fill} style={{ inlineSize: `${clamped}%` }} />
      </div>
      {showValue ? (
        <span className={styles.percent} aria-hidden="true">
          {clamped}%
        </span>
      ) : null}
    </div>
  );
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StateTone | "accent";
  children: ReactNode;
};

/** Small square label for a state ("Correct", "Almost", "Try again") or a tag. */
export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span {...rest} className={join(styles.badge, className)} data-state={tone}>
      {children}
    </span>
  );
}
