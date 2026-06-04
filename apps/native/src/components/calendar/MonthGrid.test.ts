import {
  getOrderedDayLabels,
  generateGridDates,
  getMonthDayEvents,
  groupEventsByDay,
  resolveEventDotColor,
  getCompactStripCollapsedHeight,
  getCompactStripExpandedHeight,
  COMPACT_STRIP_WEEK_ROW_HEIGHT,
  COMPACT_STRIP_HEADER_ROW_HEIGHT,
} from "./month-grid-utils";
import { isSameDay, getDay } from "date-fns";
import { nativeLightTheme, nativeDarkTheme } from "@workspace/design-tokens";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";

// ─── getOrderedDayLabels ─────────────────────────────────────────────────────

describe("getOrderedDayLabels", () => {
  it("returns Sun–Sat when weekStartDay is 0 (Sunday)", () => {
    expect(getOrderedDayLabels(0)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });

  it("returns Mon–Sun when weekStartDay is 1 (Monday)", () => {
    expect(getOrderedDayLabels(1)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });

  it("always returns exactly 7 labels", () => {
    for (let d = 0; d < 7; d++) {
      expect(getOrderedDayLabels(d)).toHaveLength(7);
    }
  });
});

// ─── generateGridDates ───────────────────────────────────────────────────────

describe("generateGridDates", () => {
  it("returns exactly 42 dates (6 weeks)", () => {
    const dates = generateGridDates(new Date(2025, 0, 15), 0);
    expect(dates).toHaveLength(42);
  });

  it("first date's day-of-week matches weekStartDay (Sunday start)", () => {
    const dates = generateGridDates(new Date(2025, 0, 15), 0);
    expect(getDay(dates[0])).toBe(0); // Sunday
  });

  it("first date's day-of-week matches weekStartDay (Monday start)", () => {
    const dates = generateGridDates(new Date(2025, 0, 15), 1);
    expect(getDay(dates[0])).toBe(1); // Monday
  });

  it("contains the first day of the month", () => {
    const target = new Date(2025, 5, 1); // June 1, 2025
    const dates = generateGridDates(target, 1);
    expect(dates.some((d) => isSameDay(d, target))).toBe(true);
  });

  it("contains the last day of the month", () => {
    const dates = generateGridDates(new Date(2025, 0, 15), 0);
    const lastDay = new Date(2025, 0, 31);
    expect(dates.some((d) => isSameDay(d, lastDay))).toBe(true);
  });

  it("dates are consecutive (each day is 1 day after the previous)", () => {
    const dates = generateGridDates(new Date(2025, 3, 10), 1);
    for (let i = 1; i < dates.length; i++) {
      const diff = dates[i].getTime() - dates[i - 1].getTime();
      // Allow for DST: should be roughly 24h (within 2h tolerance)
      expect(diff).toBeGreaterThanOrEqual(22 * 60 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(26 * 60 * 60 * 1000);
    }
  });
});

// ─── groupEventsByDay ────────────────────────────────────────────────────────

describe("groupEventsByDay", () => {
  const makeEvent = (
    id: string,
    start: Date,
    color?: string,
  ): DecoratedCalendarEvent =>
    ({
      id,
      title: `Event ${id}`,
      start,
      end: new Date(start.getTime() + 3600000),
      calendarId: "cal-1",
      userId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      color,
    }) as DecoratedCalendarEvent;

  it("returns an empty map for no events", () => {
    const map = groupEventsByDay([]);
    expect(map.size).toBe(0);
  });

  it("groups events by their start date", () => {
    const events = [
      makeEvent("1", new Date(2025, 0, 15, 10)),
      makeEvent("2", new Date(2025, 0, 15, 14)),
      makeEvent("3", new Date(2025, 0, 16, 9)),
    ];
    const map = groupEventsByDay(events);
    expect(map.get("2025-01-15")).toHaveLength(2);
    expect(map.get("2025-01-16")).toHaveLength(1);
  });
});

describe("getMonthDayEvents", () => {
  const event = {
    id: "1",
    title: "Event 1",
    start: new Date(2025, 0, 31, 10),
    end: new Date(2025, 0, 31, 11),
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DecoratedCalendarEvent;

  it("returns events for dates in the rendered month", () => {
    const map = groupEventsByDay([event]);

    expect(getMonthDayEvents(map, new Date(2025, 0, 31), true)).toEqual([
      event,
    ]);
  });

  it("hides events for padded outside-month dates", () => {
    const map = groupEventsByDay([event]);

    expect(getMonthDayEvents(map, new Date(2025, 0, 31), false)).toEqual([]);
  });
});

// ─── resolveEventDotColor ────────────────────────────────────────────────────

describe("resolveEventDotColor", () => {
  const theme = nativeLightTheme;

  it("returns the calendar palette bg for a known CalendarColor", () => {
    const result = resolveEventDotColor("blue", theme);
    expect(result).toBe(theme.colors.calendar.blue.bg);
  });

  it("returns the raw color string for an unknown color", () => {
    const result = resolveEventDotColor("#ff00ff", theme);
    expect(result).toBe("#ff00ff");
  });

  it("returns mutedForeground when color is undefined", () => {
    const result = resolveEventDotColor(undefined, theme);
    expect(result).toBe(theme.colors.mutedForeground);
  });

  it("works with all 12 known calendar colors", () => {
    const knownColors = [
      "blue",
      "orange",
      "violet",
      "rose",
      "emerald",
      "red",
      "cyan",
      "lime",
      "amber",
      "indigo",
      "pink",
      "teal",
    ] as const;
    for (const color of knownColors) {
      expect(resolveEventDotColor(color, theme)).toBe(
        theme.colors.calendar[color].bg,
      );
    }
  });

  it("works with dark theme as well", () => {
    const darkTheme = nativeDarkTheme;
    expect(resolveEventDotColor("emerald", darkTheme)).toBe(
      darkTheme.colors.calendar.emerald.bg,
    );
  });
});

// ─── CompactMonthStrip height helpers ────────────────────────────────────────

describe("getCompactStripCollapsedHeight", () => {
  it("returns full week-row + header height when NOT collapsing to handle only", () => {
    expect(getCompactStripCollapsedHeight(false)).toBe(
      COMPACT_STRIP_HEADER_ROW_HEIGHT + COMPACT_STRIP_WEEK_ROW_HEIGHT,
    );
  });

  it("returns 0 when collapseToHandleOnly is true (timeline provides the header)", () => {
    expect(getCompactStripCollapsedHeight(true)).toBe(0);
  });

  it("collapsed height is less than expanded height in default mode", () => {
    expect(getCompactStripCollapsedHeight(false)).toBeLessThan(
      getCompactStripExpandedHeight(),
    );
  });

  it("collapsed handle-only height is less than expanded height", () => {
    expect(getCompactStripCollapsedHeight(true)).toBeLessThan(
      getCompactStripExpandedHeight(),
    );
  });
});

describe("getCompactStripExpandedHeight", () => {
  it("expanded height spans exactly 6 week rows plus the header row", () => {
    expect(getCompactStripExpandedHeight()).toBe(
      COMPACT_STRIP_HEADER_ROW_HEIGHT + COMPACT_STRIP_WEEK_ROW_HEIGHT * 6,
    );
  });

  it("expanded height is a positive value", () => {
    expect(getCompactStripExpandedHeight()).toBeGreaterThan(0);
  });
});

describe("COMPACT_STRIP constants", () => {
  it("week row height is a positive integer", () => {
    expect(COMPACT_STRIP_WEEK_ROW_HEIGHT).toBeGreaterThan(0);
    expect(Number.isInteger(COMPACT_STRIP_WEEK_ROW_HEIGHT)).toBe(true);
  });

  it("header row height is a positive integer", () => {
    expect(COMPACT_STRIP_HEADER_ROW_HEIGHT).toBeGreaterThan(0);
    expect(Number.isInteger(COMPACT_STRIP_HEADER_ROW_HEIGHT)).toBe(true);
  });
});
