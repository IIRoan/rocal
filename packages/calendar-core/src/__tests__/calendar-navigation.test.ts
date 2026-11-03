import { addDays, addMonths, addWeeks, isSameDay } from "date-fns";

import {
  getCalendarPageDate,
  getCalendarViewAnimationKey,
  getPrefetchCalendarDateRange,
  getSurroundingCalendarDateRange,
  getThreeDayCalendarDays,
  getTimezoneAwareCalendarDateRange,
  navigateCalendarDate,
  navigateCalendarInstant,
} from "../calendar-navigation";
import {
  formatInstantCalendarDayKey,
  getZonedDayUtcBounds,
  resolveTimezone,
  wallClockToUtc,
} from "../timezone";

// Zones far from any test machine's zone, so browser-local days would land on the wrong day.
const zones = ["Pacific/Pago_Pago", "UTC", "Pacific/Kiritimati"];

describe("getThreeDayCalendarDays", () => {
  it("returns yesterday, center, and tomorrow", () => {
    const baseDate = new Date(2026, 5, 16);
    const [yesterday, center, tomorrow] = getThreeDayCalendarDays(baseDate);

    expect(isSameDay(yesterday, addDays(baseDate, -1))).toBe(true);
    expect(isSameDay(center, baseDate)).toBe(true);
    expect(isSameDay(tomorrow, addDays(baseDate, 1))).toBe(true);
  });
});

describe("navigateCalendarDate", () => {
  const baseDate = new Date(2025, 0, 15);

  it.each([
    ["month", 1, addMonths(baseDate, 1)],
    ["month", -1, addMonths(baseDate, -1)],
    ["week", 1, addWeeks(baseDate, 1)],
    ["week", -1, addWeeks(baseDate, -1)],
    ["day", 1, addDays(baseDate, 1)],
    ["day", -1, addDays(baseDate, -1)],
    ["3day", 1, addDays(baseDate, 3)],
    ["3day", -1, addDays(baseDate, -3)],
    ["agenda", 1, addMonths(baseDate, 1)],
    ["agenda", -1, addMonths(baseDate, -1)],
  ] as const)(
    "moves %s view by direction %s",
    (view, direction, expectedDate) => {
      const result = navigateCalendarDate(baseDate, view, direction);
      expect(isSameDay(result, expectedDate)).toBe(true);
    },
  );
});

describe("getCalendarPageDate", () => {
  const baseDate = new Date(2025, 0, 15);

  it("advances multiple 3-day pages at once", () => {
    expect(isSameDay(getCalendarPageDate(baseDate, "3day", 2), addDays(baseDate, 6))).toBe(
      true,
    );
  });
});

describe("getTimezoneAwareCalendarDateRange", () => {
  const timezone = "Europe/Amsterdam";

  it("returns a single zoned day for day view", () => {
    const calendarDay = new Date(2026, 5, 16);
    const range = getTimezoneAwareCalendarDateRange({
      baseDate: calendarDay,
      view: "day",
      timezone,
    });

    expect(range).toEqual(getZonedDayUtcBounds(calendarDay, timezone));
  });

  it("returns a three-day zoned window centered on the base date", () => {
    const baseDate = new Date(2026, 5, 16);
    const range = getTimezoneAwareCalendarDateRange({
      baseDate,
      view: "3day",
      timezone,
    });

    expect(range.start).toEqual(
      getZonedDayUtcBounds(addDays(baseDate, -1), timezone).start,
    );
    expect(range.end).toEqual(
      getZonedDayUtcBounds(addDays(baseDate, 1), timezone).end,
    );
  });

  it("returns the configured timezone week for week view", () => {
    const range = getTimezoneAwareCalendarDateRange({
      baseDate: new Date(2026, 5, 17),
      view: "week",
      weekStartDay: 1,
      timezone,
    });

    expect(range.start.toISOString()).toBe("2026-06-14T22:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-06-21T22:00:00.000Z");
  });
});

describe("calendar date ranges in the account time zone", () => {
  const daysRange = (firstDay: Date, lastDay: Date, timezone: string) => ({
    start: getZonedDayUtcBounds(firstDay, timezone).start,
    end: getZonedDayUtcBounds(lastDay, timezone).end,
  });
  // Monday Nov 30 2026 ends a month whose Monday-start grid begins on Oct 26.
  const views = [
    ["day", new Date(2026, 10, 30), new Date(2026, 10, 30)],
    ["3day", new Date(2026, 10, 29), new Date(2026, 11, 1)],
    ["week", new Date(2026, 10, 30), new Date(2026, 11, 6)],
    ["month", new Date(2026, 9, 26), new Date(2026, 11, 6)],
    ["agenda", new Date(2026, 10, 30), new Date(2026, 11, 29)],
  ] as const;

  it.each(zones)(
    "covers the %s days around the instant at either end of its day",
    (timezone) => {
      for (const hour of [0, 23]) {
        const baseDate = wallClockToUtc(new Date(2026, 10, 30), hour, 30, timezone);
        for (const [view, firstDay, lastDay] of views) {
          expect(
            getTimezoneAwareCalendarDateRange({
              baseDate,
              view,
              weekStartDay: 1,
              timezone,
            }),
          ).toEqual(daysRange(firstDay, lastDay, timezone));
        }
      }
    },
  );

  it.each(zones)("pages from the %s day of the instant", (timezone) => {
    const currentDate = wallClockToUtc(new Date(2026, 10, 30), 23, 30, timezone);

    expect(
      getPrefetchCalendarDateRange({
        currentDate,
        view: "day",
        direction: 1,
        timezone,
      }),
    ).toEqual(daysRange(new Date(2026, 11, 1), new Date(2026, 11, 1), timezone));
    expect(
      getSurroundingCalendarDateRange({
        currentDate,
        view: "3day",
        pageRadius: 1,
        timezone,
      }),
    ).toEqual(daysRange(new Date(2026, 10, 26), new Date(2026, 11, 4), timezone));
  });
});

