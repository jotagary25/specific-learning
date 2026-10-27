import { BONUS_STEP_MIN } from "@english-course/shared";
import { useNavigate } from "react-router";
import { Button, CheckIcon, Eyebrow, StatusDot } from "../../shared/ui/index.ts";
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
    <div
      className={styles.overlay}
      data-tone="plum"
      role="dialog"
      aria-modal="true"
      aria-labelledby="done-title"
    >
      <div className={styles.overlayCard}>
        <div className={styles.overlaySummary}>
          <Eyebrow rule muted>
            Time is up · {minutes} min
          </Eyebrow>
          <h2 id="done-title" className={styles.display}>
            Session complete
          </h2>
          <p className={styles.lead}>
            {minutes} minutes of focused work. That is the whole job for now.
          </p>
          <ul className={styles.doneList}>
            {blocks.map((block, i) => {
              const finished = i < active.blockIndex;
              return (
                <li
                  key={`${block.kind}-${block.title}`}
                  className={finished ? styles.doneItem : styles.laterItem}
                >
                  {finished ? (
                    <CheckIcon size={18} className={styles.doneIcon} />
                  ) : (
                    <StatusDot filled={false} className={styles.doneIcon} />
                  )}
                  <span>
                    {finished ? "Done: " : "Next time: "}
                    {block.title}
                  </span>
                </li>
              );
            })}
          </ul>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <Button
              size="lg"
              arrow
              disabled={stopping}
              onClick={async () => {
                await stop("timer");
                navigate("/");
              }}
            >
              Stop here
            </Button>
            {canTakeBonus(active) && (
              <Button variant="ghost" onClick={takeBonus}>
                {BONUS_STEP_MIN} more minutes
              </Button>
            )}
          </div>
        </div>
        {active.teaser && (
          <blockquote className={styles.specimen}>
            <Eyebrow muted>Next in the story · {active.teaser.chapterTitle}</Eyebrow>
            <p className={styles.specimenText}>{active.teaser.teaser}</p>
          </blockquote>
        )}
      </div>
    </div>
  );
}
