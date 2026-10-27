import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ArrowLeftIcon } from "../../shared/ui/index.ts";
import styles from "./Reading.module.css";
import { ReadingFlow } from "./ReadingFlow.tsx";
import { fetchArticle, readingKeys } from "./reading.api.ts";

/** `/reading/:id`: a past article, with its session (finish or review it). */
export function ArticlePage() {
  const id = useParams().id ?? "";
  const detail = useQuery({ queryKey: readingKeys.article(id), queryFn: () => fetchArticle(id) });
  return (
    <section className={styles.page} aria-label="Reading">
      <p className={styles.backRow}>
        <Link to="/reading/history" className={styles.sideLink}>
          <ArrowLeftIcon size={18} />
          Past readings
        </Link>
      </p>
      {detail.isPending ? <p className={styles.muted}>Loading…</p> : null}
      {detail.isError ? <p className={styles.error}>{detail.error.message}</p> : null}
      {detail.data ? <ReadingFlow detail={detail.data} /> : null}
    </section>
  );
}
