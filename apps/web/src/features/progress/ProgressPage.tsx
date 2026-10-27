import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Eyebrow } from "../../shared/ui/index.ts";
import { CanDoLog } from "./CanDoLog.tsx";
import { ErrorsPanel } from "./ErrorsPanel.tsx";
import styles from "./Progress.module.css";
import {
  fetchErrors,
  fetchMirrorDue,
  fetchSummary,
  fetchTimeline,
  progressKeys,
} from "./progress.api.ts";
import { monthName, monthOf } from "./progress.model.ts";
import { ScoreTrends, SummaryCards } from "./SummaryCards.tsx";
import { TimelineList } from "./TimelineList.tsx";

function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={`numeral ${styles.sectionNumber}`} aria-hidden="true">
          {number}
        </span>
        <h2 id={id} className={styles.heading}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Status({
  query,
  what,
}: {
  query: { isPending: boolean; error: Error | null };
  what: string;
}) {
  if (query.isPending) return <p className={styles.muted}>Loading {what}…</p>;
  if (query.error) {
    return (
      <p role="alert" className={styles.error}>
        Could not load {what}: {query.error.message}
      </p>
    );
  }
  return null;
}

export function ProgressPage() {
  const summary = useQuery({ queryKey: progressKeys.summary, queryFn: fetchSummary });
  const errors = useQuery({ queryKey: progressKeys.errors, queryFn: fetchErrors });
  const timeline = useQuery({ queryKey: progressKeys.timeline, queryFn: fetchTimeline });
  const due = useQuery({ queryKey: progressKeys.mirrorDue, queryFn: fetchMirrorDue });
  const month = due.data?.month ?? monthOf(new Date());

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.pageIntro}>
          <Eyebrow rule>From your own work</Eyebrow>
          <h1 className={styles.title}>Progress</h1>
          <p className={styles.lead}>
            What you can do now, from your own work. No streaks, no points.
          </p>
        </div>
        <p
          className={due.data?.due ? styles.mirrorDue : styles.mirrorLink}
          data-tone={due.data?.due ? "lime" : undefined}
        >
          {due.data?.due ? "Your monthly mirror is ready: " : null}
          <Link to={`/progress/mirror/${month}`} className={styles.mirrorAnchor}>
            Monthly mirror: {monthName(month)}
          </Link>
        </p>
      </header>

      <Section id="glance-heading" number="01" title="At a glance">
        <Status query={summary} what="your summary" />
        {summary.data ? <SummaryCards summary={summary.data} /> : null}
      </Section>

      <Section id="scores-heading" number="02" title="Writing scores">
        {summary.data ? <ScoreTrends writing={summary.data.writing} /> : null}
      </Section>

      <Section id="errors-heading" number="03" title="Your errors over time">
        <Status query={errors} what="your errors" />
        {errors.data ? <ErrorsPanel errors={errors.data} /> : null}
      </Section>

      <Section id="cando-heading" number="04" title="Can-do log">
        <CanDoLog />
      </Section>

      <Section id="timeline-heading" number="05" title="Timeline">
        <Status query={timeline} what="your timeline" />
        {timeline.data ? <TimelineList timeline={timeline.data} /> : null}
      </Section>
    </div>
  );
}
