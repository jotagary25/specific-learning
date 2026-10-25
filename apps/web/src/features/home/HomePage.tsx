import { useQuery } from "@tanstack/react-query";
import styles from "./HomePage.module.css";
import { fetchHealth } from "./health.api.ts";

export function HomePage() {
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  return (
    <section>
      <h1 className={styles.title}>Welcome</h1>
      {health.isPending && <p className={styles.muted}>Checking the server…</p>}
      {health.isError && <p className={styles.down}>API: unreachable</p>}
      {health.isSuccess && (
        <ul className={styles.status}>
          <li className={styles.ok}>API: {health.data.status}</li>
          <li className={health.data.db === "ok" ? styles.ok : styles.down}>
            Database: {health.data.db}
          </li>
        </ul>
      )}
    </section>
  );
}
