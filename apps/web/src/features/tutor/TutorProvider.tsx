import type { TutorContextInput } from "@english-course/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router";
import { contextFromRoute, sameContext } from "./tutor.model.ts";

type OpenOptions = {
  /** Defaults to the context of the current route (and focused exercise item). */
  context?: TutorContextInput;
  /** Where "Back to my task" returns; defaults to the element focused when opening. */
  returnFocus?: HTMLElement | null;
};

type TutorState = {
  open: boolean;
  context: TutorContextInput;
  /** Bumped whenever the drawer starts a new conversation. */
  session: number;
  conversationId?: string;
};

type TutorContextValue = TutorState & {
  openTutor: (options?: OpenOptions) => void;
  closeTutor: () => void;
  setConversationId: (id: string) => void;
};

const noop = () => {};
const TutorCtx = createContext<TutorContextValue | null>(null);

/** Global tutor drawer state: open from any screen with its context, close back to the task. */
export function TutorProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState<TutorState>({
    open: false,
    context: { kind: "free", ref: "" },
    session: 0,
  });
  const returnFocus = useRef<HTMLElement | null>(null);

  const openTutor = useCallback(
    (options: OpenOptions = {}) => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      returnFocus.current = options.returnFocus ?? active;
      const context =
        options.context ?? contextFromRoute(location.pathname, location.search, active);
      setState((current) =>
        // Same screen and an open conversation: keep it, so the learner can continue.
        sameContext(current.context, context) && !options.context
          ? { ...current, open: true }
          : { open: true, context, session: current.session + 1, conversationId: undefined },
      );
    },
    [location.pathname, location.search],
  );

  const closeTutor = useCallback(() => {
    setState((current) => ({ ...current, open: false }));
    const target = returnFocus.current;
    setTimeout(() => {
      if (target?.isConnected) {
        target.focus();
        target.scrollIntoView?.({ block: "center" });
      }
    });
  }, []);

  const setConversationId = useCallback((id: string) => {
    setState((current) => ({ ...current, conversationId: id }));
  }, []);

  const value = useMemo(
    () => ({ ...state, openTutor, closeTutor, setConversationId }),
    [state, openTutor, closeTutor, setConversationId],
  );
  return <TutorCtx.Provider value={value}>{children}</TutorCtx.Provider>;
}

/** Outside the provider (isolated tests) the tutor is simply unavailable. */
export function useTutor(): TutorContextValue {
  return (
    useContext(TutorCtx) ?? {
      open: false,
      context: { kind: "free", ref: "" },
      session: 0,
      openTutor: noop,
      closeTutor: noop,
      setConversationId: noop,
    }
  );
}
