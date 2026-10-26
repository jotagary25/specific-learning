import type { TheorySection, UnitExtras } from "@english-course/shared";
import { useState } from "react";
import theory from "./Theory.module.css";
import styles from "./Units.module.css";

type Props = { sections: TheorySection[]; extras: UnitExtras | null };

export function TheoryStep({ sections, extras }: Props) {
  const [showAnalogy, setShowAnalogy] = useState(false);

  return (
    <article className={styles.card} aria-labelledby="theory-title">
      <h2 id="theory-title" className={styles.heading}>
        Theory
      </h2>
      {sections.map((section) => (
        <section key={section.letter} className={theory.section}>
          <span className={theory.letter} aria-hidden="true">
            {section.letter}
          </span>
          {/* Book HTML, sanitized by the importer and seeded from the repo (never user input). */}
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted, pre-sanitized content */}
          <div className={theory.html} dangerouslySetInnerHTML={{ __html: section.html }} />
        </section>
      ))}

      {extras ? (
        <>
          <section className={styles.extraCard} lang="es">
            <div className={styles.row}>
              <h3 className={styles.subheading}>Programmer analogy</h3>
              <button
                type="button"
                className={styles.secondary}
                aria-expanded={showAnalogy}
                onClick={() => setShowAnalogy((value) => !value)}
              >
                {showAnalogy ? "Hide" : "Show"}
              </button>
            </div>
            {showAnalogy ? <p>{extras.analogyEs}</p> : null}
          </section>

          <section className={styles.extraCard}>
            <h3 className={styles.subheading}>Spanish-speaker pitfalls</h3>
            <ul className={styles.pitfalls}>
              {extras.pitfalls.map((pitfall) => (
                <li key={pitfall.wrong}>
                  <p>
                    <s className={styles.wrong}>{pitfall.wrong}</s>
                    {" → "}
                    <strong className={styles.right}>{pitfall.right}</strong>
                  </p>
                  <p className={styles.muted} lang="es">
                    {pitfall.explanationEs}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </article>
  );
}
