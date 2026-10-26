import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import styles from "./SettingsPage.module.css";
import { fetchPreferences, preferencesKey, savePreferences } from "./settings.api.ts";
import { browserTimeZone, ZONED_QUERY_KEYS } from "./time-zones.ts";

/**
 * One-time proposal after login: while the user never chose a time zone and the browser's zone
 * is not UTC, offer to use it. Both answers are saved, so it never asks again.
 */
export function TimeZoneBanner() {
  const queryClient = useQueryClient();
  const preferences = useQuery({ queryKey: preferencesKey, queryFn: fetchPreferences });
  const zone = browserTimeZone();
  const choose = useMutation({
    mutationFn: (timeZone: string) => savePreferences({ "clock.timeZone": timeZone }),
    onSuccess: async (next) => {
      queryClient.setQueryData(preferencesKey, next);
      await Promise.all(
        ZONED_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  if (!preferences.data || preferences.data["clock.timeZoneChosen"]) return null;
  if (!zone || zone === "UTC") return null;

  return (
    <aside aria-label="Time zone" className={styles.banner}>
      <p>
        Use <strong>{zone}</strong> as your time zone? Your days, study plan and daily article
        follow it.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={choose.isPending}
          onClick={() => choose.mutate(zone)}
        >
          Accept
        </button>
        <button
          type="button"
          className={styles.secondary}
          disabled={choose.isPending}
          onClick={() => choose.mutate("UTC")}
        >
          Keep UTC
        </button>
      </div>
      {choose.isError && (
        <p role="alert" className={styles.message}>
          {choose.error.message}
        </p>
      )}
    </aside>
  );
}
