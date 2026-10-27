import { MODE_MINUTES, type TodayMode, type TodayOverview } from "@english-course/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button, Eyebrow, Panel, StatusDot } from "../../shared/ui/index.ts";
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

const pad = (n: number) => String(n).padStart(2, "0");

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
      <legend className="visually-hidden">Session length</legend>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          className={styles.mode}
          aria-pressed={m === mode}
          onClick={() => onChange(m)}
        >
          <strong className={styles.modeMinutes}>{MODE_MINUTES[m]} min</strong>
          <span className={styles.modeHint}>{m === suggested ? "Suggested" : MODE_HINTS[m]}</span>
        </button>
      ))}
    </fieldset>
  );
}

function Plan({ overview }: { overview: TodayOverview }) {
  return (
    <ol className={styles.plan} aria-label="Plan">
      {overview.plan.blocks.map((block, index) => (
        <li key={`${block.kind}-${block.title}`} className={styles.block}>
          <span className={`numeral ${styles.blockIndex}`} aria-hidden="true">
            {pad(index + 1)}
          </span>
          <div className={styles.blockText}>
            <Link to={block.deepLink} className={styles.blockTitle}>
              {block.title}
            </Link>
            <p className={styles.blockReason}>{block.reason}</p>
          </div>
          <span className={styles.minutes}>{block.minutes} min</span>
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
  const doneMinutes = done.reduce((sum, s) => sum + s.budgetMin + s.bonusMin, 0);
  const running = session.phase !== "idle";
  const shown = running && session.active ? { ...data, plan: session.active.session.plan } : data;

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <Panel as="header" tone="lime" padding="lg" className={styles.intro}>
          <Eyebrow rule>Today · {shown.plan.budgetMin} minutes</Eyebrow>
          <h1 className={styles.display}>{GREETINGS[data.daypart]}</h1>
          <p className={styles.lead}>
            {running
              ? "A session is running. Follow the bar below."
              : `Here is exactly what to do in the next ${data.plan.budgetMin} minutes.`}
          </p>

          {!running && (
            <ModeSwitch mode={selected} suggested={data.suggestedMode} onChange={setMode} />
          )}

          {!running && (
            <Button
              size="lg"
              arrow
              fullWidth="mobile"
              className={styles.start}
              disabled={start.isPending}
              onClick={() => start.mutate(selected)}
            >
              Start session ({data.plan.budgetMin} min)
            </Button>
          )}
          {start.isError && <p className={styles.error}>{start.error.message}</p>}

          <div className={styles.introFoot}>
            <span className={`numeral ${styles.bigNumeral}`} aria-hidden="true">
              {pad(done.length)}
            </span>
            {done.length > 0 ? (
              <p className={styles.doneLine}>
                Done today: {done.length} session{done.length === 1 ? "" : "s"} ({doneMinutes} min).
              </p>
            ) : (
              <p className={styles.doneLine}>Sessions done today</p>
            )}
          </div>
        </Panel>

        <Panel tone="plum" padding="lg" className={styles.featured}>
          <div className={styles.featuredHead}>
            <div>
              <Eyebrow>The plan</Eyebrow>
              <p className={styles.featuredSub}>
                {shown.plan.blocks.length} block{shown.plan.blocks.length === 1 ? "" : "s"} ·{" "}
                {shown.plan.budgetMin} min
              </p>
            </div>
            <Eyebrow as="span" className={styles.status}>
              <StatusDot pulse={running} /> {running ? "In motion" : "Ready"}
            </Eyebrow>
          </div>

          <Plan overview={shown} />

          {!running && data.teaser && (
            <aside className={styles.specimen} aria-label="Coming up in the story">
              <Eyebrow muted>Coming up · Unit {pad(data.teaser.unit)}</Eyebrow>
              <p className={styles.specimenTitle}>{data.teaser.chapterTitle}</p>
              <p className={styles.specimenText}>{data.teaser.teaser}</p>
            </aside>
          )}
        </Panel>
      </div>

      {/* Parked items stay out of sight during a session (spec §3.1). */}
      {!running && <ParkingList />}
    </section>
  );
}
