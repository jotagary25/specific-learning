import type { PreferencesView } from "@english-course/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useMemo, useState } from "react";
import styles from "./SettingsPage.module.css";
import { fetchPreferences, preferencesKey, savePreferences } from "./settings.api.ts";
import { hourLabel, timeZoneOptions, ZONED_QUERY_KEYS } from "./time-zones.ts";

/** 0 = Sunday order, as stored in `today.writingDay`. */
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function PreferencesForm({ initial }: { initial: PreferencesView }) {
  const queryClient = useQueryClient();
  const [writingDay, setWritingDay] = useState(initial["today.writingDay"]);
  const [newPerDay, setNewPerDay] = useState(String(initial["srs.newPerDay"]));
  const [timeZone, setTimeZone] = useState(initial["clock.timeZone"]);
  const [editorHour, setEditorHour] = useState(initial["reading.editorHour"]);
  const [message, setMessage] = useState("");
  const dayId = useId();
  const newId = useId();
  const zoneId = useId();
  const zoneListId = useId();
  const hourId = useId();
  const zones = useMemo(() => timeZoneOptions(initial["clock.timeZone"]), [initial]);

  const parsedNew = Number(newPerDay);
  const newValid = newPerDay.trim() !== "" && Number.isInteger(parsedNew) && parsedNew >= 0;
  const zoneValid = zones.includes(timeZone.trim());

  const save = useMutation({
    mutationFn: savePreferences,
    onSuccess: async (next) => {
      queryClient.setQueryData(preferencesKey, next);
      setMessage("Preferences saved.");
      // The Today plan, the SRS queue, reading and progress read these values.
      await Promise.all(
        ZONED_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
    onError: (error) => setMessage(error.message),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!newValid || !zoneValid) return;
    save.mutate({
      "today.writingDay": writingDay,
      "srs.newPerDay": parsedNew,
      "clock.timeZone": timeZone.trim(),
      "reading.editorHour": editorHour,
    });
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
      <label htmlFor={zoneId} className={styles.label}>
        Time zone
      </label>
      <input
        id={zoneId}
        className={styles.input}
        list={zoneListId}
        autoComplete="off"
        spellCheck={false}
        value={timeZone}
        aria-invalid={!zoneValid}
        onChange={(event) => setTimeZone(event.target.value)}
      />
      <datalist id={zoneListId}>
        {zones.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
      <p className={styles.hint}>
        {zoneValid
          ? "Your days, study plan and daily article follow this zone."
          : "Pick a zone from the list, e.g. America/La_Paz or UTC."}
      </p>
      <label htmlFor={hourId} className={styles.label}>
        Daily article from
      </label>
      <select
        id={hourId}
        className={styles.select}
        value={editorHour}
        onChange={(event) => setEditorHour(Number(event.target.value))}
      >
        {HOURS.map((hour) => (
          <option key={hour} value={hour}>
            {hourLabel(hour)}
          </option>
        ))}
      </select>
      <div className={styles.actions}>
        <button
          className={styles.primary}
          type="submit"
          disabled={!newValid || !zoneValid || save.isPending}
        >
          Save preferences
        </button>
      </div>
      <p role="status" className={styles.message}>
        {message}
      </p>
    </form>
  );
}

/** Writing day, SRS new-card allowance, time zone and the daily article hour. */
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
