import type { UnitListEntry } from "@english-course/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Badge, Eyebrow, ProgressLine, StatusDot } from "../../shared/ui/index.ts";
import styles from "./Units.module.css";
import { fetchUnits, unitsKeys } from "./units.api.ts";

const STATUS_LABELS: Record<UnitListEntry["status"], string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  completed: "Completed",
};

const pad = (n: number) => String(n).padStart(2, "0");

function UnitCard({ unit }: { unit: UnitListEntry }) {
  const percent = Math.round((unit.score ?? 0) * 100);
  return (
    <li className={styles.unitCell}>
      <Link to={`/units/${unit.number}`} className={styles.unitCard} data-status={unit.status}>
        <span className={styles.unitTop}>
          <span className={`numeral ${styles.unitNumeral}`} aria-hidden="true">
            {pad(unit.number)}
          </span>
          <span className={styles.badges}>
            <span className={styles.status}>
              <StatusDot
                filled={unit.status !== "not-started"}
                tone={unit.status === "completed" ? "correct" : "current"}
              />
              <span>{STATUS_LABELS[unit.status]}</span>
            </span>
            {unit.priority ? <Badge tone="almost">Review</Badge> : null}
          </span>
        </span>
        <span className={`eyebrow ${styles.unitNumber}`}>Unit {unit.number}</span>
        <span className={styles.unitTitle}>{unit.title}</span>
        {unit.subtitle ? <span className={styles.unitSubtitle}>{unit.subtitle}</span> : null}
        <span className={styles.meter}>
          <ProgressLine value={percent} label={`Unit ${unit.number} score`} showValue={false} />
          <span className={styles.score}>{unit.score === null ? "—" : `${percent}%`}</span>
        </span>
      </Link>
    </li>
  );
}

export function UnitsPage() {
  const units = useQuery({ queryKey: unitsKeys.list, queryFn: fetchUnits });

  return (
    <section className={styles.page} aria-labelledby="units-title">
      <header className={styles.listHeader}>
        <Eyebrow rule>Course map</Eyebrow>
        <h1 id="units-title" className={styles.title}>
          Units
        </h1>
        <p className={styles.lead}>
          One grammar idea per unit: a story chapter, a puzzle, the rule, then practice.
        </p>
      </header>
      {units.isPending ? <p className={styles.muted}>Loading units…</p> : null}
      {units.isError ? <p className={styles.error}>{units.error.message}</p> : null}
      {units.data?.blocks.map((block, index) => (
        <section key={block.id} className={styles.block} aria-labelledby={`block-${block.id}`}>
          <div className={styles.blockHead}>
            <span className={`numeral ${styles.blockNumeral}`} aria-hidden="true">
              {pad(index + 1)}
            </span>
            <div className={styles.blockHeading}>
              <Eyebrow muted>
                Block {pad(index + 1)} · {block.units.length} unit
                {block.units.length === 1 ? "" : "s"}
              </Eyebrow>
              <h2 id={`block-${block.id}`} className={styles.blockTitle}>
                {block.title}
              </h2>
            </div>
          </div>
          <ul className={styles.unitGrid}>
            {block.units.map((unit) => (
              <UnitCard key={unit.number} unit={unit} />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
