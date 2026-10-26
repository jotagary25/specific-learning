import { useQuery } from "@tanstack/react-query";
import styles from "./HealthIndicator.module.css";
import { fetchHealth } from "./health.api.ts";

/** Small server status line for the footer. */
export function HealthIndicator() {
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  if (health.isPending) return <span className={styles.muted}>Checking the server…</span>;
  if (health.isError) return <span className={styles.down}>API: unreachable</span>;
  return (
    <span className={styles.status}>
      <span className={styles.ok}>API: {health.data.status}</span>
      <span className={health.data.db === "ok" ? styles.ok : styles.down}>
        Database: {health.data.db}
      </span>
    </span>
  );
}
