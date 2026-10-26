import { PREFERENCE_DEFAULTS, PreferencesView } from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createTestAuth, loginCookie } from "../auth/auth.test-support.ts";
import { REPO_CONTENT_DIR } from "../content/content-dir.test-support.ts";
import { DEFAULT_WRITING_DAY, WRITING_DAY_KEY } from "../today/today.sources.ts";
import { DEFAULT_NEW_PER_DAY, NEW_PER_DAY_KEY } from "../vocabulary/vocabulary.service.ts";
import {
  createPreferences,
  EDITOR_HOUR_KEY,
  type PreferencesOptions,
  TIME_ZONE_KEY,
} from "./preferences.ts";
import { createMemorySettingsStore } from "./settings.store.ts";

const UNSET = { ...PREFERENCE_DEFAULTS, "clock.timeZoneChosen": false };

async function setup(options: PreferencesOptions = {}) {
  const store = createMemorySettingsStore();
  const { auth, user } = await createTestAuth();
  const userId = user.id;
  const preferences = createPreferences(store, options);
  const app = createApp({
    contentDir: REPO_CONTENT_DIR,
    pingDb: async () => true,
    auth,
    preferences,
  });
  const cookie = await loginCookie(app);
  const call = (method: string, body?: unknown) =>
    app.request("/api/settings/preferences", {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { app, call, store, userId, preferences };
}

describe("preferences", () => {
  it("use the same keys and defaults as the modules that read them", () => {
    expect(PREFERENCE_DEFAULTS).toEqual({
      [WRITING_DAY_KEY]: DEFAULT_WRITING_DAY,
      [NEW_PER_DAY_KEY]: DEFAULT_NEW_PER_DAY,
      [TIME_ZONE_KEY]: "UTC",
      [EDITOR_HOUR_KEY]: 5,
    });
  });

  it("require a session", async () => {
    const { app } = await setup();
    expect((await app.request("/api/settings/preferences")).status).toBe(401);
  });

  it("return defaults while unset and ignore invalid stored values", async () => {
    const { call, store, userId } = await setup();
    expect(PreferencesView.parse(await (await call("GET")).json())).toEqual(UNSET);
    await store.putSetting(userId, WRITING_DAY_KEY, "friday");
    await store.putSetting(userId, TIME_ZONE_KEY, "Mars/Olympus_Mons");
    const read = PreferencesView.parse(await (await call("GET")).json());
    expect(read[WRITING_DAY_KEY]).toBe(DEFAULT_WRITING_DAY);
    expect(read[TIME_ZONE_KEY]).toBe("UTC");
    expect(read["clock.timeZoneChosen"]).toBe(false);
  });

  it("save a partial update and return the effective values", async () => {
    const { call, store, userId } = await setup();
    const res = await call("PUT", { [WRITING_DAY_KEY]: 3 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...UNSET, [WRITING_DAY_KEY]: 3 });
    expect(await store.getSetting(userId, WRITING_DAY_KEY)).toBe(3);
    expect(await store.getSetting(userId, NEW_PER_DAY_KEY)).toBeUndefined();

    await call("PUT", { [NEW_PER_DAY_KEY]: 12 });
    expect(await (await call("GET")).json()).toEqual({
      ...UNSET,
      [WRITING_DAY_KEY]: 3,
      [NEW_PER_DAY_KEY]: 12,
    });
  });

  it("save the time zone in its canonical spelling and remember it was chosen", async () => {
    const { call, store, userId, preferences } = await setup();
    const res = await call("PUT", { [TIME_ZONE_KEY]: "america/la_paz", [EDITOR_HOUR_KEY]: 7 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      [TIME_ZONE_KEY]: "America/La_Paz",
      [EDITOR_HOUR_KEY]: 7,
      "clock.timeZoneChosen": true,
    });
    expect(await store.getSetting(userId, TIME_ZONE_KEY)).toBe("America/La_Paz");
    expect(await preferences.timeZoneOf(userId)).toBe("America/La_Paz");
    expect(await preferences.editorHour(userId)).toBe(7);

    // Keeping UTC is a choice too: the web stops proposing the browser zone.
    await call("PUT", { [TIME_ZONE_KEY]: "UTC" });
    expect(await (await call("GET")).json()).toMatchObject({
      [TIME_ZONE_KEY]: "UTC",
      "clock.timeZoneChosen": true,
    });
  });

  it("default the editor hour to the instance EDITOR_HOUR", async () => {
    const { call, userId, preferences } = await setup({ defaults: { [EDITOR_HOUR_KEY]: 9 } });
    expect(await (await call("GET")).json()).toMatchObject({ [EDITOR_HOUR_KEY]: 9 });
    expect(await preferences.editorHour(userId)).toBe(9);
  });

  it("reject unknown keys and out-of-range values without writing", async () => {
    const { call, store, userId } = await setup();
    for (const body of [
      { "llm.fn.check_answer": { model: "x" } },
      { [WRITING_DAY_KEY]: 7 },
      { [NEW_PER_DAY_KEY]: -1 },
      { [NEW_PER_DAY_KEY]: 2.5 },
      { [TIME_ZONE_KEY]: "Mars/Olympus_Mons" },
      { [TIME_ZONE_KEY]: "+05:00" },
      { [EDITOR_HOUR_KEY]: 24 },
      null,
    ]) {
      const res = await call("PUT", body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_body" });
    }
    expect(await store.getSetting(userId, WRITING_DAY_KEY)).toBeUndefined();
    expect(await store.getSetting(userId, NEW_PER_DAY_KEY)).toBeUndefined();
    expect(await store.getSetting(userId, TIME_ZONE_KEY)).toBeUndefined();
    expect(await store.getSetting(userId, EDITOR_HOUR_KEY)).toBeUndefined();
  });
});
