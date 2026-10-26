import { AsyncLocalStorage } from "node:async_hooks";
import {
  PREFERENCE_DEFAULTS,
  type PreferenceKey,
  Preferences,
  type PreferencesView,
  UpdatePreferencesRequest,
} from "@english-course/shared";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { AppEnv } from "../auth/auth.ts";
import type { SettingsStore } from "./settings.store.ts";

const KEYS = Object.keys(Preferences.shape) as PreferenceKey[];

export const TIME_ZONE_KEY = "clock.timeZone" satisfies PreferenceKey;
export const EDITOR_HOUR_KEY = "reading.editorHour" satisfies PreferenceKey;

/** Resolves the IANA time zone of a user (their preference, `UTC` while unset). */
export type TimeZoneOf = (userId: string) => Promise<string>;

/** For callers and tests without per-user zones. */
export const utcTimeZone: TimeZoneOf = async () => "UTC";

export type PreferencesOptions = {
  /** Instance defaults that override the built-in ones (e.g. `EDITOR_HOUR`). */
  defaults?: Partial<Preferences>;
};

/** Per-request memo of resolved zones; see `timeZoneScope`. */
const requestZones = new AsyncLocalStorage<Map<string, Promise<string>>>();

/**
 * Opens a per-request cache so every module that needs the user's zone during one request
 * reads the preference once.
 */
export function timeZoneScope(): MiddlewareHandler {
  return (_c, next) => requestZones.run(new Map(), next);
}

/**
 * Learner preferences (writing day, new cards per day, time zone, editor hour): a whitelisted
 * view over the user's key/value `setting` rows. Unset or invalid stored values read as their
 * defaults.
 */
export function createPreferences(
  store: Pick<SettingsStore, "getSetting" | "putSetting">,
  options: PreferencesOptions = {},
) {
  const defaults: Preferences = { ...PREFERENCE_DEFAULTS, ...options.defaults };

  async function read(userId: string, key: PreferenceKey) {
    const parsed = Preferences.shape[key].safeParse(await store.getSetting(userId, key));
    return parsed.success
      ? { value: parsed.data as unknown, stored: true }
      : { value: defaults[key] as unknown, stored: false };
  }

  async function get(userId: string): Promise<PreferencesView> {
    const entries = await Promise.all(
      KEYS.map(async (key) => [key, await read(userId, key)] as const),
    );
    const view = Object.fromEntries(entries.map(([key, r]) => [key, r.value])) as Preferences;
    const zone = entries.find(([key]) => key === TIME_ZONE_KEY)?.[1];
    return { ...view, "clock.timeZoneChosen": zone?.stored === true };
  }

  async function readTimeZone(userId: string): Promise<string> {
    return (await read(userId, TIME_ZONE_KEY)).value as string;
  }

  return {
    get,
    defaults,
    async update(userId: string, patch: Partial<Preferences>): Promise<PreferencesView> {
      for (const key of KEYS) {
        const value = patch[key];
        if (value !== undefined) await store.putSetting(userId, key, value);
      }
      requestZones.getStore()?.delete(userId);
      return get(userId);
    },

    /** The user's zone; memoized for the current request when a `timeZoneScope` is open. */
    timeZoneOf(userId: string): Promise<string> {
      const memo = requestZones.getStore();
      const cached = memo?.get(userId);
      if (cached) return cached;
      const pending = readTimeZone(userId);
      memo?.set(userId, pending);
      return pending;
    },

    async editorHour(userId: string): Promise<number> {
      return (await read(userId, EDITOR_HOUR_KEY)).value as number;
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
