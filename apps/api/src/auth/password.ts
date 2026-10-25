import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time comparison: both sides are hashed first so lengths never leak. */
export function passwordMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) && given.length > 0;
}
