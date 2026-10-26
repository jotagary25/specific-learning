import {
  ApiError,
  DeleteParkingResponse,
  type EndSessionRequest,
  ParkingItemView,
  ParkingListResponse,
  StudySessionView,
  type TodayMode,
  TodayOverview,
} from "@english-course/shared";
import { apiRequest, HttpError } from "../../shared/api/http.ts";

const base = "/api/today";

export const todayKeys = {
  all: ["today"] as const,
  overview: (mode: TodayMode | null) => ["today", "overview", mode] as const,
  parking: ["today", "parking"] as const,
};

export const fetchToday = (mode: TodayMode | null) =>
  apiRequest(mode ? `${base}?mode=${mode}` : base, TodayOverview);

export const startSession = (mode: TodayMode) =>
  apiRequest(`${base}/sessions`, StudySessionView, { method: "POST", body: { mode } });

export const endSession = (id: string, request: EndSessionRequest) =>
  apiRequest(`${base}/sessions/${encodeURIComponent(id)}/end`, StudySessionView, {
    method: "POST",
    body: request,
  });

export const fetchParking = () => apiRequest(`${base}/parking`, ParkingListResponse);

export const addParking = (text: string) =>
  apiRequest(`${base}/parking`, ParkingItemView, { method: "POST", body: { text } });

/** PATCH is not in the shared request helper; same error mapping. */
export async function updateParking(
  id: string,
  patch: { text?: string; done?: boolean },
): Promise<ParkingItemView> {
  const res = await fetch(`${base}/parking/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const parsed = ApiError.safeParse(await res.json().catch(() => null));
    throw parsed.success
      ? new HttpError(res.status, parsed.data.error, parsed.data.message)
      : new HttpError(res.status, "http_error", `Request failed with HTTP ${res.status}`);
  }
  return ParkingItemView.parse(await res.json());
}

export const deleteParking = (id: string) =>
  apiRequest(`${base}/parking/${encodeURIComponent(id)}`, DeleteParkingResponse, {
    method: "DELETE",
  });
