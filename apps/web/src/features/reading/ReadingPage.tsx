import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowRightIcon, Button, Eyebrow, Panel } from "../../shared/ui/index.ts";
import styles from "./Reading.module.css";
import { ReadingFlow } from "./ReadingFlow.tsx";
import { RecallCard } from "./RecallCard.tsx";
import { fetchToday, readingKeys, runEditor } from "./reading.api.ts";

function EmptyState() {
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: runEditor,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: readingKeys.all }),
  });
  const result = run.data;
  return (
    <Panel tone="lime" padding="lg" className={styles.empty}>
      <Eyebrow rule>The editor's desk</Eyebrow>
      <h2 className={styles.emptyTitle}>Nothing on the press yet.</h2>
      <p className={styles.lead}>
        Today's article is not ready yet. The editor picks one every morning.
      </p>
      <div className={styles.actions}>
        <Button arrow fullWidth="mobile" disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? "Choosing an article…" : "Run editor now"}
        </Button>
      </div>
      {result?.status === "no-candidates" ? (
        <p className={styles.error} role="status">
          No suitable article found right now
          {result.sources.some((s) => s.error)
            ? ` (${result.sources.flatMap((s) => (s.error ? [`${s.name}: ${s.error}`] : [])).join("; ")})`
            : ""}
          . Try again later.
        </p>
      ) : null}
      {run.isError ? <p className={styles.error}>{run.error.message}</p> : null}
    </Panel>
  );
}

/** Page title block shared by the reading pages: eyebrow, Gloock title, side link, hairline. */
export function ReadingHeader({
  id,
  eyebrow,
  title,
  link,
}: {
  id: string;
  eyebrow: string;
  title: string;
  link: { to: string; label: string };
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerText}>
        <Eyebrow rule>{eyebrow}</Eyebrow>
        <h1 id={id} className={styles.title}>
          {title}
        </h1>
      </div>
      <Link to={link.to} className={styles.sideLink}>
        {link.label}
        <ArrowRightIcon size={18} />
      </Link>
    </header>
  );
}

/** `/reading`: yesterday's recall (when due) and today's 6-step reading. */
export function ReadingPage() {
  const today = useQuery({ queryKey: readingKeys.today, queryFn: fetchToday });
  return (
    <section className={styles.page} aria-labelledby="reading-title">
      <ReadingHeader
        id="reading-title"
        eyebrow="Daily reading · 6 steps"
        title="Today's reading"
        link={{ to: "/reading/history", label: "History" }}
      />
      <RecallCard />
      {today.isPending ? <p className={styles.muted}>Loading…</p> : null}
      {today.isError ? <p className={styles.error}>{today.error.message}</p> : null}
      {today.data && !today.data.reading ? <EmptyState /> : null}
      {today.data?.reading ? <ReadingFlow detail={today.data.reading} /> : null}
    </section>
  );
}
