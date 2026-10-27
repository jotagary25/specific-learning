import type { PublishedVersion, RewriteView } from "@english-course/shared";
import { useState } from "react";
import { Badge, Button, Eyebrow } from "../../shared/ui/index.ts";
import styles from "./Writing.module.css";
import { versionLabel } from "./writing.model.ts";

type Props = {
  ownText: string;
  rewrites: RewriteView[];
  publishedVersion: PublishedVersion | null;
  canMarkPublished: boolean;
  onMarkPublished: (version: PublishedVersion) => void;
};

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The learner's fixed text side by side with natural American English versions by register. */
export function Rewrites({
  ownText,
  rewrites,
  publishedVersion,
  canMarkPublished,
  onMarkPublished,
}: Props) {
  const [copied, setCopied] = useState<PublishedVersion | "failed" | null>(null);
  const versions: Array<{ id: PublishedVersion; text: string; noteEs: string | null }> = [
    { id: "own", text: ownText, noteEs: null },
    ...rewrites.map((r) => ({ id: r.register, text: r.text, noteEs: r.noteEs })),
  ];

  return (
    <section aria-labelledby="rewrites-title" className={styles.rewrites}>
      <div className={styles.sectionHead}>
        <Eyebrow rule muted>
          Registers
        </Eyebrow>
        <h2 id="rewrites-title" className={styles.sectionTitle}>
          Natural versions
        </h2>
        <p className={styles.muted}>
          Compare your fixed text with how a native writer might say it. Copy the one you want to
          post.
        </p>
      </div>
      <div className={styles.versions}>
        {versions.map((version, index) => {
          const label = versionLabel(version.id);
          return (
            <article
              key={version.id}
              className={styles.version}
              data-own={version.id === "own" || undefined}
              aria-label={label}
            >
              <div className={styles.versionHead}>
                <Eyebrow as="span">
                  <span className="numeral">{String(index + 1).padStart(2, "0")}</span> {label}
                </Eyebrow>
                {publishedVersion === version.id ? <Badge tone="correct">Published</Badge> : null}
              </div>
              <p className={styles.versionText}>{version.text}</p>
              {version.noteEs ? (
                <p lang="es" className={styles.versionNote}>
                  {version.noteEs}
                </p>
              ) : null}
              <div className={styles.versionActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Copy ${label}`}
                  onClick={async () =>
                    setCopied((await copy(version.text)) ? version.id : "failed")
                  }
                >
                  {copied === version.id ? "Copied" : "Copy"}
                </Button>
                {canMarkPublished && publishedVersion !== version.id ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`I published ${label}`}
                    onClick={() => onMarkPublished(version.id)}
                  >
                    I published this
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {copied === "failed" ? (
        <p className={styles.error}>Copy failed. Select the text and copy it by hand.</p>
      ) : null}
    </section>
  );
}
