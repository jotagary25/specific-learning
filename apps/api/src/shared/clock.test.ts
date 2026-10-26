import { describe, expect, it } from "vitest";
import {
  addDays,
  isTimeZone,
  localDate,
  localDaysBetween,
  localHour,
  localMonth,
  localWeekday,
  monthLabel,
  monthRange,
  previousMonth,
  startOfDay,
  startOfLocalDay,
  startOfWeek,
  weekStart,
  zonedTime,
} from "./clock.ts";

const LA_PAZ = "America/La_Paz"; // UTC-4, no DST
const SANTIAGO = "America/Santiago"; // UTC-4 winter, UTC-3 summer, transitions at local 24:00
const KATHMANDU = "Asia/Kathmandu"; // UTC+5:45

const utc = (iso: string) => new Date(iso);

describe("clock", () => {
  it("reads the local date, hour and weekday of an instant in a zone", () => {
    const instant = utc("2026-10-26T02:30:00Z"); // Monday 02:30 UTC
    expect(localDate(instant, "UTC")).toBe("2026-10-26");
    expect(localHour(instant, "UTC")).toBe(2);
    expect(localWeekday(instant, "UTC")).toBe(1);

    expect(localDate(instant, LA_PAZ)).toBe("2026-10-25"); // Sunday 22:30
    expect(localHour(instant, LA_PAZ)).toBe(22);
    expect(localWeekday(instant, LA_PAZ)).toBe(0);

    expect(localDate(instant, KATHMANDU)).toBe("2026-10-26"); // 08:15
    expect(localHour(instant, KATHMANDU)).toBe(8);
    expect(localHour(utc("2026-10-26T18:15:00Z"), KATHMANDU)).toBe(0); // local midnight
    expect(localDate(utc("2026-10-26T18:15:00Z"), KATHMANDU)).toBe("2026-10-27");
  });

  it("converts local wall time to the right instant", () => {
    expect(zonedTime(LA_PAZ, 2026, 10, 26, 9).toISOString()).toBe("2026-10-26T13:00:00.000Z");
    expect(zonedTime(KATHMANDU, 2026, 10, 26).toISOString()).toBe("2026-10-25T18:15:00.000Z");
    expect(zonedTime("UTC", 2026, 1, 1).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    // Santiago summer time (UTC-3) vs winter time (UTC-4).
    expect(zonedTime(SANTIAGO, 2026, 1, 15, 12).toISOString()).toBe("2026-01-15T15:00:00.000Z");
    expect(zonedTime(SANTIAGO, 2026, 7, 15, 12).toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });

  it("starts local days at local midnight, also across DST transitions", () => {
    expect(startOfDay("2026-10-26", LA_PAZ).toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(startOfDay("2026-10-26", "UTC").toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(startOfDay("2026-10-26", KATHMANDU).toISOString()).toBe("2026-10-25T18:15:00.000Z");

    // Santiago springs forward on 2026-09-06: local midnight does not exist, the day starts
    // at 01:00 (UTC-3).
    expect(startOfDay("2026-09-06", SANTIAGO).toISOString()).toBe("2026-09-06T04:00:00.000Z");
    expect(startOfDay("2026-09-05", SANTIAGO).toISOString()).toBe("2026-09-05T04:00:00.000Z");
    // That day lasts 23 hours.
    expect(
      startOfDay("2026-09-07", SANTIAGO).getTime() - startOfDay("2026-09-06", SANTIAGO).getTime(),
    ).toBe(23 * 3_600_000);

    // Santiago falls back on 2026-04-05 (24:00 → 23:00 on the 4th): the 4th lasts 25 hours.
    expect(startOfDay("2026-04-04", SANTIAGO).toISOString()).toBe("2026-04-04T03:00:00.000Z");
    expect(startOfDay("2026-04-05", SANTIAGO).toISOString()).toBe("2026-04-05T04:00:00.000Z");

    expect(startOfLocalDay(utc("2026-10-26T02:30:00Z"), LA_PAZ).toISOString()).toBe(
      "2026-10-25T04:00:00.000Z",
    );
  });

  it("counts whole local calendar days between instants", () => {
    const a = utc("2026-10-25T23:00:00Z"); // La Paz 19:00 on the 25th
    const b = utc("2026-10-26T05:00:00Z"); // La Paz 01:00 on the 26th
    expect(localDaysBetween(a, b, LA_PAZ)).toBe(1);
    expect(localDaysBetween(a, b, "UTC")).toBe(1);
    expect(localDaysBetween(utc("2026-10-26T04:30:00Z"), b, LA_PAZ)).toBe(0);
    // Across Santiago's spring-forward day.
    expect(
      localDaysBetween(
        zonedTime(SANTIAGO, 2026, 9, 5, 12),
        zonedTime(SANTIAGO, 2026, 9, 7, 12),
        SANTIAGO,
      ),
    ).toBe(2);
  });

  it("finds the local Monday of the week", () => {
    const sunday = utc("2026-11-02T02:00:00Z"); // UTC Monday, La Paz Sunday 22:00
    expect(weekStart(sunday, "UTC")).toBe("2026-11-02");
    expect(weekStart(sunday, LA_PAZ)).toBe("2026-10-26");
    expect(startOfWeek(sunday, LA_PAZ).toISOString()).toBe("2026-10-26T04:00:00.000Z");
  });

  it("bounds months in the zone", () => {
    expect(localMonth(utc("2026-11-01T02:00:00Z"), "UTC")).toBe("2026-11");
    expect(localMonth(utc("2026-11-01T02:00:00Z"), LA_PAZ)).toBe("2026-10");
    const range = monthRange("2026-10", LA_PAZ);
    expect(range.start.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    // Santiago's September starts in winter time and ends in summer time.
    const sept = monthRange("2026-09", SANTIAGO);
    expect(sept.start.toISOString()).toBe("2026-09-01T04:00:00.000Z");
    expect(sept.end.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(monthLabel("2026-10")).toBe("October 2026");
  });

  it("adds calendar days", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("accepts IANA zone names and rejects anything else", () => {
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone(LA_PAZ)).toBe(true);
    expect(isTimeZone(KATHMANDU)).toBe(true);
    expect(isTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isTimeZone("+05:00")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(() => localDate(new Date(), "Mars/Olympus_Mons")).toThrow(/time zone/i);
  });
});
