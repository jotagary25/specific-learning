import {
  AiFunctionConfig,
  type AiFunctionId,
  AiFunctionsResponse,
  AiKeyStatus,
  AiKeyTestResult,
  type AiProviderId,
  AiProviderResponse,
  ModelCapabilities,
  ModelsResponse,
  PreferencesView,
  type UpdateAiFunctionRequest,
  type UpdatePreferencesRequest,
} from "@english-course/shared";
import { apiRequest } from "../../shared/api/http.ts";

const base = "/api/settings";

/** Model list and capabilities change rarely; mirrors the api's 10-minute cache. */
export const MODEL_METADATA_STALE_MS = 10 * 60_000;

export const PROVIDER_LABEL: Record<AiProviderId, string> = {
  ollama: "Ollama Cloud",
  openrouter: "OpenRouter",
};

export const settingsKeys = {
  provider: ["settings", "ai-provider"] as const,
  aiKey: (provider: AiProviderId) => ["settings", "ai-key", provider] as const,
  models: (provider: AiProviderId) => ["settings", "models", provider] as const,
  capabilities: (provider: AiProviderId, model: string) =>
    ["settings", "capabilities", provider, model] as const,
  aiFunctions: (provider: AiProviderId) => ["settings", "ai-functions", provider] as const,
};

/** Every provider-scoped call names its provider so a switch never races the cache. */
const q = (provider: AiProviderId) => `?provider=${provider}`;

export const fetchAiProvider = () => apiRequest(`${base}/ai-provider`, AiProviderResponse);

export const saveAiProvider = (provider: AiProviderId) =>
  apiRequest(`${base}/ai-provider`, AiProviderResponse, { method: "PUT", body: { provider } });

export const fetchAiKey = (provider: AiProviderId) =>
  apiRequest(`${base}/ai-key${q(provider)}`, AiKeyStatus);

export const saveAiKey = (provider: AiProviderId, apiKey: string) =>
  apiRequest(`${base}/ai-key${q(provider)}`, AiKeyStatus, { method: "PUT", body: { apiKey } });

export const deleteAiKey = (provider: AiProviderId) =>
  apiRequest(`${base}/ai-key${q(provider)}`, AiKeyStatus, { method: "DELETE" });

export const testAiKey = (provider: AiProviderId) =>
  apiRequest(`${base}/ai-key/test${q(provider)}`, AiKeyTestResult, { method: "POST" });

export const fetchModels = async (provider: AiProviderId) =>
  (await apiRequest(`${base}/models${q(provider)}`, ModelsResponse)).models;

export const fetchCapabilities = (provider: AiProviderId, model: string) =>
  apiRequest(
    `${base}/models/${encodeURIComponent(model)}/capabilities${q(provider)}`,
    ModelCapabilities,
  );

export const fetchAiFunctions = async (provider: AiProviderId) =>
  (await apiRequest(`${base}/ai-functions${q(provider)}`, AiFunctionsResponse)).functions;

export const saveAiFunction = (
  provider: AiProviderId,
  id: AiFunctionId,
  body: UpdateAiFunctionRequest,
) =>
  apiRequest(`${base}/ai-functions/${id}${q(provider)}`, AiFunctionConfig, {
    method: "PUT",
    body,
  });

/** "$0.15 / $0.60 per 1M · 131k ctx" for OpenRouter models; just the name otherwise. */
export function modelLabel(model: {
  name: string;
  contextLength?: number;
  pricing?: { inputPerMTok: number; outputPerMTok: number };
}): string {
  const parts: string[] = [];
  if (model.pricing) {
    const usd = (n: number) => `$${n.toFixed(n > 0 && n < 0.1 ? 3 : 2)}`;
    parts.push(`${usd(model.pricing.inputPerMTok)} / ${usd(model.pricing.outputPerMTok)} per 1M`);
  }
  if (model.contextLength) parts.push(`${Math.round(model.contextLength / 1000)}k ctx`);
  return parts.length ? `${model.name} · ${parts.join(" · ")}` : model.name;
}

export const preferencesKey = ["settings", "preferences"] as const;

export const fetchPreferences = () => apiRequest(`${base}/preferences`, PreferencesView);

export const savePreferences = (body: UpdatePreferencesRequest) =>
  apiRequest(`${base}/preferences`, PreferencesView, { method: "PUT", body });
