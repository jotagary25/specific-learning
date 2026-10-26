import {
  AiFunctionConfig,
  type AiFunctionId,
  AiFunctionsResponse,
  AiKeyStatus,
  AiKeyTestResult,
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

export const settingsKeys = {
  aiKey: ["settings", "ai-key"] as const,
  models: ["settings", "models"] as const,
  capabilities: (model: string) => ["settings", "capabilities", model] as const,
  aiFunctions: ["settings", "ai-functions"] as const,
};

export const fetchAiKey = () => apiRequest(`${base}/ai-key`, AiKeyStatus);

export const saveAiKey = (apiKey: string) =>
  apiRequest(`${base}/ai-key`, AiKeyStatus, { method: "PUT", body: { apiKey } });

export const deleteAiKey = () => apiRequest(`${base}/ai-key`, AiKeyStatus, { method: "DELETE" });

export const testAiKey = () =>
  apiRequest(`${base}/ai-key/test`, AiKeyTestResult, { method: "POST" });

export const fetchModels = async () => (await apiRequest(`${base}/models`, ModelsResponse)).models;

export const fetchCapabilities = (model: string) =>
  apiRequest(`${base}/models/${encodeURIComponent(model)}/capabilities`, ModelCapabilities);

export const fetchAiFunctions = async () =>
  (await apiRequest(`${base}/ai-functions`, AiFunctionsResponse)).functions;

export const saveAiFunction = (id: AiFunctionId, body: UpdateAiFunctionRequest) =>
  apiRequest(`${base}/ai-functions/${id}`, AiFunctionConfig, { method: "PUT", body });

export const preferencesKey = ["settings", "preferences"] as const;

export const fetchPreferences = () => apiRequest(`${base}/preferences`, PreferencesView);

export const savePreferences = (body: UpdatePreferencesRequest) =>
  apiRequest(`${base}/preferences`, PreferencesView, { method: "PUT", body });
