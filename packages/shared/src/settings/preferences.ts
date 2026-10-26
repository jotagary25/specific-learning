import { z } from "zod";
import { DEFAULT_TIME_ZONE, TimeZone } from "./time-zone.ts";

/**
 * Learner preferences stored in the key/value `setting` table, keyed by their setting key.
 * Only these keys are readable/writable through `/api/settings/preferences`.
 */
export const Preferences = z.object({
  /** Weekday for the weekly writing mission, 0 = Sunday … 6 = Saturday in the user's zone. */
  "today.writingDay": z.number().int().min(0).max(6),
  /** New SRS cards introduced per day. */
  "srs.newPerDay": z.number().int().min(0).max(100),
  /** IANA time zone of every local day and hour the app computes for the user. */
  "clock.timeZone": TimeZone,
  /** Local hour (in `clock.timeZone`) from which the editor picks the user's daily article. */
  "reading.editorHour": z.number().int().min(0).max(23),
});
export type Preferences = z.output<typeof Preferences>;
export type PreferenceKey = keyof Preferences;

/**
 * What `GET /api/settings/preferences` returns: the effective values plus whether the user
 * ever chose a time zone (the web proposes the browser's zone once while it is false).
 */
export const PreferencesView = z.object({
  ...Preferences.shape,
  "clock.timeZone": z.string(),
  "clock.timeZoneChosen": z.boolean(),
});
export type PreferencesView = z.infer<typeof PreferencesView>;

/** Default editor hour; the api overrides it with `EDITOR_HOUR`. */
export const DEFAULT_EDITOR_HOUR = 5;

/** Values used while a preference is unset (mirrors the defaults of the owning modules). */
export const PREFERENCE_DEFAULTS: Preferences = {
  "today.writingDay": 6,
  "srs.newPerDay": 5,
  "clock.timeZone": DEFAULT_TIME_ZONE,
  "reading.editorHour": DEFAULT_EDITOR_HOUR,
};

/** Partial update: unknown keys are rejected. */
export const UpdatePreferencesRequest = Preferences.partial().strict();
export type UpdatePreferencesRequest = z.input<typeof UpdatePreferencesRequest>;
