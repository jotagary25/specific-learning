import { type ReactNode, useId } from "react";
import { Eyebrow } from "../../shared/ui/index.ts";
import styles from "./SettingsPage.module.css";

type Props = {
  /** Section title: also the region's accessible name. */
  title: ReactNode;
  /** Two-digit editorial number ("01"); omitted for sub-blocks such as the API keys. */
  number?: string;
  /** Short descriptor shown as an eyebrow beside the number. */
  eyebrow: string;
  children: ReactNode;
};

/** A numbered editorial block of the settings page: "01 / Who is studying" + Gloock title. */
export function SettingsSection({ title, number, eyebrow, children }: Props) {
  const titleId = useId();
  return (
    <section
      className={number ? styles.section : `${styles.section} ${styles.subSection}`}
      aria-labelledby={titleId}
    >
      <div className={styles.aside}>
        {number ? (
          <span className={`numeral ${styles.number}`} aria-hidden="true">
            {number}
          </span>
        ) : null}
        <Eyebrow muted>{number ? `/ ${eyebrow}` : eyebrow}</Eyebrow>
      </div>
      <div className={styles.body}>
        <h2 id={titleId} className={styles.heading}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}
