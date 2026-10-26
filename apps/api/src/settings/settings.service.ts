import {
  type AiFunctionConfig,
  AiFunctionId,
  type AiKeyStatus,
  type AiKeyTestResult,
  type ModelCapabilities,
  type ModelSummary,
  ThinkValue,
  type UpdateAiFunctionRequest,
} from "@english-course/shared";
import { z } from "zod";
import { isLlmError, type LlmError } from "../shared/llm/errors.ts";
import type { LlmClient } from "../shared/llm/types.ts";
import {
  AI_FUNCTIONS,
  type AiFunctionSetting,
  defaultFor,
  isThinkSupported,
  normalizeThink,
} from "./ai-functions.ts";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import type { SettingsStore } from "./settings.store.ts";

const API_KEY_SECRET = "ollama_api_key";
/** Key, model list and capabilities stay cached this long (the web mirrors it as staleTime). */
const CACHE_TTL_MS = 10 * 60_000;
/** A failed capability probe is not retried for this long (longer when Retry-After says so). */
const CAPABILITY_FAILURE_TTL_MS = 60_000;
const settingKey = (id: AiFunctionId) => `ai_function:${id}`;
const StoredAiFunction = z.object({ model: z.string().min(1), think: ThinkValue });

export type SettingsOptions = {
  store: SettingsStore;
  appSecret: string;
  /** OLLAMA_API_KEY from env; used only when no key is stored. */
  envApiKey?: string;
  /** Builds the LLM client; it must resolve the key through `getApiKey` on every call. */
  createClient: (getApiKey: () => Promise<string | undefined>) => LlmClient;
  now?: () => number;
  cacheTtlMs?: number;
};

export class SettingsError extends Error {
  override readonly name = "SettingsError";
  readonly code: "unknown_function" | "unknown_model" | "unsupported_think";

