import { addDays, addMonths, addWeeks, isSameDay } from "date-fns";

import {
  getCalendarPageDate,
  getCalendarViewAnimationKey,
  getPrefetchCalendarDateRange,
  getSurroundingCalendarDateRange,
  getThreeDayCalendarDays,
  getTimezoneAwareCalendarDateRange,
  navigateCalendarDate,
} from "../calendar-navigation";
import { getZonedDayUtcBounds, resolveTimezone } from "../timezone";

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
