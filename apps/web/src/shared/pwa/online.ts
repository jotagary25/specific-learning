import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** `navigator.onLine`, kept current through the window online/offline events. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** Copy for actions that cannot run offline: nothing is ever queued for later. */
export const OFFLINE_ACTION_MESSAGE =
  "You're offline. This needs a connection — nothing was saved or queued. Try again once you're back online.";
