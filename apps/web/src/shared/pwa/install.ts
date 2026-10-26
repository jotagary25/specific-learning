/** Chromium's install prompt event (not in the DOM typings). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "ec.installHint.dismissed";

/** Running as an installed app (home-screen / standalone window). */
export function isStandalone(): boolean {
  const media = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return media || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad Safari has no install prompt; the hint shows manual steps instead. */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1)
  );
}

export function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Storage unavailable (private mode): the hint just comes back next time.
  }
}
