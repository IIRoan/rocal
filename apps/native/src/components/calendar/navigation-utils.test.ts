import {
  addMonths,
  addWeeks,
  addDays,
  isSameDay,
} from "date-fns";
import { navigateCalendarDate } from "./navigation-utils";

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
