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

    expect(range.start.toISOString()).toBe("2025-12-24T23:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-02-07T23:00:00.000Z");
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
    expect(ranges.map((range) => range.start.toISOString())).toEqual([
      "2025-12-24T23:00:00.000Z",
      "2025-11-23T23:00:00.000Z",
      "2026-01-24T23:00:00.000Z",
      "2025-10-24T22:00:00.000Z",
      "2026-02-21T23:00:00.000Z",
    ]);
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

    expect(range.start.toISOString()).toBe("2026-02-23T23:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-04-05T22:00:00.000Z");
  });

  it("normalizes padded month boundaries to timezone-aware day starts and ends", () => {
    const range = getPaddedCalendarMonthRange(
      new Date(2026, 0, 15),
      DEFAULT_CALENDAR_MONTH_PADDING_DAYS,
      "America/Los_Angeles",
    );

    expect(range.start.toISOString()).toBe("2025-12-25T08:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-02-08T08:00:00.000Z");
  });

  it("passes timezone through when building adjacent month ranges", () => {
    const ranges = buildPaddedCalendarMonthRanges(new Date(2026, 5, 10), {
      includeCurrent: true,
      adjacentMonthDepth: 1,
      timezone: "America/New_York",
    });

    expect(ranges).toHaveLength(3);
    expect(ranges[0]?.start.toISOString()).toBe("2026-05-25T04:00:00.000Z");
    expect(ranges[0]?.end.toISOString()).toBe("2026-07-08T04:00:00.000Z");
    expect(ranges[1]?.start.toISOString()).toBe("2026-04-24T04:00:00.000Z");
    expect(ranges[2]?.start.toISOString()).toBe("2026-06-24T04:00:00.000Z");
  });
});
