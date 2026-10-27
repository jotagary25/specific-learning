import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button, CheckIcon } from "../../shared/ui/index.ts";
import styles from "./Progress.module.css";
import { addCanDo, fetchCanDo, progressKeys } from "./progress.api.ts";
import { shortDate } from "./progress.model.ts";

/** "Now I can…" entries: the learner's own plus the descriptors suggested by finished units. */
export function CanDoLog() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: progressKeys.canDo, queryFn: fetchCanDo });
  const [text, setText] = useState("");
  const add = useMutation({
    mutationFn: addCanDo,
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: progressKeys.canDo });
      void queryClient.invalidateQueries({ queryKey: progressKeys.timeline });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) add.mutate(text.trim());
  };

  return (
    <div className={styles.stack}>
      <form className={styles.inline} onSubmit={submit}>
        <label htmlFor="can-do-input" className="visually-hidden">
          Now I can…
        </label>
        <input
          id="can-do-input"
          className={styles.input}
          value={text}
          maxLength={280}
          placeholder="Now I can…"
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={!text.trim() || add.isPending}>
          Add
        </Button>
      </form>
      {add.isError ? (
        <p role="alert" className={styles.error}>
          Could not save it: {add.error.message}
        </p>
      ) : null}
      {list.isError ? (
        <p role="alert" className={styles.error}>
          Could not load the log: {list.error.message}
        </p>
      ) : null}
      {list.data && list.data.entries.length === 0 ? (
        <p className={styles.muted}>
          Write the first thing you can do now that you couldn't before.
        </p>
      ) : null}
      {list.data && list.data.entries.length > 0 ? (
        <ul className={styles.list} aria-label="Can-do log">
          {list.data.entries.map((entry) => (
            <li key={entry.id} className={styles.canDo}>
              <CheckIcon size={18} className={styles.canDoIcon} />
              <span>{entry.text}</span>
              <span className={styles.muted}>
                {shortDate(entry.createdAt)}
                {entry.source === "suggested" ? " · from a finished unit" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
