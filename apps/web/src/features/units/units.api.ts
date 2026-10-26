import {
  AnswersResponse,
  AttemptResponse,
  type ExplainContext,
  ExplainResponse,
  HintResponse,
  TimelineCheckResponse,
  type TimelinePlacement,
  UnitDetail,
  UnitsListResponse,
} from "@english-course/shared";
import { apiRequest } from "../../shared/api/http.ts";

const base = "/api/units";

export const unitsKeys = {
  all: ["units"] as const,
  list: ["units", "list"] as const,
  detail: (n: number) => ["units", "detail", n] as const,
  answers: (n: number, exerciseId: string) => ["units", "answers", n, exerciseId] as const,
};

export const fetchUnits = () => apiRequest(base, UnitsListResponse);

export const fetchUnit = (n: number) => apiRequest(`${base}/${n}`, UnitDetail);

export const submitAttempt = (n: number, itemId: string, inputs: string[]) =>
  apiRequest(`${base}/${n}/items/${encodeURIComponent(itemId)}/attempts`, AttemptResponse, {
    method: "POST",
    body: { inputs },
  });

export const requestHint = (n: number, itemId: string, shown: number) =>
  apiRequest(`${base}/${n}/items/${encodeURIComponent(itemId)}/hint`, HintResponse, {
    method: "POST",
    body: { shown },
  });

export const requestExplanation = (n: number, context: Partial<ExplainContext>) =>
  apiRequest(`${base}/${n}/explain`, ExplainResponse, { method: "POST", body: { context } });

export const checkTimeline = (n: number, itemId: string, placement: TimelinePlacement) =>
  apiRequest(`${base}/${n}/timeline/${encodeURIComponent(itemId)}`, TimelineCheckResponse, {
    method: "POST",
    body: { placement },
  });

export const fetchAnswers = (n: number, exerciseId: string) =>
  apiRequest(`${base}/${n}/answers/${encodeURIComponent(exerciseId)}`, AnswersResponse);
