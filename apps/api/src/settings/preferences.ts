import {
  PREFERENCE_DEFAULTS,
  type PreferenceKey,
  Preferences,
  UpdatePreferencesRequest,
} from "@english-course/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../auth/auth.ts";
import type { SettingsStore } from "./settings.store.ts";

const KEYS = Object.keys(Preferences.shape) as PreferenceKey[];

/**
 * Learner preferences (writing day, new cards per day): a whitelisted view over the user's
 * key/value `setting` rows. Unset or invalid stored values read as their defaults.
 */
export function createPreferences(store: Pick<SettingsStore, "getSetting" | "putSetting">) {
  async function get(userId: string): Promise<Preferences> {
    const values = await Promise.all(
      KEYS.map(async (key) => {
        const parsed = Preferences.shape[key].safeParse(await store.getSetting(userId, key));
        return [key, parsed.success ? parsed.data : PREFERENCE_DEFAULTS[key]] as const;
      }),
    );
    return Object.fromEntries(values) as Preferences;
  }

  return {
    get,
    async update(userId: string, patch: UpdatePreferencesRequest): Promise<Preferences> {
      for (const key of KEYS) {
        const value = patch[key];
        if (value !== undefined) await store.putSetting(userId, key, value);
      }
      return get(userId);
    },
  };
}

export type PreferencesService = ReturnType<typeof createPreferences>;

/** `/api/settings/preferences`: GET the effective values, PUT a partial update of allowed keys. */
export function preferencesRoutes(preferences: PreferencesService) {
  return new Hono<AppEnv>()
    .get("/", async (c) => c.json(await preferences.get(c.get("user").id)))
    .put("/", async (c) => {
      const parsed = UpdatePreferencesRequest.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return c.json({ error: "invalid_body", message: z.prettifyError(parsed.error) }, 400);
      }
      return c.json(await preferences.update(c.get("user").id, parsed.data));
    });
}
