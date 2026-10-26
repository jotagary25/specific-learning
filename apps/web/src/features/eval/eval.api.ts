import {
  AiFunctionConfig,
  type AiFunctionId,
  EvalFixturesResponse,
  EvalRun,
  EvalRunsResponse,
  type StartEvalRequest,
  StartEvalResponse,
} from "@english-course/shared";
import { apiRequest } from "../../shared/api/http.ts";

const base = "/api/eval";

export const evalKeys = {
  fixtures: ["eval", "fixtures"] as const,
  runs: ["eval", "runs"] as const,
  run: (id: string) => ["eval", "runs", id] as const,
};

export const fetchFixtureCounts = async () =>
  (await apiRequest(`${base}/fixtures`, EvalFixturesResponse)).counts;

export const fetchRuns = async () => (await apiRequest(`${base}/runs`, EvalRunsResponse)).runs;

export const fetchRun = (id: string) =>
  apiRequest(`${base}/runs/${encodeURIComponent(id)}`, EvalRun);

export const startEval = (body: StartEvalRequest) =>
  apiRequest(`${base}/runs`, StartEvalResponse, { method: "POST", body });

export const cancelRun = (id: string) =>
  apiRequest(`${base}/runs/${encodeURIComponent(id)}/cancel`, EvalRun, { method: "POST" });

export const applyRun = (id: string, functionId: AiFunctionId) =>
  apiRequest(`${base}/runs/${encodeURIComponent(id)}/apply`, AiFunctionConfig, {
    method: "POST",
    body: { functionId },
  });
