import { useQuery } from "@tanstack/react-query";
import { StatusDot } from "../../shared/ui/index.ts";
import styles from "./HealthIndicator.module.css";
import { fetchHealth } from "./health.api.ts";

/** Small server status line for the footer: a dot (decorative) plus the words. */
export function HealthIndicator() {
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  if (health.isPending) {
    return (
      <span className={`${styles.item} ${styles.muted}`}>
        <StatusDot filled={false} pulse />
        Checking the server…
      </span>
    );
  }
  if (health.isError) {
    return (
      <span className={`${styles.item} ${styles.down}`}>
        <StatusDot tone="incorrect" />
        API: unreachable
      </span>
    );
  }
  const dbOk = health.data.db === "ok";
  return (
    <span className={styles.status}>
      <span className={`${styles.item} ${styles.ok}`}>
        <StatusDot tone="correct" />
        API: {health.data.status}
      </span>
      <span className={`${styles.item} ${dbOk ? styles.ok : styles.down}`}>
        <StatusDot tone={dbOk ? "correct" : "incorrect"} />
        Database: {health.data.db}
      </span>
    </span>
  );
}
