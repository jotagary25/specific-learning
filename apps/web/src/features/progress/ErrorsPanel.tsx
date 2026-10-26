import type { ErrorsResponse, ErrorTypeTrend } from "@english-course/shared";
import { Link } from "react-router";
import styles from "./Progress.module.css";
import { errorTypeLabel, monthName, plural } from "./progress.model.ts";

const monthShort = (month: string) => monthName(month).replace(/^(\w{3})\w*/, "$1");

function windowLine(t: ErrorTypeTrend): string {
  const before = `${plural(t.before.count, "time")} in your ${plural(t.before.submissions, "older text")}`;
  const recent = `${t.recent.count} in your last ${plural(t.recent.submissions, "text")}`;
  return t.before.submissions > 0 ? `${before} → ${recent}` : `${plural(t.total, "time")} so far`;
}

function TrendList({ items, empty }: { items: ErrorTypeTrend[]; empty: string }) {
  if (items.length === 0) return <p className={styles.muted}>{empty}</p>;
  return (
    <ul className={styles.list}>
      {items.map((t) => (
        <li key={t.type} className={styles.card}>
          <strong>{errorTypeLabel(t.type)}</strong>
          <p className={styles.muted}>{windowLine(t)}</p>
          {t.units.length > 0 ? (
            <p className={styles.links}>
              {t.units.map((u) => (
                <Link key={u.unit} to={`/units/${u.unit}`}>
                  Unit {u.unit}: {u.title}
                </Link>
              ))}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ErrorsPanel({ errors }: { errors: ErrorsResponse }) {
  if (errors.types.length === 0) {
    return <p className={styles.muted}>No writing errors recorded yet.</p>;
  }
  return (
    <div className={styles.columns}>
      <section aria-labelledby="beating-heading">
        <h3 id="beating-heading" className={styles.subheading}>
          Errors you are beating
        </h3>
        <TrendList
          items={errors.beating}
          empty="Not yet: an error counts as beaten when it shows up half as often in your recent texts."
        />
      </section>
      <section aria-labelledby="recurring-heading">
        <h3 id="recurring-heading" className={styles.subheading}>
          Still recurring
        </h3>
        <TrendList items={errors.recurring} empty="No error type keeps coming back right now." />
      </section>
      {errors.units.length > 0 ? <UnitTable errors={errors} /> : null}
    </div>
  );
}

function UnitTable({ errors }: { errors: ErrorsResponse }) {
  const months = errors.months.slice(-6);
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.caption}>Writing errors by unit, per month</caption>
        <thead>
          <tr>
            <th scope="col">Unit</th>
            {months.map((m) => (
              <th key={m} scope="col">
                {monthShort(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {errors.units.map((u) => (
            <tr key={u.unit}>
              <th scope="row">
                <Link to={`/units/${u.unit}`}>
                  Unit {u.unit}: {u.title}
                </Link>
              </th>
              {months.map((m) => (
                <td key={m}>{u.months.find((x) => x.month === m)?.count ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
