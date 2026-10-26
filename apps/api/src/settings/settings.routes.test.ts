import {
  AiFunctionsResponse,
  AiKeyStatus,
  ModelCapabilities,
  ModelsResponse,
} from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createTestAuth, loginCookie } from "../auth/auth.test-support.ts";
import { REPO_CONTENT_DIR } from "../content/content-dir.test-support.ts";
import { LlmError } from "../shared/llm/errors.ts";
import { createFakeLlm, type FakeLlmOptions } from "../shared/llm/fake.ts";
import { createOllamaClient } from "../shared/llm/ollama.ts";
import { encryptSecret } from "./crypto.ts";
import { createSettings, type SettingsOptions } from "./settings.service.ts";
import { createMemorySettingsStore, memoryKey } from "./settings.store.ts";

const APP_SECRET = "ab".repeat(32);
const KEY = "ollama-secret-key-WXYZ";

const fakeOptions: FakeLlmOptions = {
  models: [{ name: "gemma4:31b" }, { name: "gpt-oss:120b" }],
  capabilities: {
    "gpt-oss:120b": {
      capabilities: ["completion", "tools", "thinking"],
      thinking: { values: ["low", "medium", "high"], default: "medium" },
    },
    "gemma4:31b": {
      capabilities: ["completion", "thinking"],
      thinking: { values: [true, false], default: true },
    },
  },
};

async function setup(overrides: Partial<SettingsOptions> = {}, llm = createFakeLlm(fakeOptions)) {
  const store = createMemorySettingsStore();
  let clock = 1_800_000_000_000;
  const settings = createSettings({
    store,
    appSecret: APP_SECRET,
    createClient: () => llm,
    now: () => clock,
    ...overrides,
  });
  const { auth, user } = await createTestAuth();
  const app = createApp({ contentDir: REPO_CONTENT_DIR, pingDb: async () => true, auth, settings });
  const cookie = await loginCookie(app);
  const userId = user.id;
  const call = (path: string, init: RequestInit = {}) =>
    app.request(`/api/settings${path}`, {
      ...init,
      headers: { cookie, "content-type": "application/json", ...init.headers },
    });
  return { app, call, store, llm, settings, userId, tick: (ms: number) => (clock += ms) };
}

describe("settings routes: auth", () => {
  it("require a session", async () => {
    const { app } = await setup();
    expect((await app.request("/api/settings/ai-functions")).status).toBe(401);
    expect((await app.request("/api/settings/ai-key")).status).toBe(401);
  });
});

