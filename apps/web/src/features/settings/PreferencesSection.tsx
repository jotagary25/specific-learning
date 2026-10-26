import type { Preferences } from "@english-course/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import styles from "./SettingsPage.module.css";
import { fetchPreferences, preferencesKey, savePreferences } from "./settings.api.ts";

/** `Date#getDay()` order, as stored in `today.writingDay`. */
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function PreferencesForm({ initial }: { initial: Preferences }) {
  const queryClient = useQueryClient();
  const [writingDay, setWritingDay] = useState(initial["today.writingDay"]);
  const [newPerDay, setNewPerDay] = useState(String(initial["srs.newPerDay"]));
  const [message, setMessage] = useState("");
  const dayId = useId();
  const newId = useId();

  const parsedNew = Number(newPerDay);
  const newValid = newPerDay.trim() !== "" && Number.isInteger(parsedNew) && parsedNew >= 0;

  const save = useMutation({
    mutationFn: savePreferences,
    onSuccess: async (next) => {
      queryClient.setQueryData(preferencesKey, next);
      setMessage("Preferences saved.");
      // The Today plan and the SRS queue read these values.
      await queryClient.invalidateQueries({ queryKey: ["today"] });
      await queryClient.invalidateQueries({ queryKey: ["vocabulary"] });
    },
    onError: (error) => setMessage(error.message),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!newValid) return;
    save.mutate({ "today.writingDay": writingDay, "srs.newPerDay": parsedNew });
  };

  return (
    <form className={styles.keyForm} onSubmit={onSubmit}>
      <label htmlFor={dayId} className={styles.label}>
        Writing day
      </label>
      <select
        id={dayId}
        className={styles.select}
        value={writingDay}
        onChange={(event) => setWritingDay(Number(event.target.value))}
      >
        {WEEKDAYS.map((day, index) => (
          <option key={day} value={index}>
            {day}
          </option>
        ))}
      </select>
      <label htmlFor={newId} className={styles.label}>
        New cards per day
      </label>
      <input
        id={newId}
        className={styles.input}
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        value={newPerDay}
        onChange={(event) => setNewPerDay(event.target.value)}
      />
      <div className={styles.actions}>
        <button className={styles.primary} type="submit" disabled={!newValid || save.isPending}>
          Save preferences
        </button>
      </div>
      <p role="status" className={styles.message}>
        {message}
      </p>
    </form>
  );
}

/** Writing day for the weekly mission and the SRS new-card allowance. */
export function PreferencesSection() {
  const titleId = useId();
  const preferences = useQuery({ queryKey: preferencesKey, queryFn: fetchPreferences });

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.heading}>
        Study preferences
      </h2>
      {preferences.isPending ? (
        <p className={styles.muted}>Loading…</p>
      ) : preferences.isError ? (
        <p className={styles.muted}>Could not load the preferences.</p>
      ) : (
        <PreferencesForm initial={preferences.data} />
      )}
    </section>
  );
}
