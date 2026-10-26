import {
  type PublishedVersion,
  WritingCurrentResponse,
  WritingHistoryResponse,
  WritingMissionResponse,
} from "@english-course/shared";
import { apiRequest } from "../../shared/api/http.ts";

const base = "/api/writing";
const mission = (id: string) => `${base}/missions/${encodeURIComponent(id)}`;

export const writingKeys = {
  all: ["writing"] as const,
  current: ["writing", "current"] as const,
  history: ["writing", "history"] as const,
};

export const fetchCurrent = () => apiRequest(`${base}/missions/current`, WritingCurrentResponse);

export const fetchHistory = () => apiRequest(`${base}/missions`, WritingHistoryResponse);

export const generateMission = () =>
  apiRequest(`${base}/missions/generate`, WritingMissionResponse, { method: "POST", body: {} });

export const saveDraft = (id: string, text: string) =>
  apiRequest(`${mission(id)}/draft`, WritingMissionResponse, { method: "PUT", body: { text } });

export const submitText = (id: string, text: string) =>
  apiRequest(`${mission(id)}/submit`, WritingMissionResponse, { method: "POST", body: { text } });

export const recheckText = (id: string, text: string) =>
  apiRequest(`${mission(id)}/recheck`, WritingMissionResponse, { method: "POST", body: { text } });

export const requestRewrites = (id: string) =>
  apiRequest(`${mission(id)}/rewrite`, WritingMissionResponse, { method: "POST", body: {} });

export const completeMission = (id: string, publishedVersion?: PublishedVersion) =>
  apiRequest(`${mission(id)}/complete`, WritingMissionResponse, {
    method: "POST",
    body: publishedVersion ? { publishedVersion } : {},
  });

export const markPublished = (id: string, version: PublishedVersion) =>
  apiRequest(`${mission(id)}/published`, WritingMissionResponse, {
    method: "POST",
    body: { version },
  });

export const skipMission = (id: string) =>
  apiRequest(`${mission(id)}/skip`, WritingMissionResponse, { method: "POST", body: {} });

/** Local copy of the text, so a draft survives a failed save or a closed tab. */
export const localDraft = {
  key: (id: string) => `writing.draft.${id}`,
  read(id: string): string | null {
    try {
      return window.localStorage.getItem(this.key(id));
    } catch {
      return null;
    }
  },
  write(id: string, text: string) {
    try {
      window.localStorage.setItem(this.key(id), text);
    } catch {
      // Storage unavailable (private mode): the server autosave still runs.
    }
  },
  clear(id: string) {
    try {
      window.localStorage.removeItem(this.key(id));
    } catch {
      // ignore
    }
  },
};
