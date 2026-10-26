import { PREFERENCE_DEFAULTS, Preferences } from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createAuth } from "../auth/auth.ts";
import { DEFAULT_WRITING_DAY, WRITING_DAY_KEY } from "../today/today.sources.ts";
import { DEFAULT_NEW_PER_DAY, NEW_PER_DAY_KEY } from "../vocabulary/vocabulary.service.ts";
import { createPreferences } from "./preferences.ts";
import { createMemorySettingsStore } from "./settings.store.ts";

const APP_SECRET = "ef".repeat(32);
const PASSWORD = "pw";

async function setup() {
  const store = createMemorySettingsStore();
  const auth = createAuth({ password: PASSWORD, appSecret: APP_SECRET });
  const app = createApp({ pingDb: async () => true, auth, preferences: createPreferences(store) });
  const login = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const call = (method: string, body?: unknown) =>
    app.request("/api/settings/preferences", {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { app, call, store };
}

describe("preferences", () => {
  it("use the same keys and defaults as the modules that read them", () => {
    expect(PREFERENCE_DEFAULTS).toEqual({
      [WRITING_DAY_KEY]: DEFAULT_WRITING_DAY,
      [NEW_PER_DAY_KEY]: DEFAULT_NEW_PER_DAY,
    });
  });

  it("require a session", async () => {
    const { app } = await setup();
    expect((await app.request("/api/settings/preferences")).status).toBe(401);
  });

  it("return defaults while unset and ignore invalid stored values", async () => {
    const { call, store } = await setup();
    expect(Preferences.parse(await (await call("GET")).json())).toEqual(PREFERENCE_DEFAULTS);
    await store.putSetting(WRITING_DAY_KEY, "friday");
    const read = Preferences.parse(await (await call("GET")).json());
    expect(read[WRITING_DAY_KEY]).toBe(DEFAULT_WRITING_DAY);
  });

  it("save a partial update and return the effective values", async () => {
    const { call, store } = await setup();
    const res = await call("PUT", { [WRITING_DAY_KEY]: 3 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...PREFERENCE_DEFAULTS, [WRITING_DAY_KEY]: 3 });
    expect(await store.getSetting(WRITING_DAY_KEY)).toBe(3);
    expect(await store.getSetting(NEW_PER_DAY_KEY)).toBeUndefined();

    await call("PUT", { [NEW_PER_DAY_KEY]: 12 });
    expect(await (await call("GET")).json()).toEqual({
      [WRITING_DAY_KEY]: 3,
      [NEW_PER_DAY_KEY]: 12,
    });
  });

  it("reject unknown keys and out-of-range values without writing", async () => {
    const { call, store } = await setup();
    for (const body of [
      { "llm.fn.check_answer": { model: "x" } },
      { [WRITING_DAY_KEY]: 7 },
      { [NEW_PER_DAY_KEY]: -1 },
      { [NEW_PER_DAY_KEY]: 2.5 },
      null,
    ]) {
      const res = await call("PUT", body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_body" });
    }
    expect(await store.getSetting(WRITING_DAY_KEY)).toBeUndefined();
    expect(await store.getSetting(NEW_PER_DAY_KEY)).toBeUndefined();
  });
});
