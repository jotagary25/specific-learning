// Calendar helpers in server-local time (the process `TZ`), like the other features.

const pad = (n: number) => String(n).padStart(2, "0");

const DAY_MS = 86_400_000;

/** YYYY-MM-DD of `date` in local time. */
export const localDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** YYYY-MM of `date` in local time. */
export const monthOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

/** Local midnight of a YYYY-MM-DD day. */
export function startOfDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Adds calendar days to a YYYY-MM-DD day. */
export function addDays(day: string, days: number): string {
  const date = startOfDay(day);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

/** Local Monday (YYYY-MM-DD) of the week that contains `date`. */
export function weekStart(date: Date): string {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (day.getDay() + 6) % 7; // Monday = 0
  day.setDate(day.getDate() - offset);
  return localDate(day);
}

/** [start, end) of a YYYY-MM month in local time. */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(y ?? 1970, (m ?? 1) - 1, 1),
    end: new Date(y ?? 1970, m ?? 1, 1),
  };
}

/** The month before a YYYY-MM month. */
export function previousMonth(month: string): string {
  const { start } = monthRange(month);
  return monthOf(new Date(start.getFullYear(), start.getMonth() - 1, 1));
}

/** e.g. "October 2026". */
export const monthLabel = (month: string): string =>
  monthRange(month).start.toLocaleDateString("en-US", { month: "long", year: "numeric" });

/** Whole days between two instants (floor, never negative). */
export const daysBetween = (from: Date, to: Date): number =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
