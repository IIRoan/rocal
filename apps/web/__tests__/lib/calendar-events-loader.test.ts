import { describe, expect, it } from "@jest/globals";
import { getPaddedCalendarMonthRange } from "@workspace/calendar-core";
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  startOfMonth,
  subDays,
} from "date-fns";

import {
  monthKey,
  buildViewPrefetchRanges,
  type DateRange,
} from "../../hooks/use-calendar-events-loader";

import { getDefaultCalendarDateRange } from "../../lib/calendar-view-model";

// ---------------------------------------------------------------------------
// Constants (mirrored from the module under test so assertions are readable)
// ---------------------------------------------------------------------------

/** Days of padding the loader adds before/after the calendar month. */
const MONTH_PADDING_DAYS = 7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the expected padded fetch range for a given month. */
function expectedMonthFetch(date: Date): DateRange {
  return getPaddedCalendarMonthRange(date, MONTH_PADDING_DAYS);
}

/** Shorthand for building a view range via getDefaultCalendarDateRange. */
function viewRange(
  baseDate: Date,
  view: "month" | "week" | "day" | "agenda",
  weekStartDay = 1,
): DateRange {
  return getDefaultCalendarDateRange({ baseDate, view, weekStartDay });
}

// ---------------------------------------------------------------------------
// monthKey
// ---------------------------------------------------------------------------
describe("monthKey", () => {
  it("formats a date as YYYY-MM", () => {
    expect(monthKey(new Date(2026, 0, 1))).toBe("2026-01");
    expect(monthKey(new Date(2026, 0, 31))).toBe("2026-01");
    expect(monthKey(new Date(2026, 11, 25))).toBe("2026-12");
  });

  it("zero-pads single-digit months", () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe("2026-01");
    expect(monthKey(new Date(2026, 8, 15))).toBe("2026-09");
  });

  it("returns the same key for every day in a month", () => {
    const expected = "2026-04";
    for (let day = 1; day <= 30; day++) {
      expect(monthKey(new Date(2026, 3, day))).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// buildViewPrefetchRanges
// ---------------------------------------------------------------------------
describe("buildViewPrefetchRanges", () => {
  const center = new Date(2026, 0, 15);

  it("returns 4 padded month ranges (±1 and ±2 months)", () => {
    const ranges = buildViewPrefetchRanges(center, "month");
    expect(ranges).toHaveLength(4);

    for (const range of ranges) {
      // Each range should be a full padded month (at least 28 + 2×7 - 1 = 41 calendar-day difference)
      const span = differenceInCalendarDays(range.end, range.start);
      expect(span).toBeGreaterThanOrEqual(28 + 2 * MONTH_PADDING_DAYS - 1);
    }
  });

  it("returns the same ranges regardless of view type", () => {
    const monthRanges = buildViewPrefetchRanges(center, "month");
    const weekRanges = buildViewPrefetchRanges(center, "week");
    const dayRanges = buildViewPrefetchRanges(center, "day");
    const agendaRanges = buildViewPrefetchRanges(center, "agenda");

    expect(weekRanges).toEqual(monthRanges);
    expect(dayRanges).toEqual(monthRanges);
    expect(agendaRanges).toEqual(monthRanges);
  });

  it("does not include the current month", () => {
    const ranges = buildViewPrefetchRanges(center, "month");
    const currentMonthFetch = expectedMonthFetch(center);

    for (const range of ranges) {
      const isSameRange =
        range.start.getTime() === currentMonthFetch.start.getTime() &&
        range.end.getTime() === currentMonthFetch.end.getTime();
      expect(isSameRange).toBe(false);
    }
  });

  it("prefetch ranges do not overlap with each other", () => {
    const ranges = buildViewPrefetchRanges(center, "month");

    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        // Two month ranges can share a boundary day due to padding, but
        // their core months should be distinct.  We check that the midpoints
        // fall in different calendar months.
        const midI = new Date(
          (ranges[i].start.getTime() + ranges[i].end.getTime()) / 2,
        );
        const midJ = new Date(
          (ranges[j].start.getTime() + ranges[j].end.getTime()) / 2,
        );
        expect(monthKey(midI)).not.toBe(monthKey(midJ));
      }
    }
  });
});

// getDefaultCalendarDateRange — contract check
describe("getDefaultCalendarDateRange", () => {
  const baseDate = new Date(2026, 0, 15);

  it("month view includes the full calendar month", () => {
    const range = viewRange(baseDate, "month");
    expect(range.start <= startOfMonth(baseDate)).toBe(true);
    expect(range.end >= endOfMonth(baseDate)).toBe(true);
  });

  it("week view spans exactly 7 calendar days", () => {
    const range = viewRange(baseDate, "week");
    expect(differenceInCalendarDays(range.end, range.start)).toBe(6);
  });

  it("day view spans a single calendar day", () => {
    const range = viewRange(baseDate, "day");
    expect(range.start.getDate()).toBe(baseDate.getDate());
    expect(range.end.getDate()).toBe(baseDate.getDate());
    expect(range.start.getHours()).toBe(0);
    expect(range.end.getHours()).toBe(23);
  });

  it("agenda view starts on the base date", () => {
    const range = viewRange(baseDate, "agenda");
    expect(range.start.getDate()).toBe(baseDate.getDate());
    expect(
      differenceInCalendarDays(range.end, range.start),
    ).toBeGreaterThanOrEqual(1);
  });
});
