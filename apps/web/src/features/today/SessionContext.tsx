import type { EndReason, StoryTeaser, StudySessionView } from "@english-course/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HttpError } from "../../shared/api/http.ts";
import {
  type ActiveSession,
  loadActiveSession,
  newActiveSession,
  remainingMs,
  saveActiveSession,
  withBonus,
} from "./session.model.ts";
import { endSession, todayKeys } from "./today.api.ts";

export type StoredSession = ActiveSession & { teaser?: StoryTeaser | null };

type SessionContextValue = {
  active: StoredSession | null;
  /** Milliseconds left; 0 once the timer ran out. */
  remaining: number;
  phase: "idle" | "running" | "complete";
  start: (session: StudySessionView, teaser: StoryTeaser | null) => void;
  /** Restores a session the server reports as open (e.g. after clearing storage). */
  adopt: (session: StudySessionView, teaser: StoryTeaser | null) => void;
  nextBlock: () => void;
  takeBonus: () => void;
  stop: (reason: EndReason) => Promise<void>;
  stopping: boolean;
  error: string | null;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useStudySession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useStudySession needs a SessionProvider");
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<StoredSession | null>(() => loadActiveSession());
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sessions ended here: a stale overview must not bring them back.
  const ended = useRef(new Set<string>());

  const update = useCallback((next: StoredSession | null) => {
    saveActiveSession(next);
    setActive(next);
    setNow(Date.now());
  }, []);

  const running = active !== null && remainingMs(active, now) > 0;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const stop = useCallback(
    async (reason: EndReason) => {
      if (!active) return;
      setStopping(true);
      setError(null);
      try {
        await endSession(active.session.id, {
          reason,
          bonusMinutes: active.bonusMin,
          blocksDone: Math.min(active.blockIndex, active.session.plan.blocks.length),
        });
      } catch (e) {
        // Already ended (another tab): forget it locally as well.
        if (!(e instanceof HttpError && e.status === 409)) {
          setError(e instanceof Error ? e.message : "Could not end the session");
          setStopping(false);
          return;
        }
      }
      ended.current.add(active.session.id);
      update(null);
      setStopping(false);
      await queryClient.invalidateQueries({ queryKey: todayKeys.all });
    },
    [active, queryClient, update],
  );

  const value = useMemo<SessionContextValue>(() => {
    const remaining = active ? remainingMs(active, now) : 0;
    return {
      active,
      remaining,
      phase: !active ? "idle" : remaining > 0 ? "running" : "complete",
      start: (session, teaser) => update({ ...newActiveSession(session), teaser }),
      adopt: (session, teaser) => {
        if (active || ended.current.has(session.id)) return;
        update({ ...newActiveSession(session), teaser });
      },
      nextBlock: () => {
        if (!active) return;
        const max = active.session.plan.blocks.length;
        update({ ...active, blockIndex: Math.min(active.blockIndex + 1, max) });
      },
      takeBonus: () => {
        if (active) update(withBonus(active, Date.now()));
      },
      stop,
      stopping,
      error,
    };
  }, [active, now, stop, stopping, error, update]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
