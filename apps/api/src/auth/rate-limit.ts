/** In-memory fixed-window limiter for failed logins (single process, single user). */
export function createLoginRateLimiter({
  maxFailures = 5,
  windowMs = 15 * 60_000,
  now = Date.now,
}: {
  maxFailures?: number;
  windowMs?: number;
  now?: () => number;
} = {}) {
  const failures = new Map<string, { count: number; windowStart: number }>();

  const current = (key: string) => {
    const entry = failures.get(key);
    if (entry && now() - entry.windowStart >= windowMs) {
      failures.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    check(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
      const entry = current(key);
      if (!entry || entry.count < maxFailures) return { allowed: true };
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((entry.windowStart + windowMs - now()) / 1000),
      };
    },
    fail(key: string) {
      const entry = current(key);
      if (entry) entry.count += 1;
      else failures.set(key, { count: 1, windowStart: now() });
    },
    reset(key: string) {
      failures.delete(key);
    },
  };
}

export type LoginRateLimiter = ReturnType<typeof createLoginRateLimiter>;