describe("getPrefetchCalendarDateRange", () => {
  const timezone = "Europe/Amsterdam";
  const baseDate = new Date(2026, 5, 16);

  it("prefetches the next 3-day window when moving forward", () => {
    const range = getPrefetchCalendarDateRange({
      currentDate: baseDate,
      view: "3day",
      direction: 1,
      timezone,
    });

    expect(range).toEqual(
      getTimezoneAwareCalendarDateRange({
        baseDate: addDays(baseDate, 3),
        view: "3day",
        timezone,
      }),
    );
  });

  it("prefetches the previous 3-day window when moving backward", () => {
    const range = getPrefetchCalendarDateRange({
      currentDate: baseDate,
      view: "3day",
      direction: -1,
      timezone,
    });

    expect(range).toEqual(
      getTimezoneAwareCalendarDateRange({
        baseDate: addDays(baseDate, -3),
        view: "3day",
        timezone,
      }),
    );
  });

  it("prefetches the next single day for day view", () => {
    const range = getPrefetchCalendarDateRange({
      currentDate: baseDate,
      view: "day",
      direction: 1,
      timezone,
    });

    expect(range).toEqual(
      getTimezoneAwareCalendarDateRange({
        baseDate: addDays(baseDate, 1),
        view: "day",
        timezone,
      }),
    );
  });
});

describe("getSurroundingCalendarDateRange", () => {
  const timezone = resolveTimezone();

  it("covers neighboring 3-day pages in the configured timezone", () => {
    const range = getSurroundingCalendarDateRange({
      currentDate: new Date(2025, 0, 15, 12),
      view: "3day",
      pageRadius: 1,
      timezone: "America/New_York",
    });

    expect(range.start).toEqual(
      getZonedDayUtcBounds(new Date(2025, 0, 11), "America/New_York").start,
    );
    expect(range.end).toEqual(
      getZonedDayUtcBounds(new Date(2025, 0, 19), "America/New_York").end,
    );
  });
});

describe("getCalendarViewAnimationKey", () => {
  const baseDate = new Date(2026, 5, 16);

  it("uses the day key for 3-day view so each navigation step animates", () => {
    const first = getCalendarViewAnimationKey("3day", baseDate, 1, "Europe/Amsterdam");
    const next = getCalendarViewAnimationKey(
      "3day",
      addDays(baseDate, 3),
      1,
      "Europe/Amsterdam",
    );

    expect(first).toBe("3day-2026-06-16");
    expect(next).toBe("3day-2026-06-19");
    expect(first).not.toBe(next);
  });

  it("uses the month key for month view", () => {
    expect(getCalendarViewAnimationKey("month", baseDate, 1, "Europe/Amsterdam")).toBe(
      "month-2026-06",
    );
  });
});

describe("navigateCalendarInstant", () => {
  it.each(zones)("pages from the account-zone day in %s", (timezone) => {
    const march1 = wallClockToUtc(new Date(2026, 2, 1), 12, 0, timezone);
    const page = (view: Parameters<typeof navigateCalendarInstant>[1], direction: 1 | -1) =>
      formatInstantCalendarDayKey(
        navigateCalendarInstant(march1, view, direction, timezone),
        timezone,
      );

    expect(page("month", 1)).toBe("2026-04-01");
    expect(page("month", -1)).toBe("2026-02-01");
    expect(page("week", 1)).toBe("2026-03-08");
    expect(page("3day", -1)).toBe("2026-02-26");
    expect(page("day", -1)).toBe("2026-02-28");
    expect(page("agenda", 1)).toBe("2026-03-31");
  });

  it.each(zones)("keeps the day of a late-evening instant in %s", (timezone) => {
    const lateMarch1 = wallClockToUtc(new Date(2026, 2, 1), 23, 30, timezone);
    expect(
      formatInstantCalendarDayKey(
        navigateCalendarInstant(lateMarch1, "month", 1, timezone),
        timezone,
      ),
    ).toBe("2026-04-01");
  });
});
