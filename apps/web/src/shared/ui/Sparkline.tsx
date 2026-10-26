import styles from "./Sparkline.module.css";
import { sparklinePoints } from "./sparkline.ts";

type SparklineProps = {
  /** 0–100 values, oldest first. */
  values: readonly number[];
  /** Accessible description, including the values with their context. */
  label: string;
  width?: number;
  height?: number;
  className?: string;
};

/** Minimal score line (0–100), drawn in `currentColor`. */
export function Sparkline({ values, label, width = 240, height = 60, className }: SparklineProps) {
  return (
    <svg
      className={className ? `${styles.sparkline} ${className}` : styles.sparkline}
      viewBox={`-4 -4 ${width + 8} ${height + 8}`}
      role="img"
      aria-label={label}
    >
      <polyline
        points={sparklinePoints(values, width, height)}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
