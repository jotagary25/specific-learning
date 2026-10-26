// Calendar math in a user's IANA time zone. The process runs in UTC and never reads its own
// `TZ`: every local day, hour or week comes from here, for the zone the user picked in
// Settings. Pure (Intl only), DST-correct.

import { canonicalTimeZone, DEFAULT_TIME_ZONE, isTimeZone } from "@english-course/shared";

export { DEFAULT_TIME_ZONE, isTimeZone };

/** Wall-clock fields of an instant in a zone; `weekday` 0 = Sunday … 6 = Saturday. */
export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  const cached = formatters.get(zone);
  if (cached) return cached;
  if (!canonicalTimeZone(zone)) throw new RangeError(`Invalid time zone: ${zone}`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  formatters.set(zone, formatter);
  return formatter;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Weekday of a calendar date, 0 = Sunday. */
const weekdayOf = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day)).getUTCDay();

export function localParts(instant: Date, zone: string): LocalParts {
  const fields: Record<string, number> = {};
  for (const part of formatterFor(zone).formatToParts(instant)) {
    if (part.type !== "literal") fields[part.type] = Number(part.value);
  }
  const year = fields.year ?? 1970;
  const month = fields.month ?? 1;
  const day = fields.day ?? 1;
  return {
    year,
    month,
    day,
    hour: fields.hour ?? 0,
    minute: fields.minute ?? 0,
    second: fields.second ?? 0,
    weekday: weekdayOf(year, month, day),
  };
}

/** YYYY-MM-DD of `instant` in `zone`. */
export function localDate(instant: Date, zone: string): string {
  const p = localParts(instant, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** YYYY-MM of `instant` in `zone`. */
export const localMonth = (instant: Date, zone: string): string =>
  localDate(instant, zone).slice(0, 7);

export const localHour = (instant: Date, zone: string): number => localParts(instant, zone).hour;

/** 0 = Sunday … 6 = Saturday, in `zone`. */
export const localWeekday = (instant: Date, zone: string): number =>
  localParts(instant, zone).weekday;

/** Wall time of `instant` in `zone` read as if it were UTC, minus the instant: the offset. */
function offsetMs(instant: number, zone: string): number {
  const p = localParts(new Date(instant), zone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant of a local wall time in `zone` (month 1–12). A wall time repeated by a DST
 * fall-back resolves to its first occurrence; one skipped by a spring-forward moves ahead by
 * the gap (local midnight that does not exist → 01:00).
 */
export function zonedTime(
  zone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // Offsets a day either side cover any single transition near the wall time.
  const offsets = [...new Set([offsetMs(wall - DAY_MS, zone), offsetMs(wall + DAY_MS, zone)])];
  const valid = offsets
    .map((offset) => wall - offset)
    .filter((t) => offsetMs(t, zone) === wall - t)
    .sort((a, b) => a - b);
  const first = valid[0];
  if (first !== undefined) return new Date(first);
  // Skipped wall time: shift by the offset before the gap.
  return new Date(wall - Math.min(...offsets));
}

const parseDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
};

/** Adds calendar days to a YYYY-MM-DD day (zone-free). */
export function addDays(day: string, days: number): string {
  const { y, m, d } = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whether a YYYY-MM-DD string is a real calendar day. */
export const isCalendarDay = (day: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(day) && addDays(day, 0) === day;

/** The instant a YYYY-MM-DD day starts in `zone`. */
export function startOfDay(day: string, zone: string): Date {
  const { y, m, d } = parseDay(day);
  return zonedTime(zone, y, m, d);
}

/** Start of the local day that contains `instant`. */
export const startOfLocalDay = (instant: Date, zone: string): Date =>
  startOfDay(localDate(instant, zone), zone);

/** Start of the local day after the one that contains `instant`. */
export const endOfLocalDay = (instant: Date, zone: string): Date =>
  startOfDay(addDays(localDate(instant, zone), 1), zone);

/** Whole local calendar days from `earlier` to `later` (negative when reversed). */
export function localDaysBetween(earlier: Date, later: Date, zone: string): number {
  const a = parseDay(localDate(earlier, zone));
  const b = parseDay(localDate(later, zone));
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
}

/** Local Monday (YYYY-MM-DD) of the week that contains `instant`. */
export function weekStart(instant: Date, zone: string): string {
  const offset = (localWeekday(instant, zone) + 6) % 7; // Monday = 0
  return addDays(localDate(instant, zone), -offset);
}

export const startOfWeek = (instant: Date, zone: string): Date =>
  startOfDay(weekStart(instant, zone), zone);

/** [start, end) of a YYYY-MM month in `zone`. */
export function monthRange(month: string, zone: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const year = y ?? 1970;
  const index = (m ?? 1) - 1;
  const next = new Date(Date.UTC(year, index + 1, 1));
  return {
    start: zonedTime(zone, year, index + 1, 1),
    end: zonedTime(zone, next.getUTCFullYear(), next.getUTCMonth() + 1, 1),
  };
}

/** The month before a YYYY-MM month. */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 2, 1)).toISOString().slice(0, 7);
}

/** e.g. "October 2026" (zone-free: a month key is already local). */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
