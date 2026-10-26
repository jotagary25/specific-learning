import type { TutorContextInput } from "@english-course/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { HttpError } from "../../shared/api/http.ts";
import { createConversation, fetchConversation, streamTurn, tutorKeys } from "./tutor.api.ts";
import { applyEvent, type ChatEntry, entriesFromMessages, newEntry } from "./tutor.model.ts";

type Options = {
  /** Existing conversation to continue; without it one is created on the first message. */
  conversationId?: string;
  context: TutorContextInput;
  onConversation?: (id: string) => void;
  /** Called when a turn finishes (done, error or failure). */
  onTurnEnd?: () => void;
};

const describeFailure = (error: unknown) =>
  error instanceof HttpError && error.code === "ai-unavailable"
    ? "The AI tutor is unavailable right now (add an Ollama API key in Settings)."
    : error instanceof Error
      ? error.message
      : "Something went wrong.";

/** Chat state for one tutor conversation: history, the streaming answer, send and stop. */
export function useTutorChat({ conversationId, context, onConversation, onTurnEnd }: Options) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  // History is loaded once for the conversation the chat opened with; ids created later by
  // this chat must not reload (and overwrite) the answer being streamed.
  const [initialId] = useState(conversationId);
  const idRef = useRef(conversationId);
  const abortRef = useRef<AbortController | null>(null);

  const history = useQuery({
    queryKey: tutorKeys.detail(initialId ?? ""),
    queryFn: () => fetchConversation(initialId ?? ""),
    enabled: initialId !== undefined,
    refetchOnWindowFocus: false,
  });
  const loaded = history.data;
  useEffect(() => {
    if (loaded) setEntries(entriesFromMessages(loaded.messages));
  }, [loaded]);

  // Leaving the chat aborts the answer in flight (the api then stops the model too).
  useEffect(() => () => abortRef.current?.abort(), []);

  const updateLast = useCallback((change: (entry: ChatEntry) => ChatEntry) => {
    setEntries((list) => {
      const last = list.at(-1);
      return last?.role === "assistant" ? [...list.slice(0, -1), change(last)] : list;
    });
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      if (!content || busy) return;
      setBusy(true);
      setEntries((list) => [...list, newEntry("user", content), newEntry("assistant", "")]);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        if (!idRef.current) {
          idRef.current = (await createConversation(context)).id;
          onConversation?.(idRef.current);
        }
        await streamTurn(
          idRef.current,
          content,
          (event) => updateLast((e) => applyEvent(e, event)),
          controller.signal,
        );
        updateLast((e) => (e.streaming ? { ...e, streaming: false, thinking: false } : e));
      } catch (error) {
        if (!controller.signal.aborted) {
          updateLast((e) => ({
            ...e,
            streaming: false,
            thinking: false,
            error: describeFailure(error),
          }));
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(false);
        onTurnEnd?.();
      }
    },
    [busy, context, onConversation, onTurnEnd, updateLast],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    updateLast((e) => ({ ...e, streaming: false, thinking: false }));
  }, [updateLast]);

  return { entries, busy, loading: history.isLoading, send, stop };
}
