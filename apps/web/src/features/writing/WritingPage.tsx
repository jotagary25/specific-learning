import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { LevelLine, MissionCard } from "./MissionCard.tsx";
import styles from "./Writing.module.css";
import { WritingWorkspace } from "./WritingWorkspace.tsx";
import { fetchCurrent, generateMission, writingKeys } from "./writing.api.ts";

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
      <div className={styles.row}>
        <h1 className={styles.title}>Writing</h1>
        <Link to="/writing/history" className={styles.linkButton}>
          History
        </Link>
      </div>
      {current.isPending ? <p className={styles.muted}>Loading…</p> : null}
      {current.isError ? (
        <p role="alert" className={styles.error}>
          Could not load your mission: {current.error.message}
        </p>
      ) : null}
      {current.data ? <LevelLine level={current.data.level} /> : null}
      {current.data && !current.data.mission ? (
        <section className={styles.card}>
          <p>Write a short post for your personal brand, built on what you read this week.</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={generate.isPending}
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? "Preparing…" : "Get a mission"}
            </button>
          </div>
          {generate.isError ? (
            <p role="alert" className={styles.error}>
              {generate.error.message}
            </p>
          ) : null}
        </section>
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
