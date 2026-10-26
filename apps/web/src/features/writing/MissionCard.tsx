import { FORMAT_LABELS, type LevelView, type MissionView } from "@english-course/shared";
import { Link } from "react-router";
import styles from "./Writing.module.css";

function limitText(mission: MissionView): string {
  const words = `${mission.limits.minWords}–${mission.limits.maxWords} words`;
  return mission.limits.maxChars ? `${words}, max ${mission.limits.maxChars} characters` : words;
}

export function LevelLine({ level }: { level: LevelView }) {
  return (
    <p className={styles.muted}>
      Level {level.level} · {FORMAT_LABELS[level.format]} · {level.completed} of {level.needed}{" "}
      missions toward the next format
      {level.average !== null ? ` (average ${level.average}, needs 75)` : ""}
    </p>
  );
}

export function MissionCard({ mission }: { mission: MissionView }) {
  return (
    <section className={styles.card} aria-labelledby="mission-title">
      <div className={styles.row}>
        <h2 id="mission-title" className={styles.subheading}>
          {mission.title}
        </h2>
        <span className={styles.chip}>{FORMAT_LABELS[mission.format]}</span>
      </div>
      <p>{mission.promptEn}</p>
      {mission.whyEs ? <p className={styles.muted}>{mission.whyEs}</p> : null}
      <p>
        <strong>Length:</strong> {limitText(mission)}
      </p>
      {mission.targetUnit ? (
        <p>
          <strong>Target grammar:</strong>{" "}
          <Link to={`/units/${mission.targetUnit.id}`} className={styles.linkButton}>
            Unit {mission.targetUnit.id} · {mission.targetUnit.title}
          </Link>
        </p>
      ) : null}
      {mission.grammarTargets.length > 0 ? (
        <ul className={styles.chips} aria-label="Grammar to use">
          {mission.grammarTargets.map((target) => (
            <li key={target} className={styles.chip}>
              {target}
            </li>
          ))}
        </ul>
      ) : null}
      {mission.suggestedWords.length > 0 ? (
        <ul className={styles.chips} aria-label="Words to reuse">
          {mission.suggestedWords.map((word) => (
            <li key={word} className={styles.chip}>
              {word}
            </li>
          ))}
        </ul>
      ) : null}
      {mission.inspiration.length > 0 ? (
        <div>
          <p>
            <strong>Inspiration from this week's reading</strong>
          </p>
          {mission.inspiration.map((item) => (
            <blockquote key={item.title} className={styles.quote}>
              {item.title}
              {item.opinion ? ` — "${item.opinion}"` : ""}
            </blockquote>
          ))}
        </div>
      ) : null}
      {mission.source === "fallback" ? (
        <p className={styles.muted}>Built-in mission (the AI was not available).</p>
      ) : null}
    </section>
  );
}
