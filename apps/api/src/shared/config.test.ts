import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

/** Every required variable with a valid value; tests remove or override one at a time. */
const base: Record<string, string> = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  PORT: "3000",
  APP_USER_EMAIL: "admin@example.com",
  APP_USER_PASSWORD: "a long enough passphrase",
  APP_SECRET: "ab".repeat(32),
  TRUST_PROXY: "false",
  EDITOR_ENABLED: "true",
  EDITOR_HOUR: "5",
  CONTENT_DIR: "content",
};

const without = (name: string) => {
  const { [name]: _removed, ...rest } = base;
  return rest;
};

describe("loadConfig", () => {
  it("parses a complete environment", () => {
    expect(loadConfig(base)).toEqual({
      DATABASE_URL: "postgres://u:p@localhost:5432/db",
      PORT: 3000,
      APP_USER_EMAIL: "admin@example.com",
      APP_USER_PASSWORD: "a long enough passphrase",
      APP_SECRET: "ab".repeat(32),
      TRUST_PROXY: false,
      EDITOR_ENABLED: true,
      EDITOR_HOUR: 5,
      CONTENT_DIR: "content",
    });
  });

  it.each(Object.keys(base))("fails when %s is missing", (name) => {
    expect(() => loadConfig(without(name))).toThrow(new RegExp(`\\b${name}\\b`));
  });

  it.each(Object.keys(base))("fails when %s is empty", (name) => {
    expect(() => loadConfig({ ...base, [name]: "" })).toThrow(new RegExp(`\\b${name}\\b`));
  });

  it("names every missing variable in one error", () => {
    const error = (() => {
      try {
        loadConfig({});
      } catch (caught) {
        return caught as Error;
      }
    })();
    expect(error?.message).toMatch(/^Invalid environment:/);
    for (const name of Object.keys(base)) expect(error?.message).toContain(name);
  });

  it("does not accept the env AI keys any more", () => {
    const config = loadConfig({ ...base, OLLAMA_API_KEY: "k", OPENROUTER_API_KEY: "k" });
    expect(config).not.toHaveProperty("OLLAMA_API_KEY");
    expect(config).not.toHaveProperty("OPENROUTER_API_KEY");
  });

  it("ignores the removed provider URL, public URL and cookie variables", () => {
    const removed = ["OLLAMA_BASE_URL", "OPENROUTER_BASE_URL", "APP_PUBLIC_URL", "COOKIE_SECURE"];
    const config = loadConfig({
      ...base,
      OLLAMA_BASE_URL: "not a url",
      OPENROUTER_BASE_URL: "not a url",
      APP_PUBLIC_URL: "not a url",
      COOKIE_SECURE: "yes",
    });
    for (const name of removed) expect(config).not.toHaveProperty(name);
  });

  it("keeps WEB_DIST_DIR optional: unset means the api does not serve the web build", () => {
    expect(loadConfig(base).WEB_DIST_DIR).toBeUndefined();
    expect(loadConfig({ ...base, WEB_DIST_DIR: "" }).WEB_DIST_DIR).toBeUndefined();
    expect(loadConfig({ ...base, WEB_DIST_DIR: "/app/web" }).WEB_DIST_DIR).toBe("/app/web");
  });

  it("parses the boolean switches", () => {
    const config = loadConfig({ ...base, TRUST_PROXY: "true", EDITOR_ENABLED: "false" });
    expect(config.TRUST_PROXY).toBe(true);
    expect(config.EDITOR_ENABLED).toBe(false);
  });

  it.each([
    ["TRUST_PROXY", "yes"],
    ["EDITOR_ENABLED", "1"],
    ["EDITOR_HOUR", "24"],
    ["EDITOR_HOUR", "-1"],
    ["PORT", "abc"],
    ["DATABASE_URL", "mysql://u:p@localhost/db"],
  ])("rejects an invalid %s (%s)", (name, value) => {
    expect(() => loadConfig({ ...base, [name]: value })).toThrow(new RegExp(`\\b${name}\\b`));
  });

  it("requires a valid admin email and a password of at least 8 characters", () => {
    expect(() => loadConfig({ ...base, APP_USER_EMAIL: "not-an-email" })).toThrow(/APP_USER_EMAIL/);
    expect(() => loadConfig({ ...base, APP_USER_PASSWORD: "seven77" })).toThrow(
      /at least 8 characters/,
    );
    expect(() => loadConfig({ ...base, APP_USER_PASSWORD: "change-me" })).not.toThrow();
  });

  it("no longer accepts APP_PASSWORD in place of the admin credentials", () => {
    const { APP_USER_EMAIL: _e, APP_USER_PASSWORD: _p, ...rest } = base;
    expect(() => loadConfig({ ...rest, APP_PASSWORD: "a long enough passphrase" })).toThrow(
      /APP_USER_EMAIL/,
    );
  });
});
