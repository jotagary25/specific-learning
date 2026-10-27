import {
  type ArticleView,
  type GlossResponse,
  paragraphsOf,
  sentenceAt,
} from "@english-course/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import { Button, CloseIcon, Eyebrow, Field, IconButton } from "../../shared/ui/index.ts";
import styles from "./Reading.module.css";
import { glossWord, readingKeys, saveWord } from "./reading.api.ts";
import { hostOf, keyedParagraphs, tokenize } from "./reading.model.ts";

/** Attribution required by CC BY-ND (and shown for every source): authors, outlet, link, license. */
export function Attribution({ article }: { article: ArticleView }) {
  const kicker = [
    article.topic ?? "Reading",
    article.estLevel,
    article.wordCount > 0 ? `${article.wordCount} words` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <header className={styles.attribution}>
      <Eyebrow rule>{kicker}</Eyebrow>
      <h2 className={styles.articleTitle}>{article.title}</h2>
      <div className={styles.byline}>
        {article.authors.length > 0 ? (
          <ul className={styles.authors} aria-label="Authors">
            {article.authors.map((author) => (
              <li key={author}>{author}</li>
            ))}
          </ul>
        ) : null}
        <p className={styles.source}>
          {article.outlet ?? hostOf(article.url)}
          {article.publishedAt ? ` · ${new Date(article.publishedAt).toLocaleDateString()}` : ""} ·{" "}
          <a href={article.url} target="_blank" rel="noreferrer">
            Read the original
          </a>
        </p>
        <p className={styles.license}>
          {article.license === "CC BY-ND 4.0" ? (
            <>
              Republished unmodified under{" "}
              <a
                href="https://creativecommons.org/licenses/by-nd/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY-ND 4.0
              </a>
              . Annotations are ours; the text is the author's.
            </>
          ) : (
            <>
              License: {article.license ?? "unknown"} — for personal study only. Source linked
              above.
            </>
          )}
        </p>
      </div>
    </header>
  );
}

type Lookup = { word: string; sentence: string };

function WordSheet({
  articleId,
  lookup,
  onClose,
}: {
  articleId: string;
  lookup: Lookup;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["gloss", articleId, lookup.word.toLowerCase(), lookup.sentence],
    queryFn: () => glossWord(articleId, lookup.word, lookup.sentence),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const gloss: GlossResponse | undefined = query.data;
  const save = useMutation({
    mutationFn: () => saveWord(articleId, lookup.word, lookup.sentence),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: readingKeys.all }),
  });
  const saved = gloss?.saved || save.isSuccess;

  return (
    <div className={styles.sheet} role="dialog" aria-label={`Meaning of ${lookup.word}`}>
      <div className={styles.sheetHeader}>
        <p className={styles.sheetWord}>{lookup.word}</p>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <CloseIcon size={18} />
        </IconButton>
      </div>
      {query.isPending ? <p className={styles.muted}>Looking it up…</p> : null}
      {query.isError ? <p className={styles.error}>{query.error.message}</p> : null}
      {gloss ? (
        <>
          <Eyebrow muted>
            {gloss.lemma} · {gloss.partOfSpeech}
          </Eyebrow>
          <p lang="es" className={styles.gloss}>
            {gloss.glossEs}
          </p>
          <p>{gloss.definitionEn}</p>
          <p className={styles.example}>{gloss.example}</p>
          <div className={styles.actions}>
            <Button
              variant={saved ? "secondary" : "primary"}
              fullWidth="mobile"
              disabled={saved || save.isPending}
              onClick={() => save.mutate()}
            >
              {saved ? "Saved" : "Save word"}
            </Button>
          </div>
          {save.isError ? <p className={styles.error}>{save.error.message}</p> : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * The verbatim article. Tapping a word opens its meaning (annotated glossary words are subtly
 * underlined); a lookup field is the keyboard alternative.
 */
export function ArticleBody({ article, aside }: { article: ArticleView; aside?: ReactNode }) {
  const paragraphs = useMemo(() => paragraphsOf(article.text), [article.text]);
  const glossary = article.annotations?.glossary ?? [];
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [typed, setTyped] = useState("");

  const open = (word: string, sentence: string) => setLookup({ word, sentence });

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const word = target.dataset.word;
    const paragraphIndex = Number(target.dataset.p);
    const offset = Number(target.dataset.o);
    const paragraph = paragraphs[paragraphIndex];
    if (!word || paragraph === undefined) return;
    open(word, sentenceAt(paragraph, offset));
  };

  const lookUpTyped = () => {
    const word = typed.trim();
    if (!word) return;
    const paragraph = paragraphs.find((p) => p.toLowerCase().includes(word.toLowerCase()));
    const sentence = paragraph
      ? sentenceAt(paragraph, paragraph.toLowerCase().indexOf(word.toLowerCase()))
      : word;
    open(word, sentence);
  };

  return (
    <div className={styles.spread}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: tap-a-word lookup; the field below is the keyboard path. */}
      <div className={styles.article} onClick={onClick}>
        {keyedParagraphs(paragraphs).map(({ key, index: p, text: paragraph }) => (
          <p key={key}>
            {tokenize(paragraph, glossary).map((token) =>
              token.isWord ? (
                <span
                  key={token.offset}
                  data-word={token.text}
                  data-p={p}
                  data-o={token.offset}
                  className={token.glossIndex === undefined ? styles.word : styles.glossWord}
                >
                  {token.text}
                </span>
              ) : (
                token.text
              ),
            )}
          </p>
        ))}
      </div>
      <aside className={styles.aside} aria-label="Reading tools">
        {aside}
        <form
          className={styles.lookup}
          onSubmit={(event) => {
            event.preventDefault();
            lookUpTyped();
          }}
        >
          <Field id="lookup" label="Look up a word">
            {(control) => (
              <input
                {...control}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="secondary">
            Look up
          </Button>
        </form>
      </aside>
      {lookup ? (
        <WordSheet
          key={`${lookup.word}|${lookup.sentence}`}
          articleId={article.id}
          lookup={lookup}
          onClose={() => setLookup(null)}
        />
      ) : null}
    </div>
  );
}

/** Plain paragraphs (grammar hunt), with the annotated spots highlighted once revealed. */
export function PlainArticle({ text, highlights = [] }: { text: string; highlights?: string[] }) {
  return (
    <div className={styles.article}>
      {keyedParagraphs(paragraphsOf(text)).map(({ key, text: paragraph }) => {
        const quote = highlights.find((q) => paragraph.includes(q));
        if (!quote) return <p key={key}>{paragraph}</p>;
        const at = paragraph.indexOf(quote);
        return (
          <p key={key}>
            {paragraph.slice(0, at)}
            <mark className={styles.spot}>{quote}</mark>
            {paragraph.slice(at + quote.length)}
          </p>
        );
      })}
    </div>
  );
}
