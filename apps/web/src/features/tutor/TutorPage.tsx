import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button, Eyebrow, PlusIcon } from "../../shared/ui/index.ts";
import styles from "./Tutor.module.css";
import { TutorChat } from "./TutorChat.tsx";
import { fetchConversations, tutorKeys } from "./tutor.api.ts";
import { contextLabel } from "./tutor.model.ts";

const FREE_CHAT = { kind: "free", ref: "/tutor" } as const;

/** `/tutor`: past conversations and a full-screen chat (free mode from the menu). */
export function TutorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: tutorKeys.list, queryFn: fetchConversations });
  // A conversation this page just created keeps its mounted chat (and its stream) alive.
  const created = useRef<string | undefined>(undefined);
  const [fresh, setFresh] = useState(0);
  const selected = list.data?.conversations.find((c) => c.id === id);
  const chatKey = id && id !== created.current ? id : `new-${fresh}`;

  const onConversation = useCallback(
    (newId: string) => {
      created.current = newId;
      void navigate(`/tutor/${newId}`, { replace: true });
    },
    [navigate],
  );

  return (
    <div className={styles.page}>
      <nav className={styles.history} aria-label="Conversations">
        <div className={styles.historyHead}>
          <Eyebrow rule>Conversations</Eyebrow>
          <h1 className={styles.pageTitle}>Tutor</h1>
          <p className={styles.context}>Short answers in Spanish, with the screen as context.</p>
        </div>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            created.current = undefined;
            setFresh((n) => n + 1);
            void navigate("/tutor");
          }}
        >
          <span className={styles.backLabel}>
            <PlusIcon size={18} />
            New chat
          </span>
        </Button>
        {list.isError ? <p className={styles.error}>{list.error.message}</p> : null}
        <ul className={styles.historyList}>
          {list.data?.conversations.map((c) => (
            <li key={c.id}>
              <Link
                to={`/tutor/${c.id}`}
                className={styles.historyLink}
                aria-current={c.id === id ? "page" : undefined}
              >
                <span className={styles.historyPreview}>{c.preview ?? "(no messages yet)"}</span>
                <span className={styles.historyMeta}>
                  {contextLabel(c.context)} · {new Date(c.createdAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <section className={styles.pageChat} aria-label="Chat">
        <TutorChat
          key={chatKey}
          conversationId={chatKey === id ? id : undefined}
          context={selected?.context ?? FREE_CHAT}
          onConversation={onConversation}
          onTurnEnd={() => void queryClient.invalidateQueries({ queryKey: tutorKeys.list })}
        />
      </section>
    </div>
  );
}
