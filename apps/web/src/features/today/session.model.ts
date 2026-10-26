import {
  BONUS_STEP_MIN,
  bonusAllowed,
  type Daypart,
  type StudySessionView,
} from "@english-course/shared";

const MINUTE = 60_000;

/** The running session as the browser keeps it (localStorage), so it survives reloads. */
export type ActiveSession = {
  session: StudySessionView;
  /** Plan blocks finished so far; equals the block count when all are done. */
  blockIndex: number;
  bonusMin: number;
  /** Epoch ms when the countdown hits zero: start + budget, pushed by each bonus. */
  deadline: number;
};

export const STORAGE_KEY = "today.activeSession";

export function newActiveSession(session: StudySessionView): ActiveSession {
  return {
    session,
    blockIndex: 0,
    bonusMin: session.bonusMin,
    deadline: Date.parse(session.startedAt) + session.budgetMin * MINUTE,
  };
}

export const remainingMs = (active: ActiveSession, now: number) =>
  Math.max(0, active.deadline - now);

/** "mm:ss" for the countdown. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** The api decides in the user's time zone; sessions saved before that field read as weekdays. */
export const sessionOnWeekend = (active: ActiveSession) => active.session.weekend === true;

export const canTakeBonus = (active: ActiveSession) =>
  bonusAllowed(sessionOnWeekend(active), active.bonusMin);

/** Adds one bonus step; the extra time starts now, not when the timer ran out. */
export function withBonus(active: ActiveSession, now: number): ActiveSession {
  return {
    ...active,
    bonusMin: active.bonusMin + BONUS_STEP_MIN,
    deadline: Math.max(active.deadline, now) + BONUS_STEP_MIN * MINUTE,
  };
}

export function loadActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSession;
    return typeof parsed?.session?.id === "string" && typeof parsed.deadline === "number"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function saveActiveSession(active: ActiveSession | null) {
  try {
    if (active) localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the session still runs in memory.
  }
}

export const GREETINGS: Record<Daypart, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};
