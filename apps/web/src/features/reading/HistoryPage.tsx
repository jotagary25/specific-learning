import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Badge } from "../../shared/ui/index.ts";
import styles from "./Reading.module.css";
import { ReadingHeader } from "./ReadingPage.tsx";
import { fetchHistory, readingKeys } from "./reading.api.ts";

/** "2026-10-25" → { day: "25", month: "Oct 2026" } without timezone shifts. */
function splitDate(date: string | null): { day: string; month: string } | null {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const name = new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString("en", {
    month: "short",
    timeZone: "UTC",
  });
  return { day: day ?? "", month: `${name} ${year}` };
}

/** `/reading/history`: every daily article, newest first. */
export function HistoryPage() {
  const history = useQuery({ queryKey: readingKeys.history, queryFn: fetchHistory });
  return (
    <section className={styles.page} aria-labelledby="history-title">
      <ReadingHeader
        id="history-title"
        eyebrow="Reading archive"
        title="Past readings"
        link={{ to: "/reading", label: "Today" }}
      />
      {history.isPending ? <p className={styles.muted}>Loading…</p> : null}
      {history.isError ? <p className={styles.error}>{history.error.message}</p> : null}
      {history.data?.articles.length === 0 ? (
        <p className={styles.muted}>No articles yet.</p>
      ) : null}
      <ul className={styles.historyList}>
        {history.data?.articles.map((article) => {
          const date = splitDate(article.selectedFor);
          return (
            <li key={article.id}>
              <Link to={`/reading/${article.id}`} className={styles.historyItem}>
                <span className={styles.historyDate}>
                  {date ? (
                    <>
                      <span className={`numeral ${styles.historyDay}`}>{date.day}</span>
                      <span className={styles.historyMonth}>{date.month}</span>
                    </>
                  ) : null}
                </span>
                <span className={styles.historyText}>
                  <span className={styles.historyTitle}>{article.title}</span>
                  <span className={styles.historyMeta}>
                    {article.topic ?? "other"} · {article.wordCount} words
                    {article.outlet ? ` · ${article.outlet}` : ""}
                  </span>
                </span>
                <Badge
                  tone={article.completed ? "correct" : "neutral"}
                  className={styles.historyBadge}
                >
                  {article.completed ? "Done" : "Not finished"}
                </Badge>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
