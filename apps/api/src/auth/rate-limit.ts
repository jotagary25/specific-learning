/**
 * In-memory fixed-window limiter for login attempts (single process). Buckets are keyed by
 * account and client (see auth.ts).
 *
 * `consume` reserves an attempt synchronously, before the handler awaits anything, so
 * parallel requests cannot all pass the gate; a successful login gives it back with `reset`.
 * Expired buckets are swept once per window and the map is capped, so memory stays bounded.
 */
export function createLoginRateLimiter({
  maxFailures = 5,
  windowMs = 15 * 60_000,
  maxBuckets = 10_000,
  now = Date.now,
}: {
  maxFailures?: number;
  windowMs?: number;
  /** Hard cap on tracked clients; the oldest bucket is dropped beyond it. */
  maxBuckets?: number;
  now?: () => number;
} = {}) {
  const attempts = new Map<string, { count: number; windowStart: number }>();
  let lastSweep = now();

  const expired = (entry: { windowStart: number }) => now() - entry.windowStart >= windowMs;

  const sweep = () => {
    for (const [key, entry] of attempts) if (expired(entry)) attempts.delete(key);
    lastSweep = now();
  };

  const current = (key: string) => {
    if (now() - lastSweep >= windowMs) sweep();
    const entry = attempts.get(key);
    if (entry && expired(entry)) {
      attempts.delete(key);
      return undefined;
    }
    return entry;
  };

  const open = (key: string) => {
    if (attempts.size >= maxBuckets) sweep();
    // Map iteration follows insertion order, so the first key is the oldest window.
    while (attempts.size >= maxBuckets) {
      const oldest = attempts.keys().next().value;
      if (oldest === undefined) break;
      attempts.delete(oldest);
    }
    attempts.set(key, { count: 1, windowStart: now() });
  };

  return {
    /** Reserves one attempt; refuses once the window already holds `maxFailures` attempts. */
    consume(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
      const entry = current(key);
      if (!entry) {
        open(key);
        return { allowed: true };
      }
      if (entry.count >= maxFailures) {
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil((entry.windowStart + windowMs - now()) / 1000),
        };
      }
      entry.count += 1;
      return { allowed: true };
    },
    reset(key: string) {
      attempts.delete(key);
    },
    /** Tracked buckets (for tests and diagnostics). */
    size: () => attempts.size,
  };
}

export type LoginRateLimiter = ReturnType<typeof createLoginRateLimiter>;
