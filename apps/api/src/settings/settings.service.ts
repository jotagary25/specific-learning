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
  /**
   * Builds one user's LLM client; it must resolve the key through `getApiKey` on every call.
   * Called once per user and cached.
   */
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

/** Per-user cached state: the resolved key, the client bound to it and model metadata. */
type UserState = {
  resolvedKey?: Cached<string | undefined>;
  modelsCache?: Cached<ModelSummary[]>;
  client?: LlmClient;
  capabilitiesCache: Map<string, Cached<ModelCapabilities>>;
  capabilityFailures: Map<string, Cached<LlmError> & { ttlMs: number }>;
};

/**
 * Per-user AI settings: each user has their own Ollama key (env key as fallback) and their own
 * model/effort per AI function. Every method takes the user id first.
 */
export function createSettings(options: SettingsOptions) {
  const { store, appSecret } = options;
  const now = options.now ?? Date.now;
  const ttl = options.cacheTtlMs ?? CACHE_TTL_MS;
  const fresh = <T>(entry: Cached<T> | undefined, maxAge = ttl): entry is Cached<T> =>
    entry !== undefined && now() - entry.at < maxAge;

  const states = new Map<string, UserState>();
  const stateOf = (userId: string): UserState => {
    let state = states.get(userId);
    if (!state) {
      state = { capabilitiesCache: new Map(), capabilityFailures: new Map() };
      states.set(userId, state);
    }
    return state;
  };

  const clearCaches = (userId: string) => {
    const state = stateOf(userId);
    state.resolvedKey = undefined;
    state.modelsCache = undefined;
    state.capabilitiesCache.clear();
    state.capabilityFailures.clear();
  };

  type StoredKey =
    | { state: "none" }
    | { state: "ok"; key: string; last4: string }
    | { state: "undecryptable"; last4: string };

  async function readStoredKey(userId: string): Promise<StoredKey> {
    const sealed = await store.getSecret(userId, API_KEY_SECRET);
    if (!sealed) return { state: "none" };
    try {
      return { state: "ok", key: decryptSecret(sealed, appSecret), last4: sealed.last4 };
    } catch {
      console.warn("settings: the stored Ollama API key cannot be decrypted (APP_SECRET changed?)");
      return { state: "undecryptable", last4: sealed.last4 };
    }
  }

  async function getApiKey(userId: string): Promise<string | undefined> {
    const state = stateOf(userId);
    if (!fresh(state.resolvedKey)) {
      const stored = await readStoredKey(userId);
      state.resolvedKey = {
        value: stored.state === "ok" ? stored.key : options.envApiKey,
        at: now(),
      };
    }
    return state.resolvedKey.value;
  }

  /** The user's LLM client, bound to their key (resolved on every call). */
  function clientFor(userId: string): LlmClient {
    const state = stateOf(userId);
    state.client ??= options.createClient(() => getApiKey(userId));
    return state.client;
  }

  async function keyStatus(userId: string): Promise<AiKeyStatus> {
    const stored = await readStoredKey(userId);
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

  async function listModels(userId: string): Promise<ModelSummary[]> {
    const state = stateOf(userId);
    if (!fresh(state.modelsCache)) {
      state.modelsCache = { value: await clientFor(userId).listModels(), at: now() };
    }
    return state.modelsCache.value;
  }

  /** Probes `/api/show` once per TTL; LLM failures are negatively cached so callers skip it. */
  async function capabilities(userId: string, model: string): Promise<ModelCapabilities> {
    const { capabilitiesCache, capabilityFailures } = stateOf(userId);
    const cached = capabilitiesCache.get(model);
    if (fresh(cached)) return cached.value;
    const failure = capabilityFailures.get(model);
    if (failure && fresh(failure, failure.ttlMs)) throw failure.value;
    try {
      const value = await clientFor(userId).modelCapabilities(model);
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
    id: AiFunctionId,
  ): Promise<AiFunctionSetting | undefined> {
    const parsed = StoredAiFunction.safeParse(await store.getSetting(userId, settingKey(id)));
    return parsed.success ? parsed.data : undefined;
  }

  async function describeAiFunction(userId: string, id: AiFunctionId): Promise<AiFunctionConfig> {
    const defaults = defaultFor(id);
    const stored = await readAiFunction(userId, id);
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
    clientFor,
    /**
     * Raw Ollama key for backend-only Ollama endpoints (web_search/web_fetch). Never send it to
     * the browser and never log it.
     */
    getApiKey,
    keyStatus,
    listModels,
    capabilities,

    async setKey(userId: string, apiKey: string): Promise<AiKeyStatus> {
      await store.putSecret(userId, API_KEY_SECRET, {
        ...encryptSecret(apiKey, appSecret),
        last4: apiKey.slice(-4),
      });
      clearCaches(userId);
      return keyStatus(userId);
    },

    async deleteKey(userId: string): Promise<AiKeyStatus> {
      await store.deleteSecret(userId, API_KEY_SECRET);
      clearCaches(userId);
      return keyStatus(userId);
    },

    async testKey(userId: string): Promise<AiKeyTestResult> {
      try {
        stateOf(userId).modelsCache = undefined;
        return { ok: true, modelCount: (await listModels(userId)).length };
      } catch (error) {
        if (!isLlmError(error)) throw error;
        return { ok: false, error: error.code, message: error.message };
      }
    },

    listAiFunctions: (userId: string) =>
      Promise.all(AiFunctionId.options.map((id) => describeAiFunction(userId, id))),

    async updateAiFunction(
      userId: string,
      rawId: string,
      input: UpdateAiFunctionRequest,
    ): Promise<AiFunctionConfig> {
      const id = AiFunctionId.safeParse(rawId);
      if (!id.success)
        throw new SettingsError("unknown_function", `Unknown AI function "${rawId}"`);

      let caps: ModelCapabilities | undefined;
      try {
        caps = await capabilities(userId, input.model);
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

      await store.putSetting(userId, settingKey(id.data), {
        model: input.model,
        think: input.think,
      });
      return describeAiFunction(userId, id.data);
    },

    /** Model + effort for one AI function, read fresh so changes apply on the next call. */
    async getLlmForFunction(userId: string, id: AiFunctionId): Promise<LlmForFunction> {
      const { model, think } = (await readAiFunction(userId, id)) ?? defaultFor(id);
      const client = clientFor(userId);
      try {
        return {
          client,
          model,
          think: normalizeThink(think, (await capabilities(userId, model)).thinking),
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
