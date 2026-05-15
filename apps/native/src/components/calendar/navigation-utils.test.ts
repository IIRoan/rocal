import { addMonths, addWeeks, addDays, isSameDay } from "date-fns";
import {
  getCalendarPageDate,
  getSurroundingCalendarDateRange,
  navigateCalendarDate,
} from "./navigation-utils";

// ─── Month View ──────────────────────────────────────────────────────────────

describe("navigateCalendarDate", () => {
  const baseDate = new Date(2025, 0, 15); // Jan 15, 2025

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

  // ─── Week View ───────────────────────────────────────────────────────────

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

  // ─── Day View ────────────────────────────────────────────────────────────

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

  // ─── 3-Day View ──────────────────────────────────────────────────────────

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

  // ─── Agenda View ─────────────────────────────────────────────────────────

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

  // ─── Edge Cases ──────────────────────────────────────────────────────────

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

// ─── Page Offsets ──────────────────────────────────────────────────────────

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

// ─── Surrounding Fetch Range ────────────────────────────────────────────────

describe("getSurroundingCalendarDateRange", () => {
  it("covers the current day plus two surrounding day pages", () => {
    const range = getSurroundingCalendarDateRange({
      currentDate: new Date(2025, 0, 15, 12),
      view: "day",
      pageRadius: 2,
    });

    expect(isSameDay(range.start, new Date(2025, 0, 13))).toBe(true);
    expect(isSameDay(range.end, new Date(2025, 0, 17))).toBe(true);
  });

  it("covers neighboring week pages using the configured week start", () => {
    const range = getSurroundingCalendarDateRange({
      currentDate: new Date(2025, 0, 15),
      view: "week",
      weekStartDay: 1,
      pageRadius: 1,
    });

    expect(isSameDay(range.start, new Date(2025, 0, 6))).toBe(true);
    expect(isSameDay(range.end, new Date(2025, 0, 26))).toBe(true);
  });
});
