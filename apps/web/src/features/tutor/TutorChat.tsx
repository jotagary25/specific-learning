import type { TutorContextInput } from "@english-course/shared";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../../shared/ui/index.ts";
import styles from "./Tutor.module.css";
import { type ChatEntry, QUICK_PROMPTS } from "./tutor.model.ts";
import { useTutorChat } from "./useTutorChat.ts";

type Props = {
  conversationId?: string;
  context: TutorContextInput;
  onConversation?: (id: string) => void;
  onTurnEnd?: () => void;
  autoFocus?: boolean;
};

function Bubble({ entry }: { entry: ChatEntry }) {
  const isTutor = entry.role === "assistant";
  return (
    <li
      className={isTutor ? styles.tutorBubble : styles.userBubble}
      data-tone={isTutor ? "cream" : "plum"}
      lang={isTutor ? "es" : undefined}
    >
      <span className={styles.speaker} aria-hidden="true" lang="en">
        {isTutor ? "Tutor" : "You"}
      </span>
      {entry.tools.length > 0 ? (
        <ul className={styles.chips} aria-label="Tools used" lang="en">
          {entry.tools.map((tool) => (
            <li key={tool.key} className={tool.ok ? styles.chip : styles.chipFailed}>
              {tool.label}
            </li>
          ))}
        </ul>
      ) : null}
      {(entry.thinking || entry.streaming) && !entry.text ? (
        <p className={styles.thinking} role="status" lang="en">
          Thinking…
        </p>
      ) : null}
      {entry.text ? <p className={styles.text}>{entry.text}</p> : null}
      {entry.error ? (
        <p className={styles.error} role="alert" lang="en">
          {entry.error}
        </p>
      ) : null}
    </li>
  );
}

/** The conversation: bubbles streaming in, tool chips, quick prompts and the message box. */
export function TutorChat({
  conversationId,
  context,
  onConversation,
  onTurnEnd,
  autoFocus,
}: Props) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const { entries, busy, loading, send, stop } = useTutorChat({
    conversationId,
    context,
    onConversation,
    onTurnEnd,
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const lastText = entries.at(-1)?.text;
  useEffect(() => {
    if (entries.length > 0 || lastText) endRef.current?.scrollIntoView?.({ block: "end" });
  }, [entries.length, lastText]);

  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    setDraft("");
    void send(text);
  };

  return (
    <div className={styles.chat}>
      <ol className={styles.log} role="log" aria-live="polite" aria-label="Conversation">
        {loading ? <li className={styles.note}>Loading the conversation…</li> : null}
        {!loading && entries.length === 0 ? (
          <li className={styles.note}>
            Ask about what confuses you. Answers are short and in Spanish.
          </li>
        ) : null}
        {entries.map((entry) => (
          <Bubble key={entry.id} entry={entry} />
        ))}
      </ol>
      <div ref={endRef} />

      <fieldset className={styles.quick}>
        <legend className="visually-hidden">Quick prompts</legend>
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className={styles.quickButton}
            disabled={busy}
            onClick={() => submit(prompt)}
          >
            {prompt}
          </button>
        ))}
      </fieldset>

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <label htmlFor={inputId} className="visually-hidden">
          Your question
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          className={styles.input}
          value={draft}
          rows={2}
          maxLength={2000}
          placeholder="Ask the tutor…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(draft);
            }
          }}
        />
        {busy ? (
          <Button variant="secondary" onClick={stop} className={styles.send}>
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!draft.trim()} className={styles.send}>
            Send
          </Button>
        )}
      </form>
    </div>
  );
}
