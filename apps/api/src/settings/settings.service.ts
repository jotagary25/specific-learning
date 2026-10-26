import {
  type AiFunctionConfig,
  AiFunctionId,
  type AiKeyStatus,
  type AiKeyTestResult,
  type AiProviderId,
  type AiProviderResponse,
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

/** Secret holding each provider's key (the Ollama name predates other providers). */
const API_KEY_SECRET: Record<AiProviderId, string> = {
  ollama: "ollama_api_key",
  openrouter: "openrouter_api_key",
};
const PROVIDER_LABEL: Record<AiProviderId, string> = { ollama: "Ollama", openrouter: "OpenRouter" };
const PROVIDER_SETTING = "ai.provider";
/** Key, model list and capabilities stay cached this long (the web mirrors it as staleTime). */
const CACHE_TTL_MS = 10 * 60_000;
/** A failed capability probe is not retried for this long (longer when Retry-After says so). */
const CAPABILITY_FAILURE_TTL_MS = 60_000;
/** Per-provider function config; Ollama keeps its original key so existing choices survive. */
const settingKey = (provider: AiProviderId, id: AiFunctionId) =>
  provider === "ollama" ? `ai_function:${id}` : `ai_function:${provider}:${id}`;
const StoredAiFunction = z.object({ model: z.string().min(1), think: ThinkValue });

/**
 * Builds one user's client for a provider; it must resolve the key through `getApiKey` on every
 * call. Called once per user and provider, then cached.
 */
export type ClientFactory = (getApiKey: () => Promise<string | undefined>) => LlmClient;
export type ProviderConfig = { envApiKey?: string; createClient: ClientFactory };

export type SettingsOptions = {
  store: SettingsStore;
  appSecret: string;
  /** Ollama: OLLAMA_API_KEY from env, used only when no key is stored. */
  envApiKey?: string;
  /** Ollama client factory. */
  createClient: ClientFactory;
  /** OpenRouter; without it the provider cannot be selected. */
  openrouter?: ProviderConfig;
  now?: () => number;
  cacheTtlMs?: number;
};

export class SettingsError extends Error {
  override readonly name = "SettingsError";
  readonly code: "unknown_function" | "unknown_model" | "unsupported_think" | "unknown_provider";

  constructor(code: SettingsError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type LlmForFunction = { client: LlmClient; model: string; think: ThinkValue };

type Cached<T> = { value: T; at: number };

/** Per-user cached state: the resolved key, the client bound to it and model metadata. */
type UserState = {
  resolvedKey?: Cached<string | undefined>;
  modelsCache?: Cached<ModelSummary[]>;
  client?: LlmClient;
  capabilitiesCache: Map<string, Cached<ModelCapabilities>>;
  capabilityFailures: Map<string, Cached<LlmError> & { ttlMs: number }>;
};

/**
 * Per-user AI settings: each user picks an active provider and has their own key per provider
 * (env keys as fallback) and their own model/effort per AI function and provider. Every method
 * takes the user id first; an omitted provider means the user's active one.
 */
export function createSettings(options: SettingsOptions) {
  const { store, appSecret } = options;
  const providers: Partial<Record<AiProviderId, ProviderConfig>> = {
    ollama: { envApiKey: options.envApiKey, createClient: options.createClient },
    ...(options.openrouter ? { openrouter: options.openrouter } : {}),
  };
  const available = (Object.keys(providers) as AiProviderId[]).sort();
  /** Users who never chose: the first provider with an env key, else Ollama. */
  const defaultProvider: AiProviderId =
    !options.envApiKey && options.openrouter?.envApiKey ? "openrouter" : "ollama";
  const configOf = (provider: AiProviderId): ProviderConfig => {
    const config = providers[provider];
    if (!config)
      throw new SettingsError("unknown_provider", `Provider "${provider}" is not available`);
    return config;
  };

  async function activeProvider(userId: string): Promise<AiProviderId> {
    const stored = await store.getSetting(userId, PROVIDER_SETTING);
    return typeof stored === "string" && stored in providers
      ? (stored as AiProviderId)
      : defaultProvider;
  }
  const pick = async (userId: string, provider?: AiProviderId) =>
    provider ?? (await activeProvider(userId));
  const now = options.now ?? Date.now;
  const ttl = options.cacheTtlMs ?? CACHE_TTL_MS;
  const fresh = <T>(entry: Cached<T> | undefined, maxAge = ttl): entry is Cached<T> =>
    entry !== undefined && now() - entry.at < maxAge;

  const states = new Map<string, UserState>();
  const stateOf = (userId: string, provider: AiProviderId): UserState => {
    const key = `${userId}/${provider}`;
    let state = states.get(key);
    if (!state) {
      state = { capabilitiesCache: new Map(), capabilityFailures: new Map() };
      states.set(key, state);
    }
    return state;
  };

  const clearCaches = (userId: string, provider: AiProviderId) => {
    const state = stateOf(userId, provider);
    state.resolvedKey = undefined;
    state.modelsCache = undefined;
    state.capabilitiesCache.clear();
    state.capabilityFailures.clear();
  };

  type StoredKey =
    | { state: "none" }
    | { state: "ok"; key: string; last4: string }
    | { state: "undecryptable"; last4: string };

  async function readStoredKey(userId: string, provider: AiProviderId): Promise<StoredKey> {
    const sealed = await store.getSecret(userId, API_KEY_SECRET[provider]);
    if (!sealed) return { state: "none" };
    try {
      return { state: "ok", key: decryptSecret(sealed, appSecret), last4: sealed.last4 };
    } catch {
      console.warn(
        `settings: the stored ${PROVIDER_LABEL[provider]} API key cannot be decrypted (APP_SECRET changed?)`,
      );
      return { state: "undecryptable", last4: sealed.last4 };
    }
  }

  /** Raw key (stored, else env) for one provider. Never send it to the browser or log it. */
  async function getApiKey(userId: string, provider?: AiProviderId): Promise<string | undefined> {
    const id = await pick(userId, provider);
    const state = stateOf(userId, id);
    if (!fresh(state.resolvedKey)) {
      const stored = await readStoredKey(userId, id);
      state.resolvedKey = {
        value: stored.state === "ok" ? stored.key : providers[id]?.envApiKey,
        at: now(),
      };
    }
    return state.resolvedKey.value;
  }

  /** The user's client for a provider, bound to their key (resolved on every call). */
  function clientFor(userId: string, provider: AiProviderId): LlmClient {
    const state = stateOf(userId, provider);
    state.client ??= configOf(provider).createClient(() => getApiKey(userId, provider));
    return state.client;
  }

  async function keyStatus(userId: string, provider?: AiProviderId): Promise<AiKeyStatus> {
    const id = await pick(userId, provider);
    const envApiKey = providers[id]?.envApiKey;
    const stored = await readStoredKey(userId, id);
    if (stored.state === "ok") return { configured: true, source: "db", last4: stored.last4 };
    if (stored.state === "undecryptable") {
      // Requests fall back to the env key meanwhile, so `configured` reflects that.
      return {
        configured: envApiKey !== undefined,
        source: "db",
        last4: stored.last4,
        error: "undecryptable",
      };
    }
    if (envApiKey) return { configured: true, source: "env", last4: envApiKey.slice(-4) };
    return { configured: false, source: null, last4: null };
  }

  async function listModels(userId: string, provider?: AiProviderId): Promise<ModelSummary[]> {
    const id = await pick(userId, provider);
    const state = stateOf(userId, id);
    if (!fresh(state.modelsCache)) {
      state.modelsCache = { value: await clientFor(userId, id).listModels(), at: now() };
    }
    return state.modelsCache.value;
  }

  /** Probes the model once per TTL; LLM failures are negatively cached so callers skip it. */
  async function capabilities(
    userId: string,
    model: string,
    provider?: AiProviderId,
  ): Promise<ModelCapabilities> {
    const id = await pick(userId, provider);
    const { capabilitiesCache, capabilityFailures } = stateOf(userId, id);
    const cached = capabilitiesCache.get(model);
    if (fresh(cached)) return cached.value;
    const failure = capabilityFailures.get(model);
    if (failure && fresh(failure, failure.ttlMs)) throw failure.value;
    try {
      const value = await clientFor(userId, id).modelCapabilities(model);
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

  async function readAiFunction(
    userId: string,
    provider: AiProviderId,
    id: AiFunctionId,
  ): Promise<AiFunctionSetting | undefined> {
    const raw = await store.getSetting(userId, settingKey(provider, id));
    const parsed = StoredAiFunction.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  }

  async function describeAiFunction(
    userId: string,
    provider: AiProviderId,
    id: AiFunctionId,
  ): Promise<AiFunctionConfig> {
    const defaults = defaultFor(id, provider);
    const stored = await readAiFunction(userId, provider, id);
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

  async function providerView(userId: string): Promise<AiProviderResponse> {
    return { provider: await activeProvider(userId), available };
  }

  return {
    clientFor,
    activeProvider,
    getApiKey,
    keyStatus,
    listModels,
    capabilities,
    providerView,

    async setProvider(userId: string, provider: AiProviderId): Promise<AiProviderResponse> {
      configOf(provider);
      await store.putSetting(userId, PROVIDER_SETTING, provider);
      return providerView(userId);
    },

    async setKey(userId: string, apiKey: string, provider?: AiProviderId): Promise<AiKeyStatus> {
      const id = await pick(userId, provider);
      configOf(id);
      await store.putSecret(userId, API_KEY_SECRET[id], {
        ...encryptSecret(apiKey, appSecret),
        last4: apiKey.slice(-4),
      });
      clearCaches(userId, id);
      return keyStatus(userId, id);
    },

    async deleteKey(userId: string, provider?: AiProviderId): Promise<AiKeyStatus> {
      const id = await pick(userId, provider);
      await store.deleteSecret(userId, API_KEY_SECRET[id]);
      clearCaches(userId, id);
      return keyStatus(userId, id);
    },

    async testKey(userId: string, provider?: AiProviderId): Promise<AiKeyTestResult> {
      const id = await pick(userId, provider);
      try {
        stateOf(userId, id).modelsCache = undefined;
        // Listing OpenRouter models needs no valid key, so it checks the key itself first.
        await clientFor(userId, id).verifyKey?.();
        return { ok: true, modelCount: (await listModels(userId, id)).length };
      } catch (error) {
        if (!isLlmError(error)) throw error;
        return { ok: false, error: error.code, message: error.message };
      }
    },

    async listAiFunctions(userId: string, provider?: AiProviderId) {
      const id = await pick(userId, provider);
      return Promise.all(AiFunctionId.options.map((fn) => describeAiFunction(userId, id, fn)));
    },

    async updateAiFunction(
      userId: string,
      rawId: string,
      input: UpdateAiFunctionRequest,
      provider?: AiProviderId,
    ): Promise<AiFunctionConfig> {
      const id = AiFunctionId.safeParse(rawId);
      if (!id.success)
        throw new SettingsError("unknown_function", `Unknown AI function "${rawId}"`);
      const providerId = await pick(userId, provider);
      configOf(providerId);

      let caps: ModelCapabilities | undefined;
      try {
        caps = await capabilities(userId, input.model, providerId);
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

      await store.putSetting(userId, settingKey(providerId, id.data), {
        model: input.model,
        think: input.think,
      });
      return describeAiFunction(userId, providerId, id.data);
    },

    /**
     * Client, model and effort for one AI function on the user's active provider, read fresh so
     * changes apply on the next call.
     */
    async getLlmForFunction(userId: string, id: AiFunctionId): Promise<LlmForFunction> {
      const provider = await activeProvider(userId);
      const { model, think } =
        (await readAiFunction(userId, provider, id)) ?? defaultFor(id, provider);
      const client = clientFor(userId, provider);
      try {
        return {
          client,
          model,
          think: normalizeThink(think, (await capabilities(userId, model, provider)).thinking),
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
