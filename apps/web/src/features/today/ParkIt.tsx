import { PARKING_TEXT_MAX } from "@english-course/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "../../shared/ui/index.ts";
import styles from "./Today.module.css";
import { addParking, todayKeys } from "./today.api.ts";

/** Quick-add field for the parking list: one line, then back to work. */
export function ParkItForm({
  label = "Park it",
  placeholder = "Something caught your interest?",
  onDone,
}: {
  label?: string;
  placeholder?: string;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const add = useMutation({
    mutationFn: addParking,
    onSuccess: async () => {
      setText("");
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: todayKeys.all });
      onDone?.();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) add.mutate(text.trim());
  };

  return (
    <form className={styles.parkForm} onSubmit={submit}>
      <label className="visually-hidden" htmlFor="park-text">
        {placeholder}
      </label>
      <input
        id="park-text"
        className={styles.input}
        value={text}
        maxLength={PARKING_TEXT_MAX}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
      />
      <Button type="submit" variant="secondary" disabled={add.isPending || !text.trim()}>
        {label}
      </Button>
      {saved && (
        <span className={styles.ok} role="status">
          Parked. Back to it later.
        </span>
      )}
      {add.isError && <span className={styles.error}>{add.error.message}</span>}
    </form>
  );
}
