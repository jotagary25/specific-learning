import { MODE_MINUTES, type TodayMode, type TodayOverview } from "@english-course/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ParkingList } from "./ParkingList.tsx";
import { useStudySession } from "./SessionContext.tsx";
import { GREETINGS } from "./session.model.ts";
import styles from "./Today.module.css";
import { fetchToday, startSession, todayKeys } from "./today.api.ts";

const MODES: TodayMode[] = ["full", "slump", "minimum"];
const MODE_HINTS: Record<TodayMode, string> = {
  full: "Deep block",
  slump: "Light block",
  minimum: "Never zero",
};

function ModeSwitch({
  mode,
  suggested,
  onChange,
}: {
  mode: TodayMode;
  suggested: TodayMode;
  onChange: (mode: TodayMode) => void;
}) {
  return (
    <fieldset className={styles.modes}>
      <legend className={styles.srOnly}>Session length</legend>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          className={m === mode ? styles.modeActive : styles.mode}
          aria-pressed={m === mode}
          onClick={() => onChange(m)}
        >
          <strong>{MODE_MINUTES[m]} min</strong>
          <span>{m === suggested ? "Suggested" : MODE_HINTS[m]}</span>
        </button>
      ))}
    </fieldset>
  );
}

function Plan({ overview }: { overview: TodayOverview }) {
  return (
    <ol className={styles.plan} aria-label="Plan">
      {overview.plan.blocks.map((block) => (
        <li key={`${block.kind}-${block.title}`} className={styles.block}>
          <div className={styles.blockHead}>
            <Link to={block.deepLink} className={styles.blockTitle}>
              {block.title}
            </Link>
            <span className={styles.minutes}>{block.minutes} min</span>
          </div>
          <p className={styles.muted}>{block.reason}</p>
        </li>
      ))}
    </ol>
  );
}

export function TodayPage() {
  const [mode, setMode] = useState<TodayMode | null>(null);
  const session = useStudySession();
  const overview = useQuery({
    queryKey: todayKeys.overview(mode),
    queryFn: () => fetchToday(mode),
  });
  const start = useMutation({
    mutationFn: startSession,
    onSuccess: (created) => session.start(created, overview.data?.teaser ?? null),
  });

  const serverActive = overview.data?.activeSession;
  const { adopt } = session;
  useEffect(() => {
    if (serverActive) adopt(serverActive, overview.data?.teaser ?? null);
  }, [serverActive, adopt, overview.data?.teaser]);

  if (overview.isPending) return <p className={styles.muted}>Planning your session…</p>;
  if (overview.isError) return <p className={styles.error}>{overview.error.message}</p>;

  const data = overview.data;
  const selected = mode ?? data.plan.mode;
  const done = data.sessionsToday.filter((s) => s.endedAt !== null);
  const running = session.phase !== "idle";

  return (
    <section className={styles.page}>
      <header>
        <h1 className={styles.title}>{GREETINGS[data.daypart]}</h1>
        <p className={styles.muted}>
          {running
            ? "A session is running. Follow the bar below."
            : `Here is exactly what to do in the next ${data.plan.budgetMin} minutes.`}
        </p>
      </header>

      {!running && <ModeSwitch mode={selected} suggested={data.suggestedMode} onChange={setMode} />}

      <Plan
        overview={running && session.active ? { ...data, plan: session.active.session.plan } : data}
      />

      {!running && (
        <button
          type="button"
          className={styles.start}
          disabled={start.isPending}
          onClick={() => start.mutate(selected)}
        >
          Start session ({data.plan.budgetMin} min)
        </button>
      )}
      {start.isError && <p className={styles.error}>{start.error.message}</p>}

      {done.length > 0 && (
        <p className={styles.muted}>
          Done today: {done.length} session{done.length === 1 ? "" : "s"} (
          {done.reduce((sum, s) => sum + s.budgetMin + s.bonusMin, 0)} min).
        </p>
      )}

      {!running && data.teaser && (
        <aside className={styles.teaser}>
          <strong>Coming up in the story: {data.teaser.chapterTitle}</strong>
          <span>{data.teaser.teaser}</span>
        </aside>
      )}

      {/* Parked items stay out of sight during a session (spec §3.1). */}
      {!running && <ParkingList />}
    </section>
  );
}
