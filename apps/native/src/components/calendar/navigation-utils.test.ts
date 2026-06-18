import { addMonths, addWeeks, addDays, isSameDay } from "date-fns";
import { getZonedDayUtcBounds, resolveTimezone } from "@workspace/calendar-core";
import {
  getCalendarPageDate,
  getSurroundingCalendarDateRange,
  getTimezoneAwareCalendarDateRange,
  navigateCalendarDate,
} from "./navigation-utils";

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

  describe("edge cases", () => {
    it("handles month-end rollover (Jan 31 + 1 month = Feb 28)", () => {
      const jan31 = new Date(2025, 0, 31);
      const result = navigateCalendarDate(jan31, "month", 1);
      expect(isSameDay(result, new Date(2025, 1, 28))).toBe(true);
    });

    it("handles year boundary (Dec 2025 + 1 month = Jan 2026)", () => {
      const dec15 = new Date(2025, 11, 15);
      const result = navigateCalendarDate(dec15, "month", 1);
      expect(isSameDay(result, new Date(2026, 0, 15))).toBe(true);
    });

    it("handles year boundary backward (Jan 2025 - 1 month = Dec 2024)", () => {
      const result = navigateCalendarDate(baseDate, "month", -1);
      expect(isSameDay(result, new Date(2024, 11, 15))).toBe(true);
    });
  });
});

describe("getCalendarPageDate", () => {
  const baseDate = new Date(2025, 0, 15);

  it("advances multiple week pages at once", () => {
    const result = getCalendarPageDate(baseDate, "week", 2);
    expect(isSameDay(result, addWeeks(baseDate, 2))).toBe(true);
  });

  it("subtracts multiple 3-day pages at once", () => {
    const result = getCalendarPageDate(baseDate, "3day", -2);
    expect(isSameDay(result, addDays(baseDate, -6))).toBe(true);
  });
});

describe("getSurroundingCalendarDateRange", () => {
  const timezone = resolveTimezone();

  it("covers the current day plus two surrounding day pages", () => {
    const range = getSurroundingCalendarDateRange({
      currentDate: new Date(2025, 0, 15, 12),
      view: "day",
      pageRadius: 2,
      timezone,
    });

    expect(range.start).toEqual(
      getZonedDayUtcBounds(new Date(2025, 0, 13), timezone).start,
    );
    expect(range.end).toEqual(
      getZonedDayUtcBounds(new Date(2025, 0, 18), timezone).start,
    );
  });

  it("covers neighboring week pages using the configured week start", () => {
    const range = getSurroundingCalendarDateRange({
      currentDate: new Date(2025, 0, 15),
      view: "week",
      weekStartDay: 1,
      pageRadius: 1,
      timezone,
    });

    expect(range.start).toEqual(
      getZonedDayUtcBounds(new Date(2025, 0, 6), timezone).start,
    );
    expect(range.end).toEqual(
      getZonedDayUtcBounds(new Date(2025, 0, 27), timezone).start,
    );
  });

  it("covers neighboring 3-day pages in the configured timezone", () => {
    const nyTimezone = "America/New_York";
    const range = getSurroundingCalendarDateRange({
      currentDate: new Date(2025, 0, 15, 12),
      view: "3day",
      pageRadius: 1,
      timezone: nyTimezone,
    });

    expect(range.start).toEqual(
      getZonedDayUtcBounds(new Date(2025, 0, 11), nyTimezone).start,
    );
    expect(range.end).toEqual(
      getZonedDayUtcBounds(new Date(2025, 0, 19), nyTimezone).end,
    );
  });
});

describe("getTimezoneAwareCalendarDateRange", () => {
  it("returns a single zoned day for day view", () => {
    const calendarDay = new Date(2026, 5, 16);
    const range = getTimezoneAwareCalendarDateRange({
      baseDate: calendarDay,
      view: "day",
      timezone: "Europe/Amsterdam",
    });

    expect(range).toEqual(
      getZonedDayUtcBounds(calendarDay, "Europe/Amsterdam"),
    );
  });

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

  it("returns the configured timezone week for week view", () => {
    const range = getTimezoneAwareCalendarDateRange({
      baseDate: new Date(2026, 5, 17),
      view: "week",
      weekStartDay: 1,
      timezone: "Europe/Amsterdam",
    });

    expect(range.start.toISOString()).toBe("2026-06-14T22:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-06-21T22:00:00.000Z");
  });

  it("pads month view to full weeks using the configured timezone", () => {
    const range = getTimezoneAwareCalendarDateRange({
      baseDate: new Date(2026, 5, 10),
      view: "month",
      weekStartDay: 1,
      timezone: "Europe/Amsterdam",
    });

    expect(range.start.toISOString()).toBe("2026-05-31T22:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-07-05T22:00:00.000Z");
  });

  it("anchors agenda fetch windows to zoned day boundaries", () => {
    const baseDate = new Date(2026, 5, 16);
    const range = getTimezoneAwareCalendarDateRange({
      baseDate,
      view: "agenda",
      timezone: "Europe/Amsterdam",
    });

    expect(range.start).toEqual(
      getZonedDayUtcBounds(baseDate, "Europe/Amsterdam").start,
    );
    expect(range.end).toEqual(
      getZonedDayUtcBounds(addDays(baseDate, 29), "Europe/Amsterdam").end,
    );
  });
});
