import { useState } from "react";
import { Link } from "react-router";
import { ParkItForm } from "./ParkIt.tsx";
import { useStudySession } from "./SessionContext.tsx";
import { formatClock } from "./session.model.ts";
import styles from "./Today.module.css";

/** Persistent bar while a session runs: countdown, current block, next block, park it. */
export function SessionBar() {
  const { active, phase, remaining, nextBlock, stop, stopping } = useStudySession();
  const [parking, setParking] = useState(false);
  if (!active || phase !== "running") return null;

  const blocks = active.session.plan.blocks;
  const current = blocks[active.blockIndex];
  const last = active.blockIndex >= blocks.length - 1;

  return (
    <section className={styles.bar} aria-label="Study session">
      <div className={styles.barRow}>
        <span className={styles.clock} role="timer" aria-label="Time left">
          {formatClock(remaining)}
        </span>
        {current ? (
          <Link to={current.deepLink} className={styles.barBlock}>
            {active.blockIndex + 1}/{blocks.length} · {current.title}
          </Link>
        ) : (
          <span className={styles.barBlock}>All blocks done: free review until the timer ends</span>
        )}
      </div>
      <div className={styles.barRow}>
        {current && (
          <button type="button" className={styles.primary} onClick={nextBlock}>
            {last ? "Finish block" : "Next block"}
          </button>
        )}
        <button
          type="button"
          className={styles.secondary}
          aria-expanded={parking}
          onClick={() => setParking((open) => !open)}
        >
          Park it
        </button>
        <button
          type="button"
          className={styles.ghost}
          disabled={stopping}
          onClick={() => void stop("user")}
        >
          End
        </button>
      </div>
      {parking && <ParkItForm label="Save" placeholder="Park a thought for later" />}
    </section>
  );
}
