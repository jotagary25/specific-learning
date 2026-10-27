import type { QueueCard, SrsRating } from "@english-course/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowRightIcon, Button, Eyebrow, Panel, Stat } from "../../shared/ui/index.ts";
import { ReviewCard } from "./ReviewCard.tsx";
import styles from "./Vocabulary.module.css";
import { completeSession, fetchQueue, reviewCard, vocabularyKeys } from "./vocabulary.api.ts";
import { addRating, emptyTally, type Tally } from "./vocabulary.model.ts";

function EndScreen({ tally, started }: { tally: Tally; started: number }) {
  const queryClient = useQueryClient();
  const sent = useRef(false);
  const record = useMutation({
    mutationFn: completeSession,
    onSettled: () => queryClient.invalidateQueries({ queryKey: vocabularyKeys.stats }),
  });
  const { mutate } = record;

  useEffect(() => {
    if (sent.current || tally.reviewed === 0) return;
    sent.current = true;
    mutate({ ...tally, seconds: Math.round((Date.now() - started) / 1000) });
  }, [tally, started, mutate]);

  return (
    <Panel tone="lime" padding="lg" className={styles.end} role="status">
      <Eyebrow rule>Session complete</Eyebrow>
      <h2 className={styles.endTitle}>That's it for now</h2>
      {tally.reviewed > 0 ? (
        <>
          <Stat
            stacked
            size="lg"
            label="Reviewed"
            value={tally.reviewed}
            unit={tally.reviewed === 1 ? " card" : " cards"}
          />
          <ul className={styles.counts} aria-label="Ratings">
            <li>Again: {tally.again}</li>
            <li>Hard: {tally.hard}</li>
            <li>Good: {tally.good}</li>
            <li>Easy: {tally.easy}</li>
          </ul>
        </>
      ) : (
        <p className={styles.lead}>Nothing is due right now. Come back later.</p>
      )}
      <div className={styles.actions}>
        <Button to="/" variant="secondary">
          Back to Home
        </Button>
        <Button to="/vocabulary/cards" variant="ghost">
          Browse cards
        </Button>
      </div>
    </Panel>
  );
}

function Session({ cards }: { cards: QueueCard[] }) {
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState<Tally>(emptyTally);
  const [started] = useState(() => Date.now());
  const review = useMutation({
    mutationFn: (v: { id: string; rating: SrsRating; answer?: string }) =>
      reviewCard(v.id, v.rating, v.answer),
    onSuccess: (_data, v) => {
      setTally((t) => addRating(t, v.rating));
      setIndex((i) => i + 1);
    },
  });
  const { mutate } = review;
  const card = cards[index];
  const onRate = useCallback(
    (rating: SrsRating, answer?: string) => {
      if (card) mutate({ id: card.id, rating, ...(answer === undefined ? {} : { answer }) });
    },
    [card, mutate],
  );

  if (!card) return <EndScreen tally={tally} started={started} />;
  return (
    <>
      <ReviewCard
        key={card.id}
        card={card}
        position={index + 1}
        total={cards.length}
        pending={review.isPending}
        onRate={onRate}
      />
      {review.isError ? (
        <p className={styles.error} role="alert">
          Could not save the review: {review.error.message}. Try again.
        </p>
      ) : null}
    </>
  );
}

/** Page title block of the vocabulary pages: eyebrow, Gloock title, side link, hairline. */
export function VocabularyHeader({
  id,
  eyebrow,
  title,
  link,
}: {
  id: string;
  eyebrow: string;
  title: string;
  link: { to: string; label: string };
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerText}>
        <Eyebrow rule>{eyebrow}</Eyebrow>
        <h1 id={id} className={styles.title}>
          {title}
        </h1>
      </div>
      <Link to={link.to} className={styles.sideLink}>
        {link.label}
        <ArrowRightIcon size={18} />
      </Link>
    </header>
  );
}

/** `/vocabulary`: one short review session (≤10 cards), then stop. No endless mode. */
export function VocabularyPage() {
  // The batch is fixed when the session starts; reviews must not reshuffle it.
  const queue = useQuery({
    queryKey: vocabularyKeys.queue,
    queryFn: () => fetchQueue(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  return (
    <section className={styles.page} aria-labelledby="vocabulary-title">
      <VocabularyHeader
        id="vocabulary-title"
        eyebrow="Spaced repetition · up to 10 cards"
        title="Vocabulary review"
        link={{ to: "/vocabulary/cards", label: "Cards" }}
      />
      {queue.isPending ? <p className={styles.muted}>Loading…</p> : null}
      {queue.isError ? <p className={styles.error}>{queue.error.message}</p> : null}
      {queue.data ? <Session cards={queue.data.cards} /> : null}
    </section>
  );
}
