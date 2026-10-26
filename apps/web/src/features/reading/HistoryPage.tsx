import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import styles from "./Reading.module.css";
import { fetchHistory, readingKeys } from "./reading.api.ts";

/** `/reading/history`: every daily article, newest first. */
export function HistoryPage() {
  const history = useQuery({ queryKey: readingKeys.history, queryFn: fetchHistory });
  return (
    <section className={styles.page} aria-labelledby="history-title">
      <div className={styles.row}>
        <h1 id="history-title" className={styles.title}>
          Past readings
        </h1>
        <Link to="/reading" className={styles.muted}>
          Today
        </Link>
      </div>
      {history.isPending ? <p className={styles.muted}>Loading…</p> : null}
      {history.isError ? <p className={styles.error}>{history.error.message}</p> : null}
      {history.data?.articles.length === 0 ? (
        <p className={styles.muted}>No articles yet.</p>
      ) : null}
      <ul className={styles.historyList}>
        {history.data?.articles.map((article) => (
          <li key={article.id}>
            <Link to={`/reading/${article.id}`} className={styles.historyItem}>
              <span className={styles.muted}>
                {article.selectedFor} · {article.topic ?? "other"} · {article.wordCount} words
              </span>
              <span className={styles.label}>{article.title}</span>
              <span className={styles.badge} data-done={article.completed}>
                {article.completed ? "Done" : "Not finished"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
