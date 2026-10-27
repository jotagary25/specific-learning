import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../../shared/ui/index.ts";
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
    <section className={styles.bar} data-tone="plum" aria-label="Study session">
      <div className={styles.barInner}>
        <div className={styles.barRow}>
          <span className={`numeral ${styles.clock}`} role="timer" aria-label="Time left">
            {formatClock(remaining)}
          </span>
          {current ? (
            <Link to={current.deepLink} className={styles.barBlock}>
              <span className={styles.barStep}>
                {active.blockIndex + 1}/{blocks.length} ·{" "}
              </span>
              {current.title}
            </Link>
          ) : (
            <span className={styles.barBlock}>
              All blocks done: free review until the timer ends
            </span>
          )}
        </div>
        <div className={styles.barActions}>
          {current && (
            <Button size="sm" onClick={nextBlock}>
              {last ? "Finish block" : "Next block"}
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={parking}
            onClick={() => setParking((open) => !open)}
          >
            Park it
          </Button>
          <Button size="sm" variant="ghost" disabled={stopping} onClick={() => void stop("user")}>
            End
          </Button>
        </div>
      </div>
      {parking && (
        <div className={styles.barPark} data-tone="cream">
          <ParkItForm label="Save" placeholder="Park a thought for later" />
        </div>
      )}
    </section>
  );
}
