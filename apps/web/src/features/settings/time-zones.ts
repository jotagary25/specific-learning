/** The browser's IANA zone, e.g. "America/La_Paz"; `undefined` when it cannot tell. */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Zones offered in Settings: UTC first, then every zone the browser knows (A–Z). */
export function timeZoneOptions(current?: string): string[] {
  const known =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set(["UTC", ...(current ? [current] : []), ...known])];
}

/** "05:00" for hour 5. */
export const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** The data the Today plan, the SRS queue, reading and progress compute in the user's zone. */
export const ZONED_QUERY_KEYS = [["today"], ["vocabulary"], ["reading"], ["progress"]] as const;
