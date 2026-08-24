import { addDays } from "date-fns";
import { describe, expect, it } from "@jest/globals";

import {
  DEFAULT_CALENDAR_TIMEZONE,
  eventOverlapsZonedCalendarDay,
  comparePickerDays,
  formatCalendarDayKey,
  formatCalendarMonthKey,
  formatCalendarWeekKey,
  formatInUserTimezone,
  formatInstantCalendarDayKey,
  formatInstantCalendarMonthKey,
  formatWallClockTime,
  getInclusiveCalendarDayRange,
  getWeekCalendarDays,
  getWeekCalendarRange,
  getZonedDateParts,
  getZonedDayUtcBounds,
  isSameCalendarDayInTimezone,
  isTodayInTimezone,
  parseCalendarDayKey,
  pickerDateAndTimeToUtc,
  pickerDateToAllDayUtcRange,
  resolveTimezone,
  utcToPickerDate,
  wallClockFromCalendarDayKey,
  wallClockToUtc,
  zonedDateTimeToUtc,
} from "../timezone";

describe("resolveTimezone", () => {
  it("defaults to Amsterdam when no timezone is configured", () => {
    expect(resolveTimezone()).toBe(DEFAULT_CALENDAR_TIMEZONE);
    expect(resolveTimezone(null)).toBe(DEFAULT_CALENDAR_TIMEZONE);
    expect(resolveTimezone("")).toBe(DEFAULT_CALENDAR_TIMEZONE);
    expect(resolveTimezone("   ")).toBe(DEFAULT_CALENDAR_TIMEZONE);
  });

  it("returns trimmed configured timezones", () => {
    expect(resolveTimezone("  America/New_York  ")).toBe("America/New_York");
    expect(resolveTimezone("Europe/Paris")).toBe("Europe/Paris");
  });
});

describe("getZonedDateParts", () => {
  it("reads wall-clock parts in the configured timezone", () => {
    const instant = new Date("2026-06-16T22:30:00.000Z");

    expect(getZonedDateParts(instant, "Europe/Amsterdam")).toEqual({
      year: 2026,
      month: 6,
      day: 17,
      hours: 0,
      minutes: 30,
      seconds: 0,
    });
    expect(getZonedDateParts(instant, "America/New_York")).toEqual({
      year: 2026,
      month: 6,
      day: 16,
      hours: 18,
      minutes: 30,
      seconds: 0,
    });
  });
});

describe("wall-clock to UTC conversions", () => {
  it("converts wall-clock times in a configured timezone to UTC", () => {
    const calendarDay = new Date(2026, 5, 16);
    const utc = wallClockToUtc(calendarDay, 9, 30, "America/New_York");

    expect(utc.toISOString()).toBe("2026-06-16T13:30:00.000Z");
    expect(formatWallClockTime(utc, "America/New_York")).toBe("09:30");
  });

  it("converts zoned date parts directly to UTC", () => {
    const utc = zonedDateTimeToUtc(
      { year: 2026, month: 6, day: 16, hours: 14, minutes: 15, seconds: 30 },
      "Europe/Amsterdam",
    );

    expect(formatWallClockTime(utc, "Europe/Amsterdam")).toBe("14:15");
    expect(getZonedDateParts(utc, "Europe/Amsterdam").seconds).toBe(30);
  });

  it("maps UTC instants back to picker dates in the configured timezone", () => {
    const utc = new Date("2026-06-16T22:30:00.000Z");
    const pickerDate = utcToPickerDate(utc, "Europe/Amsterdam");

    expect(pickerDate.getFullYear()).toBe(2026);
    expect(pickerDate.getMonth()).toBe(5);
    expect(pickerDate.getDate()).toBe(17);
    expect(formatWallClockTime(utc, "Europe/Amsterdam")).toBe("00:30");
  });

  it("builds UTC instants from picker date and HH:mm strings", () => {
    const pickerDate = new Date(2026, 5, 16);
    const utc = pickerDateAndTimeToUtc(pickerDate, "14:15", "Europe/Amsterdam");

    expect(formatWallClockTime(utc, "Europe/Amsterdam")).toBe("14:15");
  });

  it("defaults missing HH:mm segments to midnight", () => {
    const pickerDate = new Date(2026, 5, 16);
    const utc = pickerDateAndTimeToUtc(pickerDate, "", "Europe/Amsterdam");

    expect(formatWallClockTime(utc, "Europe/Amsterdam")).toBe("00:00");
  });
});

