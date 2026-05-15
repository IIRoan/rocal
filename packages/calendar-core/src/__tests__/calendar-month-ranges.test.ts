import {
  buildPaddedCalendarMonthRanges,
  DEFAULT_CALENDAR_MONTH_PADDING_DAYS,
  getCalendarMonthKey,
  getPaddedCalendarMonthRange,
} from "../calendar-month-ranges";

describe("calendar month range helpers", () => {
  it("builds stable YYYY-MM month keys", () => {
    expect(getCalendarMonthKey(new Date(2026, 0, 1))).toBe("2026-01");
    expect(getCalendarMonthKey(new Date(2026, 10, 30))).toBe("2026-11");
  });

  it("pads month ranges on both sides and normalizes day boundaries", () => {
    const range = getPaddedCalendarMonthRange(new Date(2026, 0, 15));

    expect(range.start).toEqual(new Date(2025, 11, 25, 0, 0, 0, 0));
    expect(range.end).toEqual(new Date(2026, 1, 7, 23, 59, 59, 999));
  });

  it("builds current and adjacent padded month ranges in a stable order", () => {
    const ranges = buildPaddedCalendarMonthRanges(new Date(2026, 0, 15), {
      adjacentMonthDepth: 2,
    });

    expect(ranges).toHaveLength(5);
    expect(ranges.map((range) => getCalendarMonthKey(range.start))).toEqual([
      "2025-12",
      "2025-11",
      "2026-01",
      "2025-10",
      "2026-02",
    ]);
    expect(ranges[0].start).toEqual(new Date(2025, 11, 25, 0, 0, 0, 0));
    expect(ranges[1].start).toEqual(new Date(2025, 10, 24, 0, 0, 0, 0));
    expect(ranges[2].start).toEqual(new Date(2026, 0, 25, 0, 0, 0, 0));
    expect(ranges[3].start).toEqual(new Date(2025, 9, 25, 0, 0, 0, 0));
    expect(ranges[4].start).toEqual(new Date(2026, 1, 22, 0, 0, 0, 0));
  });

  it("can skip the current month for look-ahead prefetching", () => {
    const ranges = buildPaddedCalendarMonthRanges(new Date(2026, 5, 10), {
      includeCurrent: false,
      adjacentMonthDepth: 2,
    });

    expect(ranges).toHaveLength(4);
    expect(ranges.map((range) => getCalendarMonthKey(range.start))).toEqual([
      "2026-04",
      "2026-06",
      "2026-03",
      "2026-07",
    ]);
  });

  it("supports custom padding for narrower fetch plans", () => {
    const range = getPaddedCalendarMonthRange(
      new Date(2026, 2, 15),
      DEFAULT_CALENDAR_MONTH_PADDING_DAYS - 2,
    );

    expect(range.start).toEqual(new Date(2026, 1, 24, 0, 0, 0, 0));
    expect(range.end).toEqual(new Date(2026, 3, 5, 23, 59, 59, 999));
  });
});
