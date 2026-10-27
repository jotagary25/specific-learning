import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId } from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeftIcon, Button, Eyebrow, TutorIcon } from "../../shared/ui/index.ts";
import styles from "./Tutor.module.css";
import { TutorChat } from "./TutorChat.tsx";
import { useTutor } from "./TutorProvider.tsx";
import { tutorKeys } from "./tutor.api.ts";
import { contextLabel } from "./tutor.model.ts";

/** Floating "Ask the tutor" button: opens the drawer with the current screen as context. */
export function TutorButton() {
  const { open, openTutor } = useTutor();
  const { pathname } = useLocation();
  if (open || pathname.startsWith("/tutor")) return null;
  return (
    <button
      type="button"
      className={styles.fab}
      // Keep the learner's field focused while pressing, so we know where to come back to.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => openTutor()}
    >
      <TutorIcon size={22} />
      <span className={styles.fabLabel}>Ask the tutor</span>
    </button>
  );
}

/** Side drawer with the tutor chat; "Back to my task" closes it and restores focus. */
export function TutorDrawer() {
  const { open, context, session, conversationId, closeTutor, setConversationId } = useTutor();
  const queryClient = useQueryClient();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTutor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeTutor]);

  if (!open) return null;
  return (
    <aside className={styles.drawer} role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <header className={styles.drawerHeader}>
        <div className={styles.drawerHeading}>
          <Eyebrow rule>Stuck? Ask</Eyebrow>
          <h2 id={titleId} className={styles.drawerTitle}>
            Tutor
          </h2>
          <p className={styles.context}>
            {contextLabel(context)} ·{" "}
            <Link to="/tutor" onClick={closeTutor}>
              History
            </Link>
          </p>
        </div>
        <Button variant="secondary" onClick={closeTutor} className={styles.back}>
          <span className={styles.backLabel}>
            <ArrowLeftIcon size={18} />
            Back to my task
          </span>
        </Button>
      </header>
      <TutorChat
        key={session}
        conversationId={conversationId}
        context={context}
        onConversation={setConversationId}
        onTurnEnd={() => void queryClient.invalidateQueries({ queryKey: tutorKeys.list })}
        autoFocus
      />
    </aside>
  );
}
