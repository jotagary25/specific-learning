import type { ProgressItem, TimelineResponse } from "@english-course/shared";
import { Link } from "react-router";
import styles from "./Progress.module.css";
import { DIMENSION_LABELS, minutesLabel, shortDate } from "./progress.model.ts";

function ItemBody({ item }: { item: ProgressItem }) {
  return (
    <>
      <span className={styles.itemTitle}>
        {item.link ? <Link to={item.link}>{item.title}</Link> : item.title}
      </span>
      {item.detail ? <span className={styles.muted}>{item.detail}</span> : null}
      {item.scores ? (
        <span className={styles.muted}>
          {(["grammar", "clarity", "vocabulary", "naturalness"] as const)
            .map((d) => `${DIMENSION_LABELS[d]} ${item.scores?.[d]}`)
            .join(" · ")}
        </span>
      ) : null}
      {item.canDo.length > 0 ? (
        <ul className={styles.canDoInline} aria-label="Now I can">
          {item.canDo.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Weeks newest first; items inside a week oldest first, as they happened. */
export function TimelineList({ timeline }: { timeline: TimelineResponse }) {
  if (timeline.weeks.length === 0) {
    return (
      <p className={styles.muted}>
        Nothing here yet. Finished units, articles, posts and sessions show up week by week.
      </p>
    );
  }
  return (
    <ol className={styles.weeks}>
      {[...timeline.weeks].reverse().map((week) => (
        <li key={week.weekStart} className={styles.week}>
          <h3 className={styles.subheading}>
            Week of {shortDate(week.weekStart)}
            {week.minutes > 0 ? (
              <span className={styles.muted}> · {minutesLabel(week.minutes)} studied</span>
            ) : null}
          </h3>
          <ol className={styles.items}>
            {week.items.map((item) => (
              <li key={`${item.kind}-${item.at}-${item.title}`} className={styles.item}>
                <time dateTime={item.at} className={styles.time}>
                  {shortDate(item.at)}
                </time>
                <ItemBody item={item} />
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}
