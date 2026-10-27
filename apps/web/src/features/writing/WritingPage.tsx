import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowLeftIcon, ArrowRightIcon, Button, Eyebrow, Panel } from "../../shared/ui/index.ts";
import { LevelLine, MissionCard } from "./MissionCard.tsx";
import styles from "./Writing.module.css";
import { WritingWorkspace } from "./WritingWorkspace.tsx";
import { fetchCurrent, generateMission, writingKeys } from "./writing.api.ts";

/** Page title block of the writing pages: eyebrow, Gloock title, side link, hairline. */
export function WritingHeader({
  eyebrow,
  title,
  link,
  back = false,
}: {
  eyebrow: string;
  title: string;
  link: { to: string; label: string };
  back?: boolean;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerText}>
        <Eyebrow rule>{eyebrow}</Eyebrow>
        <h1 className={styles.title}>{title}</h1>
      </div>
      <Link to={link.to} className={styles.sideLink}>
        {back ? <ArrowLeftIcon size={18} /> : null}
        {link.label}
        {back ? null : <ArrowRightIcon size={18} />}
      </Link>
    </header>
  );
}

export function WritingPage() {
  const queryClient = useQueryClient();
  const current = useQuery({ queryKey: writingKeys.current, queryFn: fetchCurrent });
  const generate = useMutation({
    mutationFn: generateMission,
    onSuccess: (res) =>
      queryClient.setQueryData(writingKeys.current, {
        level: res.level,
        mission: res.mission,
        submission: res.submission,
      }),
  });

  return (
    <div className={styles.page}>
      <WritingHeader
        eyebrow="Personal brand · weekly post"
        title="Writing"
        link={{ to: "/writing/history", label: "History" }}
      />
      {current.isPending ? <p className={styles.muted}>Loading…</p> : null}
      {current.isError ? (
        <p role="alert" className={styles.error}>
          Could not load your mission: {current.error.message}
        </p>
      ) : null}
      {current.data ? <LevelLine level={current.data.level} /> : null}
      {current.data && !current.data.mission ? (
        <Panel tone="lime" padding="lg" className={styles.start}>
          <Eyebrow rule>Next mission</Eyebrow>
          <h2 className={styles.startTitle}>Your week, in your words.</h2>
          <p className={styles.lead}>
            Write a short post for your personal brand, built on what you read this week.
          </p>
          <div className={styles.actions}>
            <Button
              arrow
              fullWidth="mobile"
              disabled={generate.isPending}
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? "Preparing…" : "Get a mission"}
            </Button>
          </div>
          {generate.isError ? (
            <p role="alert" className={styles.error}>
              {generate.error.message}
            </p>
          ) : null}
        </Panel>
      ) : null}
      {current.data?.mission && current.data.submission ? (
        <>
          <MissionCard mission={current.data.mission} />
          <WritingWorkspace
            key={current.data.mission.id}
            mission={current.data.mission}
            submission={current.data.submission}
          />
        </>
      ) : null}
    </div>
  );
}