describe("settings routes: Ollama API key", () => {
  it("reports not configured, then stores the key encrypted and exposes only last4", async () => {
    const { call, store, userId } = await setup();

    expect(AiKeyStatus.parse(await (await call("/ai-key")).json())).toEqual({
      configured: false,
      source: null,
      last4: null,
    });

    const put = await call("/ai-key", { method: "PUT", body: JSON.stringify({ apiKey: KEY }) });
    const putText = await put.text();

    expect(put.status).toBe(200);
    expect(JSON.parse(putText)).toEqual({ configured: true, source: "db", last4: "WXYZ" });
    expect(putText).not.toContain(KEY);
    const stored = store.secrets.get(memoryKey(userId, "ollama_api_key"));
    expect(stored?.last4).toBe("WXYZ");
    expect(JSON.stringify(stored)).not.toContain(KEY);

    const get = await call("/ai-key");
    expect(await get.text()).not.toContain(KEY);
  });

  it("deletes the stored key, leaving the provider without a key", async () => {
    const { call, settings, userId } = await setup();

    await call("/ai-key", { method: "PUT", body: JSON.stringify({ apiKey: KEY }) });
    expect(await (await call("/ai-key")).json()).toMatchObject({ source: "db", last4: "WXYZ" });

    const del = await call("/ai-key", { method: "DELETE" });
    expect(await del.json()).toEqual({ configured: false, source: null, last4: null });
    expect(await settings.getApiKey(userId)).toBeUndefined();
  });

  it("resolves the stored key for the LLM client", async () => {
    const keys: Array<string | undefined> = [];
    const { call, settings, userId } = await setup({
      createClient: (getApiKey) => ({
        ...createFakeLlm(fakeOptions),
        listModels: async () => {
          keys.push(await getApiKey());
          return [];
        },
      }),
    });

    await settings.clientFor(userId, "ollama").listModels();
    await call("/ai-key", { method: "PUT", body: JSON.stringify({ apiKey: KEY }) });
    await settings.clientFor(userId, "ollama").listModels();

    expect(keys).toEqual([undefined, KEY]);
  });

  it("reports a stored key that APP_SECRET can no longer decrypt", async () => {
    const { call, store, settings, userId } = await setup();
    store.secrets.set(memoryKey(userId, "ollama_api_key"), {
      ...encryptSecret(KEY, "cd".repeat(32)),
      last4: "WXYZ",
    });

    expect(AiKeyStatus.parse(await (await call("/ai-key")).json())).toEqual({
      configured: false,
      source: "db",
      last4: "WXYZ",
      error: "undecryptable",
    });
    expect(await settings.getApiKey(userId)).toBeUndefined();
  });

  it("rejects an invalid key payload", async () => {
    const { call } = await setup();
    const res = await call("/ai-key", { method: "PUT", body: JSON.stringify({ apiKey: "a b" }) });
    expect(res.status).toBe(400);
  });

  it("tests the key by listing models", async () => {
    const { call } = await setup();
    const res = await call("/ai-key/test", { method: "POST" });
    expect(await res.json()).toEqual({ ok: true, modelCount: 2 });
  });

  it("reports a rejected key from the test endpoint", async () => {
    const { call } = await setup(
      {},
      createFakeLlm({ failWith: new LlmError("invalid_key", "Ollama rejected the API key") }),
    );
    const res = await call("/ai-key/test", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: false,
      error: "invalid_key",
      message: "Ollama rejected the API key",
    });
  });

  it("never sends the key to Ollama when none is configured", async () => {
    const { call } = await setup({
      createClient: (getApiKey) =>
        createOllamaClient({
          baseUrl: "https://ollama.example",
          getApiKey,
          fetch: async () => {
            throw new Error("must not be called");
          },
        }),
    });
    const res = await call("/models");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "not_configured" });
  });
});

describe("settings routes: models", () => {
  it("lists models and caches them for 10 minutes", async () => {
    const { call, llm, tick } = await setup();

    const first = ModelsResponse.parse(await (await call("/models")).json());
    await call("/models");
    tick(10 * 60_000);
    await call("/models");

    expect(first.models.map((m) => m.name)).toEqual(["gemma4:31b", "gpt-oss:120b"]);
    expect(llm.calls.filter((c) => c.method === "listModels")).toHaveLength(2);
  });

  it("returns model capabilities with thinking values", async () => {
    const { call } = await setup();
    const res = await call(`/models/${encodeURIComponent("gpt-oss:120b")}/capabilities`);
    expect(ModelCapabilities.parse(await res.json())).toEqual({
      model: "gpt-oss:120b",
      capabilities: ["completion", "tools", "thinking"],
      thinking: { values: ["low", "medium", "high"], default: "medium" },
    });
  });

  it("maps upstream failures to error responses", async () => {
    const { call } = await setup(
      {},
      createFakeLlm({ failWith: new LlmError("rate_limited", "slow") }),
    );
    const res = await call("/models");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited", message: "slow" });
  });
});

