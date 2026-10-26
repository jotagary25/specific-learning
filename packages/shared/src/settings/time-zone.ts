import { z } from "zod";

/** The instance runs in UTC; users who never picked a zone see their days in UTC too. */
export const DEFAULT_TIME_ZONE = "UTC";

// IANA names only ("America/La_Paz", "UTC", "Etc/GMT+4"): offset strings such as "+05:00",
// which `Intl` also accepts, are not zones.
const IANA_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

/** The canonical spelling of an IANA zone name, or `undefined` when it is not one. */
export function canonicalTimeZone(name: string): string | undefined {
  if (!IANA_NAME.test(name)) return undefined;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export const isTimeZone = (name: string): boolean => canonicalTimeZone(name) !== undefined;

/** An IANA time zone name, normalized to its canonical spelling. */
export const TimeZone = z.string().transform((name, ctx) => {
  const canonical = canonicalTimeZone(name);
  if (canonical) return canonical;
  ctx.addIssue({ code: "custom", message: `"${name}" is not an IANA time zone` });
  return z.NEVER;
});
