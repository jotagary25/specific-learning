import { describe, expect, it } from "vitest";
import { createFakeLlm } from "../shared/llm/fake.ts";
import { createSettings, type SettingsOptions } from "./settings.service.ts";
import { createMemorySettingsStore } from "./settings.store.ts";

const APP_SECRET = "cd".repeat(32);

function setup(overrides: Partial<SettingsOptions> = {}) {
  const llm = createFakeLlm({ models: [{ name: "m" }] });
  return createSettings({
    store: createMemorySettingsStore(),
    appSecret: APP_SECRET,
    createClient: () => llm,
    ...overrides,
  });
}

const openrouter = (envApiKey?: string): SettingsOptions["openrouter"] => ({
  envApiKey,
  createClient: () => createFakeLlm({ models: [{ name: "x/y" }] }),
});

describe("settings service: env keys", () => {
  it("lets only allowed users fall back to the instance env keys", async () => {
    const settings = setup({
      envApiKey: "env-ollama-key",
      mayUseEnvKeys: async (userId) => userId === "admin",
    });

    expect(await settings.getApiKey("admin", "ollama")).toBe("env-ollama-key");
    expect(await settings.getApiKey("learner", "ollama")).toBeUndefined();
    expect(await settings.keyStatus("learner", "ollama")).toEqual({
      configured: false,
      source: null,
      last4: null,
    });
  });
});

describe("settings service: default provider", () => {
  it("keeps a user on the provider whose key they stored, whatever the env keys are", async () => {
    const settings = setup({ openrouter: openrouter("env-openrouter-key") });

    await settings.setKey("u1", "user-ollama-key", "ollama");

    expect((await settings.providerView("u1")).provider).toBe("ollama");
  });

  it("falls back to the provider with an env key when the user stored none", async () => {
    const settings = setup({ openrouter: openrouter("env-openrouter-key") });

    expect((await settings.providerView("u2")).provider).toBe("openrouter");
  });
});
