// Calendar helpers in server-local time (the process `TZ`).

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD of `date` in local time. */
export const localDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Adds days to a YYYY-MM-DD date (calendar arithmetic, DST-safe). */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

/** The next local `hour:00` strictly after `now`. */
export function nextRunAt(now: Date, hour: number): Date {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
    next.setHours(hour, 0, 0, 0);
  }
  return next;
}