describe("all-day UTC ranges", () => {
  it("covers a single picker day from midnight through 23:59:59", () => {
    const pickerDay = new Date(2026, 5, 16);
    const range = pickerDateToAllDayUtcRange(
      pickerDay,
      pickerDay,
      "Europe/Amsterdam",
    );

    expect(range.start.toISOString()).toBe("2026-06-15T22:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-06-16T21:59:59.000Z");
  });

  it("spans inclusive picker start and end days", () => {
    const range = pickerDateToAllDayUtcRange(
      new Date(2026, 5, 16),
      new Date(2026, 5, 17),
      "Europe/Amsterdam",
    );

    expect(range.start.toISOString()).toBe("2026-06-15T22:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-06-17T21:59:59.000Z");
  });
});

describe("calendar day membership", () => {
  it("compares calendar days using the configured timezone", () => {
    const instant = new Date("2026-06-16T22:00:00.000Z");
    const calendarDay = new Date(2026, 5, 17);

    expect(
      isSameCalendarDayInTimezone(instant, calendarDay, "Europe/Amsterdam"),
    ).toBe(true);
    expect(
      isSameCalendarDayInTimezone(instant, calendarDay, "America/Los_Angeles"),
    ).toBe(false);
  });

  it("detects today in the configured timezone", () => {
    const timezone = "Europe/Amsterdam";
    const today = utcToPickerDate(new Date(), timezone);

    expect(isTodayInTimezone(today, timezone)).toBe(true);
    expect(isTodayInTimezone(addDays(today, -1), timezone)).toBe(false);
    expect(isTodayInTimezone(addDays(today, 1), timezone)).toBe(false);
  });
});

