import type { GrammarSpan, StoryChapterView } from "@english-course/shared";
import { useState } from "react";
import styles from "./Units.module.css";
import { highlightBody } from "./units.model.ts";

export function StoryStep({
  chapter,
  storyTitle,
}: {
  chapter: StoryChapterView;
  storyTitle?: string | null;
}) {
  const [note, setNote] = useState<GrammarSpan | null>(null);
  const paragraphs = highlightBody(chapter.body, chapter.grammarSpans);

  return (
    <article className={styles.card} aria-labelledby="story-title">
      <p className={styles.eyebrow}>
        {storyTitle ? `${storyTitle} · ` : ""}Chapter {chapter.position}
      </p>
      <h2 id="story-title" className={styles.heading}>
        {chapter.title}
      </h2>
      <p className={styles.muted}>Tap a highlighted phrase to see why it uses this grammar.</p>
      <div className={styles.story}>
        {paragraphs.map((pieces, p) => (
          // Paragraph order is fixed for a chapter.
          // biome-ignore lint/suspicious/noArrayIndexKey: static text
          <p key={p}>
            {pieces.map((piece, i) =>
              piece.span ? (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: static text
                  key={i}
                  type="button"
                  className={styles.mark}
                  aria-pressed={note === piece.span}
                  onClick={() => setNote(note === piece.span ? null : (piece.span ?? null))}
                >
                  {piece.text}
                </button>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: static text
                <span key={i}>{piece.text}</span>
              ),
            )}
          </p>
        ))}
      </div>
      <p className={styles.note} aria-live="polite">
        {note ? (
          <>
            <strong>{note.text}:</strong> {note.note}
          </>
        ) : null}
      </p>
      <p className={styles.teaser}>{chapter.teaser}</p>
    </article>
  );
}
