import type { TheorySection, UnitExtras } from "@english-course/shared";
import { useState } from "react";
import { Button, Eyebrow, Panel } from "../../shared/ui/index.ts";
import theory from "./Theory.module.css";
import styles from "./Units.module.css";

type Props = { sections: TheorySection[]; extras: UnitExtras | null };

export function TheoryStep({ sections, extras }: Props) {
  const [showAnalogy, setShowAnalogy] = useState(false);

  return (
    <article className={styles.card} aria-labelledby="theory-title">
      <header className={styles.stepHeader}>
        <Eyebrow muted>The rule</Eyebrow>
        <h2 id="theory-title" className={styles.heading}>
          Theory
        </h2>
      </header>
      <div className={theory.sections}>
        {sections.map((section) => (
          <section key={section.letter} className={theory.section}>
            <span className={`numeral ${theory.letter}`} aria-hidden="true">
              {section.letter}
            </span>
            {/* Book HTML, sanitized by the importer and seeded from the repo (never user input). */}
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted, pre-sanitized content */}
            <div className={theory.html} dangerouslySetInnerHTML={{ __html: section.html }} />
          </section>
        ))}
      </div>

      {extras ? (
        <div className={styles.extras}>
          <Panel tone="cream" bordered className={styles.extraCard} lang="es">
            <div className={styles.row}>
              <div>
                <Eyebrow muted>If you code</Eyebrow>
                <h3 className={styles.subheading}>Programmer analogy</h3>
              </div>
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={showAnalogy}
                onClick={() => setShowAnalogy((value) => !value)}
              >
                {showAnalogy ? "Hide" : "Show"}
              </Button>
            </div>
            {showAnalogy ? <p>{extras.analogyEs}</p> : null}
          </Panel>

          <Panel tone="cream" bordered className={styles.extraCard}>
            <Eyebrow muted>Watch out</Eyebrow>
            <h3 className={styles.subheading}>Spanish-speaker pitfalls</h3>
            <ul className={styles.pitfalls}>
              {extras.pitfalls.map((pitfall) => (
                <li key={pitfall.wrong}>
                  <p className={styles.pitfallPair}>
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
          </Panel>
        </div>
      ) : null}
    </article>
  );
}
