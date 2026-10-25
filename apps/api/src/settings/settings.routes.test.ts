import {
  AiFunctionsResponse,
  AiKeyStatus,
  ModelCapabilities,
  ModelsResponse,
} from "@english-course/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { createAuth } from "../auth/auth.ts";
import { LlmError } from "../shared/llm/errors.ts";
import { createFakeLlm, type FakeLlmOptions } from "../shared/llm/fake.ts";
import { createOllamaClient } from "../shared/llm/ollama.ts";
import { createSettings, type SettingsOptions } from "./settings.service.ts";
import { createMemorySettingsStore } from "./settings.store.ts";

const APP_SECRET = "ab".repeat(32);
const PASSWORD = "pw";
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
  const auth = createAuth({ password: PASSWORD, appSecret: APP_SECRET });
  const app = createApp({ pingDb: async () => true, auth, settings });
  const loginRes = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
  const call = (path: string, init: RequestInit = {}) =>
    app.request(`/api/settings${path}`, {
      ...init,
      headers: { cookie, "content-type": "application/json", ...init.headers },
    });
  return { app, call, store, llm, settings, tick: (ms: number) => (clock += ms) };
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
    const { call, store } = await setup();

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
    const stored = store.secrets.get("ollama_api_key");
    expect(stored?.last4).toBe("WXYZ");
    expect(JSON.stringify(stored)).not.toContain(KEY);

    const get = await call("/ai-key");
    expect(await get.text()).not.toContain(KEY);
  });

  it("falls back to the env key and lets the stored key override it", async () => {
    const { call } = await setup({ envApiKey: "env-key-0000-1234" });

    expect(await (await call("/ai-key")).json()).toEqual({
      configured: true,
      source: "env",
      last4: "1234",
    });

    await call("/ai-key", { method: "PUT", body: JSON.stringify({ apiKey: KEY }) });
    expect(await (await call("/ai-key")).json()).toMatchObject({ source: "db", last4: "WXYZ" });

    const del = await call("/ai-key", { method: "DELETE" });
    expect(await del.json()).toEqual({ configured: true, source: "env", last4: "1234" });
  });

  it("resolves the stored key for the LLM client (db first, then env)", async () => {
    const keys: Array<string | undefined> = [];
    const { call, settings } = await setup({
      envApiKey: "env-key-0000-1234",
      createClient: (getApiKey) => ({
        ...createFakeLlm(fakeOptions),
        listModels: async () => {
          keys.push(await getApiKey());
          return [];
        },
      }),
    });

    await settings.client.listModels();
    await call("/ai-key", { method: "PUT", body: JSON.stringify({ apiKey: KEY }) });
    await settings.client.listModels();

    expect(keys).toEqual(["env-key-0000-1234", KEY]);
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
    const { call, settings, llm } = await setup();

    // Default for check_answer is gemma4:31b + "low"; gemma4 only supports on/off.
    expect(await settings.getLlmForFunction("check_answer")).toEqual({
      client: llm,
      model: "gemma4:31b",
      think: false,
    });

    await call("/ai-functions/check_answer", {
      method: "PUT",
      body: JSON.stringify({ model: "gpt-oss:120b", think: "medium" }),
    });
    const next = await settings.getLlmForFunction("check_answer");
    expect([next.model, next.think]).toEqual(["gpt-oss:120b", "medium"]);
  });

  it("keeps the stored think when capabilities cannot be read", async () => {
    const llm = createFakeLlm({ ...fakeOptions, capabilities: {} });
    llm.modelCapabilities = async () => {
      throw new LlmError("network", "offline");
    };
    const { settings } = await setup({}, llm);
    expect((await settings.getLlmForFunction("review_writing")).think).toBe("high");
  });
});