  constructor(code: SettingsError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type LlmForFunction = { client: LlmClient; model: string; think: ThinkValue };

type Cached<T> = { value: T; at: number };

export function createSettings(options: SettingsOptions) {
  const { store, appSecret } = options;
  const now = options.now ?? Date.now;
  const ttl = options.cacheTtlMs ?? CACHE_TTL_MS;
  const fresh = <T>(entry: Cached<T> | undefined, maxAge = ttl): entry is Cached<T> =>
    entry !== undefined && now() - entry.at < maxAge;

  let resolvedKey: Cached<string | undefined> | undefined;
  let modelsCache: Cached<ModelSummary[]> | undefined;
  const capabilitiesCache = new Map<string, Cached<ModelCapabilities>>();
  const capabilityFailures = new Map<string, Cached<LlmError> & { ttlMs: number }>();

  const clearCaches = () => {
    resolvedKey = undefined;
    modelsCache = undefined;
    capabilitiesCache.clear();
    capabilityFailures.clear();
  };

  type StoredKey =
    | { state: "none" }
    | { state: "ok"; key: string; last4: string }
    | { state: "undecryptable"; last4: string };

  async function readStoredKey(): Promise<StoredKey> {
    const sealed = await store.getSecret(API_KEY_SECRET);
    if (!sealed) return { state: "none" };
    try {
      return { state: "ok", key: decryptSecret(sealed, appSecret), last4: sealed.last4 };
    } catch {
      console.warn("settings: the stored Ollama API key cannot be decrypted (APP_SECRET changed?)");
      return { state: "undecryptable", last4: sealed.last4 };
    }
  }

  async function getApiKey(): Promise<string | undefined> {
    if (!fresh(resolvedKey)) {
      const stored = await readStoredKey();
      resolvedKey = { value: stored.state === "ok" ? stored.key : options.envApiKey, at: now() };
    }
    return resolvedKey.value;
  }

  const client = options.createClient(getApiKey);

  async function keyStatus(): Promise<AiKeyStatus> {
    const stored = await readStoredKey();
    if (stored.state === "ok") return { configured: true, source: "db", last4: stored.last4 };
    if (stored.state === "undecryptable") {
      // Requests fall back to the env key meanwhile, so `configured` reflects that.
      return {
        configured: options.envApiKey !== undefined,
        source: "db",
        last4: stored.last4,
        error: "undecryptable",
      };
    }
    if (options.envApiKey) {
      return { configured: true, source: "env", last4: options.envApiKey.slice(-4) };
    }
    return { configured: false, source: null, last4: null };
  }

  async function listModels(): Promise<ModelSummary[]> {
    if (!fresh(modelsCache)) modelsCache = { value: await client.listModels(), at: now() };
    return modelsCache.value;
  }

  /** Probes `/api/show` once per TTL; LLM failures are negatively cached so callers skip it. */
  async function capabilities(model: string): Promise<ModelCapabilities> {
    const cached = capabilitiesCache.get(model);
    if (fresh(cached)) return cached.value;
    const failure = capabilityFailures.get(model);
    if (failure && fresh(failure, failure.ttlMs)) throw failure.value;
    try {
      const value = await client.modelCapabilities(model);
      capabilitiesCache.set(model, { value, at: now() });
      capabilityFailures.delete(model);
      return value;
    } catch (error) {
      if (isLlmError(error) && error.code !== "aborted") {
        const retryAfterMs = (error.retryAfterSeconds ?? 0) * 1000;
        capabilityFailures.set(model, {
          value: error,
          at: now(),
          ttlMs: Math.max(CAPABILITY_FAILURE_TTL_MS, retryAfterMs),
        });
      }
      throw error;
    }
  }

  async function readAiFunction(id: AiFunctionId): Promise<AiFunctionSetting | undefined> {
    const parsed = StoredAiFunction.safeParse(await store.getSetting(settingKey(id)));
    return parsed.success ? parsed.data : undefined;
  }

  async function describeAiFunction(id: AiFunctionId): Promise<AiFunctionConfig> {
    const defaults = defaultFor(id);
    const stored = await readAiFunction(id);
    const current = stored ?? defaults;
    return {
      id,
      tier: AI_FUNCTIONS[id].tier,
      model: current.model,
      think: current.think,
      defaultModel: defaults.model,
      defaultThink: defaults.think,
      isDefault: stored === undefined,
    };
  }

  return {
    client,
    /**
     * Raw Ollama key for backend-only Ollama endpoints (web_search/web_fetch). Never send it to
     * the browser and never log it.
     */
    getApiKey,
    keyStatus,
    listModels,
    capabilities,

    async setKey(apiKey: string): Promise<AiKeyStatus> {
      await store.putSecret(API_KEY_SECRET, {
        ...encryptSecret(apiKey, appSecret),
        last4: apiKey.slice(-4),
      });
      clearCaches();
      return keyStatus();
    },

    async deleteKey(): Promise<AiKeyStatus> {
      await store.deleteSecret(API_KEY_SECRET);
      clearCaches();
      return keyStatus();
    },

    async testKey(): Promise<AiKeyTestResult> {
      try {
        modelsCache = undefined;
        return { ok: true, modelCount: (await listModels()).length };
      } catch (error) {
        if (!isLlmError(error)) throw error;
        return { ok: false, error: error.code, message: error.message };
      }
    },

    listAiFunctions: () => Promise.all(AiFunctionId.options.map(describeAiFunction)),

    async updateAiFunction(
      rawId: string,
      input: UpdateAiFunctionRequest,
    ): Promise<AiFunctionConfig> {
      const id = AiFunctionId.safeParse(rawId);
      if (!id.success)
        throw new SettingsError("unknown_function", `Unknown AI function "${rawId}"`);

      let caps: ModelCapabilities | undefined;
      try {
        caps = await capabilities(input.model);
      } catch (error) {
        if (!isLlmError(error)) throw error;
        if (error.code === "not_found") {
          throw new SettingsError("unknown_model", `Model "${input.model}" was not found`);
        }
        // Capabilities unknown (offline, no key, rate limited): accept without validation.
      }
      if (caps && !isThinkSupported(input.think, caps.thinking)) {
        throw new SettingsError(
          "unsupported_think",
          `Effort ${JSON.stringify(input.think)} is not supported by ${input.model}`,
        );
      }

      await store.putSetting(settingKey(id.data), { model: input.model, think: input.think });
      return describeAiFunction(id.data);
    },

    /** Model + effort for one AI function, read fresh so changes apply on the next call. */
    async getLlmForFunction(id: AiFunctionId): Promise<LlmForFunction> {
      const { model, think } = (await readAiFunction(id)) ?? defaultFor(id);
      try {
        return {
          client,
          model,
          think: normalizeThink(think, (await capabilities(model)).thinking),
        };
      } catch (error) {
        // Capabilities unknown (no key, offline, rate limited): keep the stored effort.
        if (!isLlmError(error)) throw error;
        return { client, model, think };
      }
    },
  };
}

export type Settings = ReturnType<typeof createSettings>;
