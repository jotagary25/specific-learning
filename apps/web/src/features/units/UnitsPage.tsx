import type { UnitListEntry } from "@english-course/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import styles from "./Units.module.css";
import { fetchUnits, unitsKeys } from "./units.api.ts";

const STATUS_LABELS: Record<UnitListEntry["status"], string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  completed: "Completed",
};

function UnitCard({ unit }: { unit: UnitListEntry }) {
  const percent = Math.round((unit.score ?? 0) * 100);
  return (
    <li>
      <Link to={`/units/${unit.number}`} className={styles.unitCard}>
        <span className={styles.unitNumber}>Unit {unit.number}</span>
        <span className={styles.unitTitle}>{unit.title}</span>
        {unit.subtitle ? <span className={styles.muted}>{unit.subtitle}</span> : null}
        <span className={styles.badges}>
          <span className={styles.badge} data-status={unit.status}>
            {STATUS_LABELS[unit.status]}
          </span>
          {unit.priority ? (
            <span className={styles.badge} data-status="priority">
              Review
            </span>
          ) : null}
        </span>
        <span className={styles.meter}>
          <progress
            className={styles.progress}
            max={100}
            value={percent}
            aria-label={`Unit ${unit.number} score`}
          />
          <span className={styles.muted}>{unit.score === null ? "—" : `${percent}%`}</span>
        </span>
      </Link>
    </li>
  );
}

export function UnitsPage() {
  const units = useQuery({ queryKey: unitsKeys.list, queryFn: fetchUnits });

  return (
    <section className={styles.page} aria-labelledby="units-title">
      <h1 id="units-title" className={styles.title}>
        Units
      </h1>
      {units.isPending ? <p className={styles.muted}>Loading units…</p> : null}
      {units.isError ? <p className={styles.error}>{units.error.message}</p> : null}
      {units.data?.blocks.map((block) => (
        <section key={block.id} className={styles.block} aria-labelledby={`block-${block.id}`}>
          <h2 id={`block-${block.id}`} className={styles.heading}>
            {block.title}
          </h2>
          <ul className={styles.unitList}>
            {block.units.map((unit) => (
              <UnitCard key={unit.number} unit={unit} />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
