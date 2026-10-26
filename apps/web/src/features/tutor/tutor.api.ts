import {
  ApiError,
  ConversationDetail,
  ConversationsListResponse,
  CreateConversationResponse,
  type TutorContextInput,
  TutorStreamEvent,
} from "@english-course/shared";
import { apiRequest, HttpError } from "../../shared/api/http.ts";

const base = "/api/tutor/conversations";

export const tutorKeys = {
  all: ["tutor"] as const,
  list: ["tutor", "list"] as const,
  detail: (id: string) => ["tutor", "detail", id] as const,
};

export const createConversation = (context: TutorContextInput) =>
  apiRequest(base, CreateConversationResponse, { method: "POST", body: { context } });

export const fetchConversations = () => apiRequest(base, ConversationsListResponse);

export const fetchConversation = (id: string) =>
  apiRequest(`${base}/${encodeURIComponent(id)}`, ConversationDetail);

/** Splits an SSE buffer into complete frames' JSON events and the unfinished rest. */
export function parseSseChunk(buffer: string): { events: TutorStreamEvent[]; rest: string } {
  const frames = buffer.replaceAll("\r\n", "\n").split("\n\n");
  const rest = frames.pop() ?? "";
  const events = frames.flatMap((frame) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return [];
    try {
      const parsed = TutorStreamEvent.safeParse(JSON.parse(data));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
  return { events, rest };
}

/**
 * Sends a learner message and calls `onEvent` for each streamed event. Errors before the
 * stream opens (404, 503 "ai-unavailable") throw an `HttpError`; aborting stops reading.
 */
export async function streamTurn(
  id: string,
  content: string,
  onEvent: (event: TutorStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${base}/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({ content }),
    signal,
  });
  if (!res.ok) {
    const parsed = ApiError.safeParse(await res.json().catch(() => null));
    throw parsed.success
      ? new HttpError(res.status, parsed.data.error, parsed.data.message)
      : new HttpError(res.status, "http_error", `Request failed with HTTP ${res.status}`);
  }
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const { events, rest } = parseSseChunk(done ? `${buffer}\n\n` : buffer);
    buffer = rest;
    for (const event of events) onEvent(event);
    if (done) return;
  }
}
