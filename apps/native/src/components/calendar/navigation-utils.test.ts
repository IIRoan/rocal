import { addMonths, addWeeks, addDays, isSameDay } from "date-fns";
import {
  getCalendarPageDate,
  getPrefetchCalendarDateRange,
  getSurroundingCalendarDateRange,
  getTimezoneAwareCalendarDateRange,
  navigateCalendarDate,
} from "@workspace/calendar-core";
import { getZonedDayUtcBounds, resolveTimezone } from "@workspace/calendar-core";

describe("navigateCalendarDate", () => {
  const baseDate = new Date(2025, 0, 15);

  describe("month view", () => {
    it("advances by 1 month when direction is forward", () => {
      const result = navigateCalendarDate(baseDate, "month", 1);
      expect(isSameDay(result, addMonths(baseDate, 1))).toBe(true);
    });

    it("subtracts 1 month when direction is backward", () => {
      const result = navigateCalendarDate(baseDate, "month", -1);
      expect(isSameDay(result, addMonths(baseDate, -1))).toBe(true);
    });
  });

  describe("week view", () => {
    it("advances by 1 week when direction is forward", () => {
      const result = navigateCalendarDate(baseDate, "week", 1);
      expect(isSameDay(result, addWeeks(baseDate, 1))).toBe(true);
    });

    it("subtracts 1 week when direction is backward", () => {
      const result = navigateCalendarDate(baseDate, "week", -1);
      expect(isSameDay(result, addWeeks(baseDate, -1))).toBe(true);
    });
  });

  describe("day view", () => {
    it("advances by 1 day when direction is forward", () => {
      const result = navigateCalendarDate(baseDate, "day", 1);
      expect(isSameDay(result, addDays(baseDate, 1))).toBe(true);
    });

    it("subtracts 1 day when direction is backward", () => {
      const result = navigateCalendarDate(baseDate, "day", -1);
      expect(isSameDay(result, addDays(baseDate, -1))).toBe(true);
    });
  });

  describe("3day view", () => {
    it("advances by 3 days when direction is forward", () => {
      const result = navigateCalendarDate(baseDate, "3day", 1);
      expect(isSameDay(result, addDays(baseDate, 3))).toBe(true);
    });

    it("subtracts 3 days when direction is backward", () => {
      const result = navigateCalendarDate(baseDate, "3day", -1);
      expect(isSameDay(result, addDays(baseDate, -3))).toBe(true);
    });
  });

  describe("agenda view", () => {
    it("advances by 1 month when direction is forward", () => {
      const result = navigateCalendarDate(baseDate, "agenda", 1);
      expect(isSameDay(result, addMonths(baseDate, 1))).toBe(true);
    });

    it("subtracts 1 month when direction is backward", () => {
      const result = navigateCalendarDate(baseDate, "agenda", -1);
      expect(isSameDay(result, addMonths(baseDate, -1))).toBe(true);
    });
  });
});

describe("getCalendarPageDate", () => {
  const baseDate = new Date(2025, 0, 15);

  it("subtracts multiple 3-day pages at once", () => {
    const result = getCalendarPageDate(baseDate, "3day", -2);
    expect(isSameDay(result, addDays(baseDate, -6))).toBe(true);
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

describe("getTimezoneAwareCalendarDateRange", () => {
  it("returns a three-day zoned window centered on the base date", () => {
    const baseDate = new Date(2026, 5, 16);
    const range = getTimezoneAwareCalendarDateRange({
      baseDate,
      view: "3day",
      timezone: "Europe/Amsterdam",
    });

    expect(range.start).toEqual(
      getZonedDayUtcBounds(addDays(baseDate, -1), "Europe/Amsterdam").start,
    );
    expect(range.end).toEqual(
      getZonedDayUtcBounds(addDays(baseDate, 1), "Europe/Amsterdam").end,
    );
  });
});

describe("getPrefetchCalendarDateRange", () => {
  it("prefetches the adjacent 3-day page", () => {
    const baseDate = new Date(2026, 5, 16);
    const range = getPrefetchCalendarDateRange({
      currentDate: baseDate,
      view: "3day",
      direction: 1,
      timezone: "Europe/Amsterdam",
    });

    expect(range).toEqual(
      getTimezoneAwareCalendarDateRange({
        baseDate: addDays(baseDate, 3),
        view: "3day",
        timezone: "Europe/Amsterdam",
      }),
    );
  });
});
