import {
  CanDoEntry,
  CanDoListResponse,
  ErrorsResponse,
  MirrorDueResponse,
  MirrorReflection,
  MirrorResponse,
  MirrorSeenResponse,
  ProgressSummary,
  TimelineResponse,
} from "@english-course/shared";
import { apiRequest } from "../../shared/api/http.ts";

const base = "/api/progress";

export const progressKeys = {
  all: ["progress"] as const,
  summary: ["progress", "summary"] as const,
  timeline: ["progress", "timeline"] as const,
  errors: ["progress", "errors"] as const,
  canDo: ["progress", "can-do"] as const,
  mirror: (month: string) => ["progress", "mirror", month] as const,
  mirrorDue: ["progress", "mirror", "due"] as const,
};

export const fetchSummary = () => apiRequest(`${base}/summary`, ProgressSummary);

/** Defaults to the last 12 weeks. */
export const fetchTimeline = () => apiRequest(`${base}/timeline`, TimelineResponse);

export const fetchErrors = () => apiRequest(`${base}/errors`, ErrorsResponse);

export const fetchCanDo = () => apiRequest(`${base}/can-do`, CanDoListResponse);

export const addCanDo = (text: string) =>
  apiRequest(`${base}/can-do`, CanDoEntry, { method: "POST", body: { text } });

export const fetchMirror = (month: string) =>
  apiRequest(`${base}/mirror?month=${encodeURIComponent(month)}`, MirrorResponse);

export const fetchMirrorDue = () => apiRequest(`${base}/mirror/due`, MirrorDueResponse);

export const markMirrorSeen = (month: string) =>
  apiRequest(`${base}/mirror/${encodeURIComponent(month)}/seen`, MirrorSeenResponse, {
    method: "POST",
  });

export const saveReflection = (month: string, text: string) =>
  apiRequest(`${base}/mirror/${encodeURIComponent(month)}/reflection`, MirrorReflection, {
    method: "POST",
    body: { text },
  });
