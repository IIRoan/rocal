import { describe, expect, it } from "@jest/globals";
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  startOfMonth,
  subDays,
} from "date-fns";

import {
  toFetchRange,
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

/** All weekStartDay values supported by the calendar UI. */
const ALL_WEEK_START_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the expected padded fetch range for a given month. */
function expectedMonthFetch(date: Date): DateRange {
  const first = startOfMonth(date);
  const last = endOfMonth(date);
  const start = subDays(first, MONTH_PADDING_DAYS);
  start.setHours(0, 0, 0, 0);
  const end = addDays(last, MONTH_PADDING_DAYS);
  end.setHours(23, 59, 59, 999);
  return { start, end };
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
// toFetchRange
// ---------------------------------------------------------------------------
describe("toFetchRange", () => {
  describe("view stability: all views for the same month produce the same fetch range", () => {
    // This is the core invariant.  If it holds, switching views within a
    // month never changes the React Query key and never triggers a refetch.

    for (const weekStartDay of ALL_WEEK_START_DAYS) {
      it(`month/week/day views for Jan 15 2026 with weekStartDay=${weekStartDay}`, () => {
        const base = new Date(2026, 0, 15);
        const monthFetch = toFetchRange(viewRange(base, "month", weekStartDay));
        const weekFetch = toFetchRange(viewRange(base, "week", weekStartDay));
        const dayFetch = toFetchRange(viewRange(base, "day", weekStartDay));

        expect(weekFetch.start.getTime()).toBe(monthFetch.start.getTime());
        expect(weekFetch.end.getTime()).toBe(monthFetch.end.getTime());
        expect(dayFetch.start.getTime()).toBe(monthFetch.start.getTime());
        expect(dayFetch.end.getTime()).toBe(monthFetch.end.getTime());
      });
    }
  });

  describe("round-trip stability: month→week→month produces identical ranges", () => {
    for (const weekStartDay of [0, 1] as const) {
      it(`weekStartDay=${weekStartDay}`, () => {
        const base = new Date(2026, 0, 15);
        const first = toFetchRange(viewRange(base, "month", weekStartDay));
        const second = toFetchRange(viewRange(base, "week", weekStartDay));
        const third = toFetchRange(viewRange(base, "month", weekStartDay));

        expect(first.start.toISOString()).toBe(second.start.toISOString());
        expect(first.end.toISOString()).toBe(second.end.toISOString());
        expect(first.start.toISOString()).toBe(third.start.toISOString());
        expect(first.end.toISOString()).toBe(third.end.toISOString());
      });
    }
  });

  describe("coverage: fetch range fully contains the view range", () => {
    it("covers month view for every weekStartDay", () => {
      for (const weekStartDay of ALL_WEEK_START_DAYS) {
        const vr = viewRange(new Date(2026, 0, 15), "month", weekStartDay);
        const fr = toFetchRange(vr);
        expect(fr.start.getTime()).toBeLessThanOrEqual(vr.start.getTime());
        expect(fr.end.getTime()).toBeGreaterThanOrEqual(vr.end.getTime());
      }
    });

    it("covers week view for every weekStartDay", () => {
      for (const weekStartDay of ALL_WEEK_START_DAYS) {
        const vr = viewRange(new Date(2026, 0, 15), "week", weekStartDay);
        const fr = toFetchRange(vr);
        expect(fr.start.getTime()).toBeLessThanOrEqual(vr.start.getTime());
        expect(fr.end.getTime()).toBeGreaterThanOrEqual(vr.end.getTime());
      }
    });

    it("covers day view", () => {
      const vr = viewRange(new Date(2026, 0, 15), "day");
      const fr = toFetchRange(vr);
      expect(fr.start.getTime()).toBeLessThanOrEqual(vr.start.getTime());
      expect(fr.end.getTime()).toBeGreaterThanOrEqual(vr.end.getTime());
    });

    it("covers agenda view", () => {
      const vr = viewRange(new Date(2026, 0, 15), "agenda");
      const fr = toFetchRange(vr);
      expect(fr.start.getTime()).toBeLessThanOrEqual(vr.start.getTime());
      expect(fr.end.getTime()).toBeGreaterThanOrEqual(vr.end.getTime());
    });
  });

  describe("padding", () => {
    it("pads exactly MONTH_PADDING_DAYS before the 1st", () => {
      const fr = toFetchRange(viewRange(new Date(2026, 0, 15), "month"));
      const jan1 = new Date(2026, 0, 1);
      jan1.setHours(0, 0, 0, 0);
      expect(differenceInCalendarDays(jan1, fr.start)).toBe(MONTH_PADDING_DAYS);
    });

    it("pads exactly MONTH_PADDING_DAYS after the last day", () => {
      const fr = toFetchRange(viewRange(new Date(2026, 0, 15), "month"));
      const jan31 = new Date(2026, 0, 31);
      jan31.setHours(0, 0, 0, 0);
      const frEndDay = new Date(fr.end);
      frEndDay.setHours(0, 0, 0, 0);
      expect(differenceInCalendarDays(frEndDay, jan31)).toBe(MONTH_PADDING_DAYS);
    });
  });

  describe("edge cases", () => {
    it("year boundary: Dec 31 anchors to December", () => {
      const fr = toFetchRange({
        start: new Date(2025, 11, 31),
        end: new Date(2025, 11, 31),
      });
      const expected = expectedMonthFetch(new Date(2025, 11, 1));
      expect(fr.start.getTime()).toBe(expected.start.getTime());
      expect(fr.end.getTime()).toBe(expected.end.getTime());
    });

    it("year boundary: Jan 1 anchors to January", () => {
      const fr = toFetchRange({
        start: new Date(2026, 0, 1),
        end: new Date(2026, 0, 1),
      });
      const expected = expectedMonthFetch(new Date(2026, 0, 1));
      expect(fr.start.getTime()).toBe(expected.start.getTime());
      expect(fr.end.getTime()).toBe(expected.end.getTime());
    });

    it("Feb 28 in a non-leap year", () => {
      const fr = toFetchRange({
        start: new Date(2026, 1, 28),
        end: new Date(2026, 1, 28),
      });
      expect(fr.start.getTime()).toBeLessThanOrEqual(
        new Date(2026, 1, 1).getTime(),
      );
      expect(fr.end.getTime()).toBeGreaterThanOrEqual(
        new Date(2026, 1, 28).getTime(),
      );
    });

    it("Feb 29 in a leap year", () => {
      const fr = toFetchRange({
        start: new Date(2028, 1, 29),
        end: new Date(2028, 1, 29),
      });
      expect(fr.start.getTime()).toBeLessThanOrEqual(
        new Date(2028, 1, 1).getTime(),
      );
      expect(fr.end.getTime()).toBeGreaterThanOrEqual(
        new Date(2028, 1, 29).getTime(),
      );
    });

    it("month-boundary week: week containing Jan 31 still anchors to January", () => {
      // Jan 31 2026 is a Saturday.  A Monday-start week is Jan 26–Feb 1.
      // Midpoint is Jan 29 → still January.
      const weekRange = viewRange(new Date(2026, 0, 31), "week", 1);
      const fr = toFetchRange(weekRange);
      const janFetch = expectedMonthFetch(new Date(2026, 0, 1));
      expect(fr.start.getTime()).toBe(janFetch.start.getTime());
      expect(fr.end.getTime()).toBe(janFetch.end.getTime());
    });
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
      expect(span).toBeGreaterThanOrEqual(
        28 + 2 * MONTH_PADDING_DAYS - 1,
      );
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

// ---------------------------------------------------------------------------
// getDefaultCalendarDateRange (sanity checks — function is not ours but we
// depend on its output, so we verify the contract)
// ---------------------------------------------------------------------------
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
    expect(differenceInCalendarDays(range.end, range.start)).toBeGreaterThanOrEqual(1);
  });
});
