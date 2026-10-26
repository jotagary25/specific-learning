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

const openrouter: SettingsOptions["openrouter"] = {
  createClient: () => createFakeLlm({ models: [{ name: "x/y" }] }),
};

describe("settings service: keys come only from Settings", () => {
  it("has no key until the user stores one", async () => {
    const settings = setup({ openrouter });

    expect(await settings.getApiKey("u1", "ollama")).toBeUndefined();
    expect(await settings.keyStatus("u1", "ollama")).toEqual({
      configured: false,
      source: null,
      last4: null,
    });

    await settings.setKey("u1", "user-ollama-key-1234", "ollama");

    expect(await settings.getApiKey("u1", "ollama")).toBe("user-ollama-key-1234");
    expect(await settings.getApiKey("u2", "ollama")).toBeUndefined();
    expect(await settings.keyStatus("u1", "ollama")).toEqual({
      configured: true,
      source: "db",
      last4: "1234",
    });
  });
});

describe("settings service: default provider", () => {
  it("uses Ollama for a user who stored no key", async () => {
    const settings = setup({ openrouter });

    expect((await settings.providerView("u1")).provider).toBe("ollama");
  });

  it("uses the provider whose key the user stored", async () => {
    const settings = setup({ openrouter });

    await settings.setKey("u1", "user-openrouter-key", "openrouter");

    expect((await settings.providerView("u1")).provider).toBe("openrouter");
    expect((await settings.providerView("u2")).provider).toBe("ollama");
  });

  it("keeps an explicit choice over the stored keys", async () => {
    const settings = setup({ openrouter });

    await settings.setKey("u1", "user-openrouter-key", "openrouter");
    await settings.setProvider("u1", "ollama");

    expect((await settings.providerView("u1")).provider).toBe("ollama");
  });
});
