import type {
  MirrorArticle,
  MirrorPost,
  MirrorResponse,
  MirrorWriting,
} from "@english-course/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import styles from "./Progress.module.css";
import { fetchMirror, markMirrorSeen, progressKeys, saveReflection } from "./progress.api.ts";
import {
  DIMENSION_LABELS,
  highlightSegments,
  isMonthKey,
  monthName,
  monthOf,
  plural,
  shiftMonth,
  shortDate,
  signed,
  WORD_STATUS_LABELS,
} from "./progress.model.ts";

const DIMENSIONS = ["grammar", "clarity", "vocabulary", "naturalness"] as const;

function ArticleThenNow({ article, label }: { article: MirrorArticle | null; label: string }) {
  if (!article) {
    return (
      <p className={styles.muted}>
        No article read yet. The mirror re-shows your first article once you have read one.
      </p>
    );
  }
  const month = monthName(article.readOn.slice(0, 7)).split(" ")[0];
  return (
    <div className={styles.stack}>
      <p>
        On {shortDate(article.readOn)} you read “{article.title}”.
      </p>
      {article.unknownThen > 0 ? (
        <p className={styles.figure}>
          In {month} you didn't know{" "}
          <strong className={styles.number}>{article.unknownThen}</strong> of these words — today{" "}
          <strong className={styles.number}>{article.unknownNow}</strong>.
        </p>
      ) : (
        <p className={styles.muted}>You didn't look up or save any word in that article.</p>
      )}
      {article.words.length > 0 ? (
        <ul className={styles.words} aria-label={`Words you looked up in ${label}`}>
          {article.words.map((w) => (
            <li key={w.word} className={w.status === "mature" ? styles.wordKnown : styles.word}>
              <span>{w.word}</span>{" "}
              <span className={styles.wordStatus}>{WORD_STATUS_LABELS[w.status]}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {article.text ? (
        <details className={styles.card}>
          <summary>Re-read the article</summary>
          <p className={styles.articleText}>
            {highlightSegments(article.text, article.words).map((s, i) =>
              s.status ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are static per render
                <mark key={i} className={s.status === "mature" ? styles.markKnown : styles.mark}>
                  {s.text}
                </mark>
              ) : (
                s.text
              ),
            )}
          </p>
        </details>
      ) : null}
    </div>
  );
}

function PostColumn({ title, post }: { title: string; post: MirrorPost }) {
  return (
    <article className={styles.card} aria-label={title}>
      <h3 className={styles.subheading}>{title}</h3>
      <p className={styles.muted}>
        {post.title} · {shortDate(post.writtenOn)} · overall {post.overall}
      </p>
      <dl className={styles.scores}>
        {DIMENSIONS.map((d) => (
          <div key={d}>
            <dt>{DIMENSION_LABELS[d]}</dt>
            <dd>{post.scores[d]}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.muted}>
        {post.errorCount === 0
          ? "No errors marked"
          : `${plural(post.errorCount, "error")}: ${post.errorTypes.join(", ")}`}
      </p>
      <blockquote className={styles.post}>{post.text}</blockquote>
    </article>
  );
}

function WritingSideBySide({ writing }: { writing: MirrorWriting | null }) {
  if (!writing) return <p className={styles.muted}>No reviewed posts yet.</p>;
  return (
    <div className={styles.stack}>
      {writing.deltas.length > 0 ? (
        <ul className={styles.deltas} aria-label="Change from your first post to your latest">
          {writing.deltas.map((d) => (
            <li key={d.dimension}>
              {DIMENSION_LABELS[d.dimension]} <strong>{signed(d.change)}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.sideBySide}>
        <PostColumn title="Your first post" post={writing.first} />
        {writing.latest ? (
          <PostColumn title="Your latest post" post={writing.latest} />
        ) : (
          <p className={styles.muted}>
            Only one reviewed post so far. The comparison appears after the next one.
          </p>
        )}
      </div>
    </div>
  );
}

function Reflection({ mirror }: { mirror: MirrorResponse }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(mirror.reflection?.text ?? "");
  const save = useMutation({
    mutationFn: (value: string) => saveReflection(mirror.month, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: progressKeys.mirror(mirror.month) });
      void queryClient.invalidateQueries({ queryKey: progressKeys.mirrorDue });
      void queryClient.invalidateQueries({ queryKey: progressKeys.timeline });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) save.mutate(text.trim());
  };
  return (
    <form className={styles.stack} onSubmit={submit}>
      <label htmlFor="reflection" className={styles.prompt}>
        {mirror.reflectionPrompt}
      </label>
      <textarea
        id="reflection"
        className={styles.textarea}
        rows={5}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={styles.inline}>
        <button type="submit" className={styles.button} disabled={!text.trim() || save.isPending}>
          Save reflection
        </button>
        <span role="status" className={styles.muted}>
          {save.isSuccess ? "Saved." : ""}
        </span>
      </div>
      {save.isError ? (
        <p role="alert" className={styles.error}>
          Could not save: {save.error.message}
        </p>
      ) : null}
    </form>
  );
}

export function MirrorPage() {
  const params = useParams();
  const month = isMonthKey(params.month) ? params.month : monthOf(new Date());
  const isFuture = month > monthOf(new Date());
  const queryClient = useQueryClient();
  const mirror = useQuery({
    queryKey: progressKeys.mirror(month),
    queryFn: () => fetchMirror(month),
    enabled: !isFuture,
  });
  const loaded = mirror.data !== undefined;
  const seen = mirror.data?.seen ?? false;

  useEffect(() => {
    if (!loaded || seen) return;
    markMirrorSeen(month)
      .then(() => queryClient.invalidateQueries({ queryKey: progressKeys.mirrorDue }))
      .catch(() => {
        // Not being marked as seen only means the mirror stays suggested.
      });
  }, [loaded, seen, month, queryClient]);

  const label = monthName(month);
  return (
    <div className={styles.page}>
      <header className={styles.stack}>
        <Link to="/progress">← Progress</Link>
        <h1 className={styles.title}>Monthly mirror: {label}</h1>
        <nav aria-label="Other months" className={styles.inline}>
          <Link to={`/progress/mirror/${shiftMonth(month, -1)}`}>
            {monthName(shiftMonth(month, -1))}
          </Link>
          {shiftMonth(month, 1) <= monthOf(new Date()) ? (
            <Link to={`/progress/mirror/${shiftMonth(month, 1)}`}>
              {monthName(shiftMonth(month, 1))}
            </Link>
          ) : null}
        </nav>
      </header>
      {isFuture ? <p className={styles.muted}>The mirror only looks back, not ahead.</p> : null}
      {mirror.isPending && !isFuture ? <p className={styles.muted}>Loading the mirror…</p> : null}
      {mirror.isError ? (
        <p role="alert" className={styles.error}>
          Could not load the mirror: {mirror.error.message}
        </p>
      ) : null}
      {mirror.data ? (
        <>
          <section aria-labelledby="words-heading" className={styles.section}>
            <h2 id="words-heading" className={styles.heading}>
              Words then and now
            </h2>
            <ArticleThenNow article={mirror.data.article} label={label} />
          </section>
          <section aria-labelledby="writing-heading" className={styles.section}>
            <h2 id="writing-heading" className={styles.heading}>
              Your first post and your latest
            </h2>
            <WritingSideBySide writing={mirror.data.writing} />
          </section>
          <section aria-labelledby="units-heading" className={styles.section}>
            <h2 id="units-heading" className={styles.heading}>
              Units completed in {label}
            </h2>
            {mirror.data.units.length === 0 ? (
              <p className={styles.muted}>No units completed this month yet.</p>
            ) : (
              <ul className={styles.list}>
                {mirror.data.units.map((u) => (
                  <li key={u.unit} className={styles.card}>
                    <Link to={`/units/${u.unit}`}>
                      Unit {u.unit}: {u.title}
                    </Link>
                    <span className={styles.muted}> · {shortDate(u.completedOn)}</span>
                    {u.canDo.length > 0 ? (
                      <ul className={styles.canDoInline} aria-label="Now I can">
                        {u.canDo.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="reflection-heading" className={styles.section}>
            <h2 id="reflection-heading" className={styles.heading}>
              Reflection
            </h2>
            <Reflection key={mirror.data.month} mirror={mirror.data} />
          </section>
        </>
      ) : null}
    </div>
  );
}