describe("getZonedDayUtcBounds", () => {
  it("uses half-open day intervals in the configured timezone", () => {
    const calendarDay = new Date(2026, 5, 16);
    const bounds = getZonedDayUtcBounds(calendarDay, "Europe/Amsterdam");

    expect(bounds.start.toISOString()).toBe("2026-06-15T22:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-06-16T22:00:00.000Z");
  });

  it("respects US Pacific offsets in winter", () => {
    const calendarDay = new Date(2026, 0, 15);
    const bounds = getZonedDayUtcBounds(calendarDay, "America/Los_Angeles");

    expect(bounds.start.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-01-16T08:00:00.000Z");
  });
});

describe("eventOverlapsZonedCalendarDay", () => {
  const calendarDay = new Date(2026, 5, 17);
  const timezone = "Europe/Amsterdam";

  it("includes events that start after local midnight", () => {
    const eventStart = new Date("2026-06-16T22:30:00.000Z");
    const eventEnd = new Date("2026-06-16T23:30:00.000Z");

    expect(
      eventOverlapsZonedCalendarDay(
        eventStart,
        eventEnd,
        calendarDay,
        timezone,
      ),
    ).toBe(true);
  });

  it("excludes events that end exactly at local midnight", () => {
    const eventStart = new Date("2026-06-16T20:00:00.000Z");
    const eventEnd = new Date("2026-06-16T22:00:00.000Z");

    expect(
      eventOverlapsZonedCalendarDay(
        eventStart,
        eventEnd,
        calendarDay,
        timezone,
      ),
    ).toBe(false);
  });

  it("includes multi-day events that span the calendar day", () => {
    const eventStart = new Date("2026-06-16T10:00:00.000Z");
    const eventEnd = new Date("2026-06-18T10:00:00.000Z");

    expect(
      eventOverlapsZonedCalendarDay(
        eventStart,
        eventEnd,
        calendarDay,
        timezone,
      ),
    ).toBe(true);
  });
});

describe("week calendar days", () => {
  it("builds week columns from the configured timezone", () => {
    const currentDate = new Date("2026-06-17T01:00:00.000Z");
    const days = getWeekCalendarDays(currentDate, 1, "Europe/Amsterdam");

    expect(days).toHaveLength(7);
    expect(days[0]?.getDay()).toBe(1);
    expect(days.some((day) => day.getDate() === 17)).toBe(true);
  });

  it("honors Sunday week starts", () => {
    const days = getWeekCalendarDays(
      new Date(2026, 5, 17),
      0,
      "Europe/Amsterdam",
    );

    expect(days[0]?.getDay()).toBe(0);
    expect(days[0]?.getDate()).toBe(14);
    expect(days[6]?.getDate()).toBe(20);
  });

  it("keeps the week range on the zoned calendar day across UTC week boundaries", () => {
    const currentDate = new Date("2026-08-23T22:30:00.000Z");
    const { start, end } = getWeekCalendarRange(
      currentDate,
      1,
      "Europe/Amsterdam",
    );

    expect(start.getDate()).toBe(24);
    expect(end.getDate()).toBe(30);
  });

  it("normalizes negative week start offsets", () => {
    const days = getWeekCalendarDays(
      new Date(2026, 5, 17),
      -1,
      "Europe/Amsterdam",
    );

    expect(days[0]?.getDay()).toBe(6);
  });
});

describe("comparePickerDays", () => {
  it("orders picker dates by calendar day, not time of day", () => {
    const morning = new Date(2026, 7, 26, 8, 0);
    const evening = new Date(2026, 7, 26, 21, 0);
    const next = new Date(2026, 7, 27, 0, 0);

    expect(comparePickerDays(morning, evening)).toBe(0);
    expect(comparePickerDays(morning, next)).toBeLessThan(0);
    expect(comparePickerDays(next, evening)).toBeGreaterThan(0);
  });
});

describe("calendar key helpers", () => {
  it("formats stable day and month keys from picker dates", () => {
    expect(formatCalendarDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatCalendarMonthKey(new Date(2026, 0, 1))).toBe("2026-01");
    expect(formatCalendarMonthKey(new Date(2026, 10, 30))).toBe("2026-11");
  });

  it("formats week keys from timezone-aware week boundaries", () => {
    expect(
      formatCalendarWeekKey(new Date(2026, 5, 17), 1, "Europe/Amsterdam"),
    ).toBe("2026-06-15:2026-06-21");
  });

  it("formats instant day and month keys in the configured timezone", () => {
    const instant = new Date("2026-06-16T22:30:00.000Z");

    expect(formatInstantCalendarDayKey(instant, "Europe/Amsterdam")).toBe(
      "2026-06-17",
    );
    expect(formatInstantCalendarMonthKey(instant, "Europe/Amsterdam")).toBe(
      "2026-06",
    );
    expect(formatInstantCalendarDayKey(instant)).toBe("2026-06-17");
  });

  it("formats arbitrary patterns through formatInUserTimezone", () => {
    const instant = new Date("2026-06-16T13:30:00.000Z");

    expect(
      formatInUserTimezone(instant, "America/New_York", "yyyy-MM-dd HH:mm"),
    ).toBe("2026-06-16 09:30");
  });
});

describe("parseCalendarDayKey", () => {
  it("parses valid YYYY-MM-DD keys into local picker dates", () => {
    const parsed = parseCalendarDayKey("2026-06-16");

    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(5);
    expect(parsed?.getDate()).toBe(16);
  });

  it("returns null for malformed keys", () => {
    expect(parseCalendarDayKey("2026/06/16")).toBeNull();
    expect(parseCalendarDayKey("not-a-date")).toBeNull();
    expect(parseCalendarDayKey("2026-06")).toBeNull();
  });
});

describe("wallClockFromCalendarDayKey", () => {
  it("parses calendar day keys for timeline clicks", () => {
    const utc = wallClockFromCalendarDayKey(
      "2026-06-16",
      7,
      15,
      "America/New_York",
    );

    expect(utc?.toISOString()).toBe("2026-06-16T11:15:00.000Z");
    expect(getZonedDateParts(utc!, "America/New_York").hours).toBe(7);
  });

  it("returns null when the day key is invalid", () => {
    expect(
      wallClockFromCalendarDayKey("invalid", 9, 0, "Europe/Amsterdam"),
    ).toBeNull();
  });
});

describe("timezone UX round-trips", () => {
  const timezone = "Europe/Amsterdam";

  it("preserves wall-clock time when converting picker values to UTC and back", () => {
    const pickerDate = new Date(2026, 5, 16);
    const wallClock = "14:30";
    const utc = pickerDateAndTimeToUtc(pickerDate, wallClock, timezone);

    expect(utcToPickerDate(utc, timezone).getDate()).toBe(16);
    expect(formatWallClockTime(utc, timezone)).toBe("14:30");
  });

  it("shows the next picker day for late-evening UTC instants in Amsterdam", () => {
    const utc = new Date("2026-06-16T22:15:00.000Z");

    expect(utcToPickerDate(utc, timezone).getDate()).toBe(17);
    expect(formatWallClockTime(utc, timezone)).toBe("00:15");
    expect(formatInstantCalendarDayKey(utc, timezone)).toBe("2026-06-17");
  });

  it("maps timeline slot clicks to the intended wall-clock instant", () => {
    const utc = wallClockFromCalendarDayKey("2026-06-17", 9, 0, timezone);

    expect(utc?.toISOString()).toBe("2026-06-17T07:00:00.000Z");
    expect(formatWallClockTime(utc!, timezone)).toBe("09:00");
    expect(
      isSameCalendarDayInTimezone(utc!, new Date(2026, 5, 17), timezone),
    ).toBe(true);
  });

  it("keeps all-day picker days inclusive after UTC conversion", () => {
    const range = pickerDateToAllDayUtcRange(
      new Date(2026, 5, 16),
      new Date(2026, 5, 18),
      timezone,
    );

    expect(
      eventOverlapsZonedCalendarDay(
        range.start,
        range.end,
        new Date(2026, 5, 16),
        timezone,
      ),
    ).toBe(true);
    expect(
      eventOverlapsZonedCalendarDay(
        range.start,
        range.end,
        new Date(2026, 5, 18),
        timezone,
      ),
    ).toBe(true);
    expect(
      eventOverlapsZonedCalendarDay(
        range.start,
        range.end,
        new Date(2026, 5, 19),
        timezone,
      ),
    ).toBe(false);
  });
});

describe("getInclusiveCalendarDayRange", () => {
  const timezone = "Europe/Amsterdam";
  const friday = new Date(2026, 5, 19);
  const saturday = new Date(2026, 5, 20);

  it("treats a single-day all-day event as one inclusive picker day", () => {
    const { firstDay, lastDay } = getInclusiveCalendarDayRange(
      new Date("2026-06-19T22:00:00.000Z"),
      new Date("2026-06-20T22:00:00.000Z"),
      timezone,
      { allDay: true },
    );

    expect(firstDay).toEqual(new Date(2026, 5, 20));
    expect(lastDay).toEqual(new Date(2026, 5, 20));
  });

  it("covers Friday through Monday for a multi-day all-day event", () => {
    const { firstDay, lastDay } = getInclusiveCalendarDayRange(
      new Date("2026-06-19T22:00:00.000Z"),
      new Date("2026-06-22T22:00:00.000Z"),
      timezone,
      { allDay: true },
    );

    expect(firstDay).toEqual(new Date(2026, 5, 20));
    expect(lastDay).toEqual(new Date(2026, 5, 22));
  });

  it("keeps a Friday-only all-day event on Friday when stored at UTC midnight boundaries", () => {
    const { firstDay, lastDay } = getInclusiveCalendarDayRange(
      new Date("2026-06-19T00:00:00.000Z"),
      new Date("2026-06-20T00:00:00.000Z"),
      timezone,
      { allDay: true },
    );

    expect(firstDay).toEqual(friday);
    expect(lastDay).toEqual(friday);
  });

  it("keeps a Friday-only all-day event on Friday with zoned exclusive midnight end", () => {
    const { firstDay, lastDay } = getInclusiveCalendarDayRange(
      new Date("2026-06-18T22:00:00.000Z"),
      new Date("2026-06-19T22:00:00.000Z"),
      timezone,
      { allDay: true },
    );

    expect(firstDay).toEqual(friday);
    expect(lastDay).toEqual(friday);
  });

  it("keeps a Friday-only all-day event on Friday with inclusive 23:59:59 end", () => {
    const { firstDay, lastDay } = getInclusiveCalendarDayRange(
      new Date("2026-06-18T22:00:00.000Z"),
      new Date("2026-06-19T21:59:59.000Z"),
      timezone,
      { allDay: true },
    );

    expect(firstDay).toEqual(friday);
    expect(lastDay).toEqual(friday);
  });

  it("covers inclusive picker end days from pickerDateToAllDayUtcRange", () => {
    const range = pickerDateToAllDayUtcRange(
      new Date(2026, 5, 16),
      new Date(2026, 5, 18),
      timezone,
    );
    const { firstDay, lastDay } = getInclusiveCalendarDayRange(
      range.start,
      range.end,
      timezone,
      { allDay: true },
    );

    expect(firstDay).toEqual(new Date(2026, 5, 16));
    expect(lastDay).toEqual(new Date(2026, 5, 18));
  });
});

describe("eventOverlapsZonedCalendarDay all-day semantics", () => {
  const timezone = "Europe/Amsterdam";
  const friday = new Date(2026, 5, 19);
  const saturday = new Date(2026, 5, 20);

  it("includes a Friday all-day event on Friday only when stored at UTC midnight", () => {
    const start = new Date("2026-06-19T00:00:00.000Z");
    const end = new Date("2026-06-20T00:00:00.000Z");

    expect(
      eventOverlapsZonedCalendarDay(start, end, friday, timezone, {
        allDay: true,
      }),
    ).toBe(true);
    expect(
      eventOverlapsZonedCalendarDay(start, end, saturday, timezone, {
        allDay: true,
      }),
    ).toBe(false);
  });

  it("excludes a Friday all-day event from Saturday with raw timed overlap", () => {
    const start = new Date("2026-06-19T00:00:00.000Z");
    const end = new Date("2026-06-20T00:00:00.000Z");

    expect(
      eventOverlapsZonedCalendarDay(start, end, saturday, timezone),
    ).toBe(true);
    expect(
      eventOverlapsZonedCalendarDay(start, end, saturday, timezone, {
        allDay: true,
      }),
    ).toBe(false);
  });
});
