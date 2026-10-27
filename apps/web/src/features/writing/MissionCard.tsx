import { FORMAT_LABELS, type LevelView, type MissionView } from "@english-course/shared";
import { Link } from "react-router";
import { Badge, Eyebrow, Panel, ProgressLine, Stat } from "../../shared/ui/index.ts";
import styles from "./Writing.module.css";

export function LevelLine({ level }: { level: LevelView }) {
  return (
    <div className={styles.level}>
      <p className={styles.muted}>
        Level {level.level} · {FORMAT_LABELS[level.format]} · {level.completed} of {level.needed}{" "}
        missions toward the next format
        {level.average !== null ? ` (average ${level.average}, needs 75)` : ""}
      </p>
      <ProgressLine
        className={styles.levelLine}
        value={level.needed > 0 ? (level.completed / level.needed) * 100 : 0}
        label="Missions toward the next format"
        showValue={false}
      />
    </div>
  );
}

/** The active mission as a plum block: what to write, how long, and with which grammar. */
export function MissionCard({ mission }: { mission: MissionView }) {
  const { minWords, maxWords, maxChars } = mission.limits;
  return (
    <Panel tone="plum" padding="lg" className={styles.mission} aria-labelledby="mission-title">
      <div className={styles.missionMain}>
        <Eyebrow rule>Mission · {FORMAT_LABELS[mission.format]}</Eyebrow>
        <h2 id="mission-title" className={styles.missionTitle}>
          {mission.title}
        </h2>
        <p className={styles.lead}>{mission.promptEn}</p>
        {mission.whyEs ? (
          <p lang="es" className={styles.muted}>
            {mission.whyEs}
          </p>
        ) : null}
        {mission.inspiration.length > 0 ? (
          <div className={styles.inspiration}>
            <Eyebrow muted>Inspiration from this week's reading</Eyebrow>
            {mission.inspiration.map((item) => (
              <blockquote key={item.title} className={styles.quote}>
                {item.title}
                {item.opinion ? ` — "${item.opinion}"` : ""}
              </blockquote>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.missionSide}>
        <div className={styles.missionStats}>
          <Stat stacked label="Length" value={`${minWords}–${maxWords}`} unit=" words" />
          {maxChars ? <Stat stacked label="Max" value={maxChars} unit=" chars" /> : null}
        </div>
        {mission.targetUnit ? (
          <div className={styles.sideBlock}>
            <Eyebrow muted>Target grammar</Eyebrow>
            <Link to={`/units/${mission.targetUnit.id}`} className={styles.unitLink}>
              Unit {mission.targetUnit.id} · {mission.targetUnit.title}
            </Link>
          </div>
        ) : null}
        {mission.grammarTargets.length > 0 ? (
          <div className={styles.sideBlock}>
            <Eyebrow muted>Use</Eyebrow>
            <ul className={styles.chips} aria-label="Grammar to use">
              {mission.grammarTargets.map((target) => (
                <li key={target}>
                  <Badge className={styles.chip}>{target}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {mission.suggestedWords.length > 0 ? (
          <div className={styles.sideBlock}>
            <Eyebrow muted>Reuse</Eyebrow>
            <ul className={styles.chips} aria-label="Words to reuse">
              {mission.suggestedWords.map((word) => (
                <li key={word}>
                  <Badge className={styles.chip}>{word}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {mission.source === "fallback" ? (
          <p className={styles.muted}>Built-in mission (the AI was not available).</p>
        ) : null}
      </div>
    </Panel>
  );
}
