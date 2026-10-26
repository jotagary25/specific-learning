/**
 * Service worker runtime cache holding authenticated study responses (units, articles); see
 * `runtimeCaching` in vite.config.ts. `content-images` is not personal and stays.
 */
export const STUDY_CACHE = "api-study";

const listeners = new Set<() => void>();

/** Registers an in-memory cache (e.g. TanStack Query) to drop when the session ends. */
export function onSessionEnd(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Drops data cached for the ended session: in-memory caches and the `api-study` cache. */
export async function clearSessionData(): Promise<void> {
  for (const listener of listeners) listener();
  if (!("caches" in globalThis)) return;
  try {
    await globalThis.caches.delete(STUDY_CACHE);
  } catch {
    // Cache Storage can be blocked (private mode, storage policy); nothing was cached then.
  }
}
