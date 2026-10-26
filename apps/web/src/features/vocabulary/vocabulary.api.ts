import {
  ApiError,
  type CardPatch,
  type CardSource,
  CardsListResponse,
  CardView,
  DeleteCardResponse,
  QueueResponse,
  ReviewResponse,
  type SessionRequest,
  SessionResponse,
  type SrsRating,
  StatsResponse,
} from "@english-course/shared";
import { apiRequest, HttpError } from "../../shared/api/http.ts";

const base = "/api/vocabulary";
const card = (id: string) => `${base}/cards/${encodeURIComponent(id)}`;

export const vocabularyKeys = {
  all: ["vocabulary"] as const,
  queue: ["vocabulary", "queue"] as const,
  stats: ["vocabulary", "stats"] as const,
  cards: (source: CardSource | "", q: string) => ["vocabulary", "cards", source, q] as const,
};

export const SESSION_SIZE = 10;

export const fetchQueue = (limit = SESSION_SIZE) =>
  apiRequest(`${base}/queue?limit=${limit}`, QueueResponse);

export const fetchStats = () => apiRequest(`${base}/stats`, StatsResponse);

export function fetchCards(source: CardSource | "", q: string) {
  const params = new URLSearchParams();
  if (source) params.set("source", source);
  if (q.trim()) params.set("q", q.trim());
  const query = params.toString();
  return apiRequest(`${base}/cards${query ? `?${query}` : ""}`, CardsListResponse);
}

export const reviewCard = (id: string, rating: SrsRating, answer?: string) =>
  apiRequest(`${card(id)}/review`, ReviewResponse, {
    method: "POST",
    body: answer === undefined ? { rating } : { rating, answer },
  });

export const completeSession = (counts: SessionRequest) =>
  apiRequest(`${base}/sessions`, SessionResponse, { method: "POST", body: counts });

export const deleteCard = (id: string) =>
  apiRequest(card(id), DeleteCardResponse, { method: "DELETE" });

/** PATCH is not covered by the shared `apiRequest` helper; same error handling. */
export async function updateCard(id: string, patch: CardPatch): Promise<CardView> {
  const res = await fetch(card(id), {
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
  return CardView.parse(await res.json());
}
