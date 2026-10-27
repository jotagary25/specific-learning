import type { CardSource, CardView } from "@english-course/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Field } from "../../shared/ui/index.ts";
import styles from "./Vocabulary.module.css";
import { VocabularyHeader } from "./VocabularyPage.tsx";
import { deleteCard, fetchCards, updateCard, vocabularyKeys } from "./vocabulary.api.ts";

const SOURCE_LABELS: Record<CardSource, string> = {
  word: "Words",
  own_error: "My errors",
  unit_item: "Exercises",
};

function CardRow({ card }: { card: CardView }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const refresh = () => queryClient.invalidateQueries({ queryKey: vocabularyKeys.all });
  const update = useMutation({
    mutationFn: (patch: Parameters<typeof updateCard>[1]) => updateCard(card.id, patch),
    onSuccess: () => {
      setEditing(false);
      return refresh();
    },
  });
  const remove = useMutation({ mutationFn: () => deleteCard(card.id), onSuccess: refresh });
  const error = update.error ?? remove.error;

  return (
    <li className={styles.cardRow}>
      {editing ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({ front: front.trim(), back: back.trim() });
          }}
        >
          <Field label="Front">
            {(control) => (
              <textarea {...control} value={front} onChange={(e) => setFront(e.target.value)} />
            )}
          </Field>
          <Field label="Back">
            {(control) => (
              <textarea {...control} value={back} onChange={(e) => setBack(e.target.value)} />
            )}
          </Field>
          <div className={styles.actions}>
            <Button
              type="submit"
              size="sm"
              disabled={!front.trim() || !back.trim() || update.isPending}
            >
              Save
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className={styles.cardText}>
            <p className={styles.front}>{card.front}</p>
            <p className={styles.backText}>{card.back}</p>
            <p className={styles.meta}>
              {SOURCE_LABELS[card.source]} · {card.phase}
              {card.phase === "new" ? "" : ` · due ${card.due.slice(0, 10)}`}
              {card.suspended ? " · suspended" : ""}
            </p>
          </div>
          <div className={styles.rowActions}>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={update.isPending}
              onClick={() => update.mutate({ suspended: !card.suspended })}
            >
              {card.suspended ? "Resume" : "Suspend"}
            </Button>
            {confirming ? (
              <Button
                size="sm"
                className={styles.danger}
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Confirm delete
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            )}
          </div>
        </>
      )}
      {error ? <p className={styles.error}>{error.message}</p> : null}
    </li>
  );
}

/** `/vocabulary/cards`: search, filter by source, edit, suspend and delete cards. */
export function CardsPage() {
  const [source, setSource] = useState<CardSource | "">("");
  const [q, setQ] = useState("");
  const cards = useQuery({
    queryKey: vocabularyKeys.cards(source, q.trim()),
    queryFn: () => fetchCards(source, q),
    placeholderData: (previous) => previous,
  });
  const list = cards.data?.cards ?? [];

  return (
    <section className={styles.page} aria-labelledby="cards-title">
      <VocabularyHeader
        id="cards-title"
        eyebrow="Your deck"
        title="Cards"
        link={{ to: "/vocabulary", label: "Review" }}
      />
      <div className={styles.filters}>
        <input
          type="search"
          className={styles.search}
          placeholder="Search cards"
          aria-label="Search cards"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={styles.select}
          aria-label="Source"
          value={source}
          onChange={(e) => setSource(e.target.value as CardSource | "")}
        >
          <option value="">All sources</option>
          {(Object.keys(SOURCE_LABELS) as CardSource[]).map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
        {cards.data ? (
          <p className={styles.count} aria-live="polite">
            <span className="numeral">{list.length}</span> {list.length === 1 ? "card" : "cards"}
          </p>
        ) : null}
      </div>
      {cards.isPending ? <p className={styles.muted}>Loading…</p> : null}
      {cards.isError ? <p className={styles.error}>{cards.error.message}</p> : null}
      {cards.data && list.length === 0 ? <p className={styles.muted}>No cards found.</p> : null}
      <ul className={styles.list}>
        {list.map((card) => (
          <CardRow key={`${card.id}:${card.front}:${card.back}`} card={card} />
        ))}
      </ul>
    </section>
  );
}