describe("settings routes: AI functions", () => {
  it("lists every function with code defaults", async () => {
    const { call } = await setup();
    const body = AiFunctionsResponse.parse(await (await call("/ai-functions")).json());

    expect(body.functions).toHaveLength(13);
    expect(body.functions.find((f) => f.id === "review_writing")).toEqual({
      id: "review_writing",
      tier: "quality",
      model: "deepseek-v4-pro",
      think: "high",
      defaultModel: "deepseek-v4-pro",
      defaultThink: "high",
      isDefault: true,
    });
  });

  it("updates one function after validating think against the model", async () => {
    const { call } = await setup();

    const res = await call("/ai-functions/check_answer", {
      method: "PUT",
      body: JSON.stringify({ model: "gpt-oss:120b", think: "high" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: "check_answer",
      model: "gpt-oss:120b",
      think: "high",
      isDefault: false,
    });
    const list = AiFunctionsResponse.parse(await (await call("/ai-functions")).json());
    expect(list.functions.find((f) => f.id === "check_answer")?.model).toBe("gpt-oss:120b");
  });

  it("rejects an effort the model does not support", async () => {
    const { call } = await setup();
    const res = await call("/ai-functions/check_answer", {
      method: "PUT",
      body: JSON.stringify({ model: "gemma4:31b", think: "high" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "unsupported_think" });
  });

  it("rejects unknown models and unknown functions", async () => {
    const { call } = await setup();
    const unknownModel = await call("/ai-functions/check_answer", {
      method: "PUT",
      body: JSON.stringify({ model: "nope:1b", think: null }),
    });
    expect(unknownModel.status).toBe(400);
    expect(await unknownModel.json()).toMatchObject({ error: "unknown_model" });

    const unknownFn = await call("/ai-functions/do_magic", {
      method: "PUT",
      body: JSON.stringify({ model: "gemma4:31b", think: null }),
    });
    expect(unknownFn.status).toBe(404);
  });

  it("accepts the change without validation when capabilities are unavailable", async () => {
    const llm = createFakeLlm(fakeOptions);
    llm.modelCapabilities = async () => {
      throw new LlmError("upstream", "down");
    };
    const { call } = await setup({}, llm);
    const res = await call("/ai-functions/gloss_word", {
      method: "PUT",
      body: JSON.stringify({ model: "gemma4:31b", think: "medium" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("getLlmForFunction", () => {
  it("returns the configured model and the think value normalized for it", async () => {
    const { call, settings, llm, userId } = await setup();

    // Default for check_answer is gemma4:31b + "low"; gemma4 only supports on/off.
    expect(await settings.getLlmForFunction(userId, "check_answer")).toEqual({
      client: llm,
      model: "gemma4:31b",
      think: false,
    });

    await call("/ai-functions/check_answer", {
      method: "PUT",
      body: JSON.stringify({ model: "gpt-oss:120b", think: "medium" }),
    });
    const next = await settings.getLlmForFunction(userId, "check_answer");
    expect([next.model, next.think]).toEqual(["gpt-oss:120b", "medium"]);
  });

  it("keeps the stored think when capabilities cannot be read", async () => {
    const llm = createFakeLlm({ ...fakeOptions, capabilities: {} });
    llm.modelCapabilities = async () => {
      throw new LlmError("network", "offline");
    };
    const { settings, userId } = await setup({}, llm);
    expect((await settings.getLlmForFunction(userId, "review_writing")).think).toBe("high");
  });

  it("propagates unexpected (non-LLM) errors instead of swallowing them", async () => {
    const llm = createFakeLlm(fakeOptions);
    llm.modelCapabilities = async () => {
      throw new TypeError("bug");
    };
    const { settings, userId } = await setup({}, llm);

    await expect(settings.getLlmForFunction(userId, "review_writing")).rejects.toThrow(TypeError);
    await expect(
      settings.updateAiFunction(userId, "gloss_word", { model: "gemma4:31b", think: null }),
    ).rejects.toThrow(TypeError);
  });
});

describe("capability probe failures", () => {
  function failingLlm(error: LlmError) {
    const llm = createFakeLlm(fakeOptions);
    let probes = 0;
    llm.modelCapabilities = async () => {
      probes += 1;
      throw error;
    };
    return { llm, probes: () => probes };
  }

  it("are cached for 60 s so every call does not re-probe", async () => {
    const { llm, probes } = failingLlm(new LlmError("upstream", "down"));
    const { settings, tick, userId } = await setup({}, llm);

    await settings.getLlmForFunction(userId, "review_writing");
    await settings.getLlmForFunction(userId, "review_writing");
    expect(probes()).toBe(1);

    tick(59_999);
    await settings.getLlmForFunction(userId, "review_writing");
    expect(probes()).toBe(1);

    tick(1);
    await settings.getLlmForFunction(userId, "review_writing");
    expect(probes()).toBe(2);
  });

  it("honor a longer Retry-After when rate limited", async () => {
    const { llm, probes } = failingLlm(
      new LlmError("rate_limited", "slow down", { retryAfterSeconds: 120 }),
    );
    const { settings, tick, userId } = await setup({}, llm);

    await settings.getLlmForFunction(userId, "review_writing");
    tick(60_000);
    await settings.getLlmForFunction(userId, "review_writing");
    expect(probes()).toBe(1);

    tick(60_000);
    await settings.getLlmForFunction(userId, "review_writing");
    expect(probes()).toBe(2);
  });

  it("are forgotten when the key changes", async () => {
    const { llm, probes } = failingLlm(new LlmError("not_configured", "no key"));
    const { settings, userId } = await setup({}, llm);

    await settings.getLlmForFunction(userId, "review_writing");
    await settings.setKey(userId, KEY);
    await settings.getLlmForFunction(userId, "review_writing");

    expect(probes()).toBe(2);
  });
});

describe("settings routes: AI providers", () => {
  const ORKEY = "sk-or-v1-secret-ABCD";
  const openrouterLlm = () =>
    createFakeLlm({
      models: [
        {
          name: "openai/gpt-oss-120b",
          contextLength: 131072,
          pricing: { inputPerMTok: 0.15, outputPerMTok: 0.6 },
        },
      ],
      capabilities: {
        "openai/gpt-oss-120b": {
          capabilities: ["completion", "tools", "thinking"],
          thinking: { values: ["high", "medium", "low"], default: "medium" },
        },
      },
    });

  async function withOpenRouter() {
    const orLlm = openrouterLlm();
    const ctx = await setup({ openrouter: { createClient: () => orLlm } });
    return { ...ctx, orLlm };
  }

  it("defaults to Ollama and lists the available providers", async () => {
    const { call } = await withOpenRouter();
    expect(await (await call("/ai-provider")).json()).toEqual({
      provider: "ollama",
      available: ["ollama", "openrouter"],
    });
  });

  it("defaults to OpenRouter once the user stored only its key", async () => {
    const { call } = await withOpenRouter();
    await call("/ai-key?provider=openrouter", {
      method: "PUT",
      body: JSON.stringify({ apiKey: ORKEY }),
    });
    expect(await (await call("/ai-provider")).json()).toMatchObject({ provider: "openrouter" });
  });

  it("rejects an unknown or unavailable provider", async () => {
    const { call } = await setup();
    const put = (provider: string) =>
      call("/ai-provider", { method: "PUT", body: JSON.stringify({ provider }) });
    expect((await put("acme")).status).toBe(400);
    expect(await (await put("openrouter")).json()).toMatchObject({ error: "unknown_provider" });
    expect((await call("/ai-key?provider=acme")).status).toBe(400);
  });

  it("keeps one encrypted key per provider", async () => {
    const { call, store, userId } = await withOpenRouter();
    await call("/ai-key", { method: "PUT", body: JSON.stringify({ apiKey: KEY }) });
    const put = await call("/ai-key?provider=openrouter", {
      method: "PUT",
      body: JSON.stringify({ apiKey: ORKEY }),
    });
    expect(await put.json()).toEqual({ configured: true, source: "db", last4: "ABCD" });
    const sealed = store.secrets.get(memoryKey(userId, "openrouter_api_key"));
    expect(JSON.stringify(sealed)).not.toContain(ORKEY);
    expect(await (await call("/ai-key?provider=ollama")).json()).toMatchObject({ last4: "WXYZ" });

    await call("/ai-key?provider=openrouter", { method: "DELETE" });
    expect(await (await call("/ai-key?provider=openrouter")).json()).toMatchObject({
      configured: false,
    });
    expect(await (await call("/ai-key?provider=ollama")).json()).toMatchObject({ last4: "WXYZ" });
  });

  it("switching provider keeps each provider's function config and changes the resolved client", async () => {
    const { call, settings, userId, llm, orLlm } = await withOpenRouter();
    await call("/ai-functions/check_answer", {
      method: "PUT",
      body: JSON.stringify({ model: "gpt-oss:120b", think: "high" }),
    });

    const switched = await call("/ai-provider", {
      method: "PUT",
      body: JSON.stringify({ provider: "openrouter" }),
    });
    expect(await switched.json()).toMatchObject({ provider: "openrouter" });

    const orFunctions = AiFunctionsResponse.parse(await (await call("/ai-functions")).json());
    expect(orFunctions.functions.find((f) => f.id === "check_answer")).toMatchObject({
      model: "google/gemma-4-31b-it",
      isDefault: true,
    });
    await call("/ai-functions/check_answer", {
      method: "PUT",
      body: JSON.stringify({ model: "openai/gpt-oss-120b", think: "low" }),
    });
    const resolved = await settings.getLlmForFunction(userId, "check_answer");
    expect(resolved).toMatchObject({ model: "openai/gpt-oss-120b", think: "low" });
    expect(resolved.client).toBe(orLlm);

    const models = ModelsResponse.parse(await (await call("/models")).json());
    expect(models.models[0]?.pricing).toEqual({ inputPerMTok: 0.15, outputPerMTok: 0.6 });
    const caps = await call(`/models/${encodeURIComponent("openai/gpt-oss-120b")}/capabilities`);
    expect(ModelCapabilities.parse(await caps.json()).thinking?.values).toEqual([
      "high",
      "medium",
      "low",
    ]);

    await call("/ai-provider", { method: "PUT", body: JSON.stringify({ provider: "ollama" }) });
    const back = await settings.getLlmForFunction(userId, "check_answer");
    expect(back).toMatchObject({ model: "gpt-oss:120b", think: "high" });
    expect(back.client).toBe(llm);
    const orList = AiFunctionsResponse.parse(
      await (await call("/ai-functions?provider=openrouter")).json(),
    );
    expect(orList.functions.find((f) => f.id === "check_answer")?.model).toBe(
      "openai/gpt-oss-120b",
    );
  });

  it("tests an OpenRouter key with verifyKey before listing models", async () => {
    const orLlm = openrouterLlm();
    const verify = { calls: 0 };
    const { call } = await setup({
      openrouter: {
        createClient: () => ({
          ...orLlm,
          verifyKey: async () => {
            verify.calls += 1;
            throw new LlmError("invalid_key", "OpenRouter rejected the API key (HTTP 401)");
          },
        }),
      },
    });
    const res = await call("/ai-key/test?provider=openrouter", { method: "POST" });
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid_key" });
    expect(verify.calls).toBe(1);
  });

  it("answers not_configured for the active provider without a key", async () => {
    const { call } = await setup({
      openrouter: {
        createClient: () => ({
          ...openrouterLlm(),
          listModels: async () => {
            throw new LlmError("not_configured", "No OpenRouter API key is configured");
          },
        }),
      },
    });
    await call("/ai-provider", { method: "PUT", body: JSON.stringify({ provider: "openrouter" }) });
    const res = await call("/models");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "not_configured" });
  });

  it("maps insufficient credits to 402", async () => {
    const { call } = await setup(
      {},
      createFakeLlm({ failWith: new LlmError("payment_required", "no credits") }),
    );
    expect((await call("/models")).status).toBe(402);
  });
});
