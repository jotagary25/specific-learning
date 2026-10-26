import { BONUS_STEP_MIN } from "@english-course/shared";
import { useNavigate } from "react-router";
import { useStudySession } from "./SessionContext.tsx";
import { canTakeBonus } from "./session.model.ts";
import styles from "./Today.module.css";

/** Full-screen stop at zero: what you did, the story cliffhanger, and "Stop here". */
export function SessionComplete() {
  const { active, phase, takeBonus, stop, stopping, error } = useStudySession();
  const navigate = useNavigate();
  if (!active || phase !== "complete") return null;

  const blocks = active.session.plan.blocks;
  const minutes = active.session.budgetMin + active.bonusMin;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="done-title">
      <div className={styles.overlayCard}>
        <h2 id="done-title" className={styles.title}>
          Session complete
        </h2>
        <p className={styles.muted}>
          {minutes} minutes of focused work. That is the whole job for now.
        </p>
        <ul className={styles.doneList}>
          {blocks.map((block, i) => (
            <li
              key={`${block.kind}-${block.title}`}
              className={i < active.blockIndex ? styles.ok : ""}
            >
              {i < active.blockIndex ? "Done: " : "Next time: "}
              {block.title}
            </li>
          ))}
        </ul>
        {active.teaser && (
          <blockquote className={styles.teaser}>
            <strong>Next in the story ({active.teaser.chapterTitle})</strong>
            <span>{active.teaser.teaser}</span>
          </blockquote>
        )}
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            disabled={stopping}
            onClick={async () => {
              await stop("timer");
              navigate("/");
            }}
          >
            Stop here
          </button>
          {canTakeBonus(active) && (
            <button type="button" className={styles.ghost} onClick={takeBonus}>
              {BONUS_STEP_MIN} more minutes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
