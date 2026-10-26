import { z } from "zod";

/**
 * Learner preferences stored in the key/value `setting` table, keyed by their setting key.
 * Only these keys are readable/writable through `/api/settings/preferences`.
 */
export const Preferences = z.object({
  /** Weekday for the weekly writing mission, `Date#getDay()` numbering (0 = Sunday). */
  "today.writingDay": z.number().int().min(0).max(6),
  /** New SRS cards introduced per day. */
  "srs.newPerDay": z.number().int().min(0).max(100),
});
export type Preferences = z.infer<typeof Preferences>;
export type PreferenceKey = keyof Preferences;

/** Values used while a preference is unset (mirrors the defaults of the owning modules). */
export const PREFERENCE_DEFAULTS: Preferences = {
  "today.writingDay": 6,
  "srs.newPerDay": 5,
};

/** Partial update: unknown keys are rejected. */
export const UpdatePreferencesRequest = Preferences.partial().strict();
export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequest>;
