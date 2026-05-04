import {
  getWeekDates,
  getThreeDayDates,
  getThreeDayStripDates,
  calculateEventPosition,
  formatHourLabel,
  resolveEventBlockColor,
  groupEventsByDate,
  getEventsForDate,
  formatDayHeader,
  isToday,
  HOUR_HEIGHT,
} from "./timeline-utils";
import { getDay, isSameDay, addDays } from "date-fns";
import { nativeLightTheme, nativeDarkTheme } from "@workspace/design-tokens";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeEvent(
  id: string,
  start: Date,
  end: Date,
  color?: string,
): DecoratedCalendarEvent {
  return {
    id,
    title: `Event ${id}`,
    start,
    end,
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    color,
  } as DecoratedCalendarEvent;
}

// ─── getWeekDates ────────────────────────────────────────────────────────────

describe("getWeekDates", () => {
  it("returns exactly 7 dates", () => {
    const dates = getWeekDates(new Date(2025, 0, 15), 0);
    expect(dates).toHaveLength(7);
  });

  it("first date's day-of-week matches weekStartDay (Sunday start)", () => {
    const dates = getWeekDates(new Date(2025, 0, 15), 0);
    expect(getDay(dates[0])).toBe(0);
  });

  it("first date's day-of-week matches weekStartDay (Monday start)", () => {
    const dates = getWeekDates(new Date(2025, 0, 15), 1);
    expect(getDay(dates[0])).toBe(1);
  });

  it("contains the given date", () => {
    const target = new Date(2025, 5, 18); // Wednesday
    const dates = getWeekDates(target, 1);
    expect(dates.some((d) => isSameDay(d, target))).toBe(true);
  });

  it("dates are consecutive", () => {
    const dates = getWeekDates(new Date(2025, 3, 10), 0);
    for (let i = 1; i < dates.length; i++) {
      const diff = dates[i].getTime() - dates[i - 1].getTime();
      expect(diff).toBeGreaterThanOrEqual(22 * 60 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(26 * 60 * 60 * 1000);
    }
  });

  it("last date is 6 days after the first", () => {
    const dates = getWeekDates(new Date(2025, 0, 15), 1);
    expect(isSameDay(dates[6], addDays(dates[0], 6))).toBe(true);
  });
});

// ─── calculateEventPosition ─────────────────────────────────────────────────

describe("calculateEventPosition", () => {
  it("positions an event at the top for midnight start", () => {
    const event = makeEvent(
      "1",
      new Date(2025, 0, 15, 0, 0),
      new Date(2025, 0, 15, 1, 0),
    );
    const pos = calculateEventPosition(event, HOUR_HEIGHT);
    expect(pos.top).toBe(0);
    expect(pos.height).toBe(HOUR_HEIGHT);
  });

  it("positions a 9am–10am event correctly", () => {
    const event = makeEvent(
      "2",
      new Date(2025, 0, 15, 9, 0),
      new Date(2025, 0, 15, 10, 0),
    );
    const pos = calculateEventPosition(event, HOUR_HEIGHT);
    expect(pos.top).toBe(9 * HOUR_HEIGHT);
    expect(pos.height).toBe(HOUR_HEIGHT);
  });

  it("handles half-hour events", () => {
    const event = makeEvent(
      "3",
      new Date(2025, 0, 15, 14, 0),
      new Date(2025, 0, 15, 14, 30),
    );
    const pos = calculateEventPosition(event, HOUR_HEIGHT);
    expect(pos.top).toBe(14 * HOUR_HEIGHT);
    expect(pos.height).toBe(HOUR_HEIGHT / 2);
  });

  it("handles events starting at a fractional hour", () => {
    const event = makeEvent(
      "4",
      new Date(2025, 0, 15, 10, 30),
      new Date(2025, 0, 15, 11, 30),
    );
    const pos = calculateEventPosition(event, HOUR_HEIGHT);
    expect(pos.top).toBe(10.5 * HOUR_HEIGHT);
    expect(pos.height).toBe(HOUR_HEIGHT);
  });

  it("enforces a minimum height for very short events", () => {
    const event = makeEvent(
      "5",
      new Date(2025, 0, 15, 12, 0),
      new Date(2025, 0, 15, 12, 1), // 1 minute
    );
    const pos = calculateEventPosition(event, HOUR_HEIGHT);
    expect(pos.height).toBeGreaterThanOrEqual(HOUR_HEIGHT / 4);
  });

  it("clamps events that span midnight to end of day", () => {
    const event = makeEvent(
      "6",
      new Date(2025, 0, 15, 23, 0),
      new Date(2025, 0, 16, 1, 0), // next day 1am
    );
    const pos = calculateEventPosition(event, HOUR_HEIGHT);
    expect(pos.top).toBe(23 * HOUR_HEIGHT);
    // Should extend to end of day (24h - 23h = 1h)
    expect(pos.height).toBe(HOUR_HEIGHT);
  });
});

// ─── formatHourLabel ─────────────────────────────────────────────────────────

describe("formatHourLabel", () => {
  describe("24h format", () => {
    it("formats midnight as 00:00", () => {
      expect(formatHourLabel(0, "24h")).toBe("00:00");
    });

    it("formats 9am as 09:00", () => {
      expect(formatHourLabel(9, "24h")).toBe("09:00");
    });

    it("formats 13 as 13:00", () => {
      expect(formatHourLabel(13, "24h")).toBe("13:00");
    });

    it("formats 23 as 23:00", () => {
      expect(formatHourLabel(23, "24h")).toBe("23:00");
    });
  });

  describe("12h format", () => {
    it("formats midnight as 12am", () => {
      expect(formatHourLabel(0, "12h")).toBe("12am");
    });

    it("formats 1 as 1am", () => {
      expect(formatHourLabel(1, "12h")).toBe("1am");
    });

    it("formats 11 as 11am", () => {
      expect(formatHourLabel(11, "12h")).toBe("11am");
    });

    it("formats noon as 12pm", () => {
      expect(formatHourLabel(12, "12h")).toBe("12pm");
    });

    it("formats 13 as 1pm", () => {
      expect(formatHourLabel(13, "12h")).toBe("1pm");
    });

    it("formats 23 as 11pm", () => {
      expect(formatHourLabel(23, "12h")).toBe("11pm");
    });
  });
});

// ─── resolveEventBlockColor ──────────────────────────────────────────────────

describe("resolveEventBlockColor", () => {
  const theme = nativeLightTheme;

  it("returns calendar palette bg/fg for a known CalendarColor", () => {
    const result = resolveEventBlockColor("blue", theme);
    expect(result.bg).toBe(theme.colors.calendar.blue.bg);
    expect(result.fg).toBe(theme.colors.calendar.blue.fg);
  });

  it("returns raw color as bg with foreground as fg for unknown color", () => {
    const result = resolveEventBlockColor("#ff00ff", theme);
    expect(result.bg).toBe("#ff00ff");
    expect(result.fg).toBe(theme.colors.foreground);
  });

  it("returns muted defaults when color is undefined", () => {
    const result = resolveEventBlockColor(undefined, theme);
    expect(result.bg).toBe(theme.colors.muted);
    expect(result.fg).toBe(theme.colors.mutedForeground);
  });

  it("works with all 12 known calendar colors", () => {
    const knownColors = [
      "blue", "orange", "violet", "rose", "emerald", "red",
      "cyan", "lime", "amber", "indigo", "pink", "teal",
    ] as const;
    for (const color of knownColors) {
      const result = resolveEventBlockColor(color, theme);
      expect(result.bg).toBe(theme.colors.calendar[color].bg);
      expect(result.fg).toBe(theme.colors.calendar[color].fg);
    }
  });

  it("works with dark theme", () => {
    const darkTheme = nativeDarkTheme;
    const result = resolveEventBlockColor("emerald", darkTheme);
    expect(result.bg).toBe(darkTheme.colors.calendar.emerald.bg);
    expect(result.fg).toBe(darkTheme.colors.calendar.emerald.fg);
  });
});

// ─── groupEventsByDate ───────────────────────────────────────────────────────

describe("groupEventsByDate", () => {
  it("returns an empty map for no events", () => {
    const map = groupEventsByDate([]);
    expect(map.size).toBe(0);
  });

  it("groups events by their start date", () => {
    const events = [
      makeEvent("1", new Date(2025, 0, 15, 10), new Date(2025, 0, 15, 11)),
      makeEvent("2", new Date(2025, 0, 15, 14), new Date(2025, 0, 15, 15)),
      makeEvent("3", new Date(2025, 0, 16, 9), new Date(2025, 0, 16, 10)),
    ];
    const map = groupEventsByDate(events);
    expect(map.get("2025-01-15")).toHaveLength(2);
    expect(map.get("2025-01-16")).toHaveLength(1);
  });

  it("does not create entries for dates with no events", () => {
    const events = [
      makeEvent("1", new Date(2025, 0, 15, 10), new Date(2025, 0, 15, 11)),
    ];
    const map = groupEventsByDate(events);
    expect(map.has("2025-01-16")).toBe(false);
  });
});

// ─── getEventsForDate ────────────────────────────────────────────────────────

describe("getEventsForDate", () => {
  it("returns events for a date that has events", () => {
    const events = [
      makeEvent("1", new Date(2025, 0, 15, 10), new Date(2025, 0, 15, 11)),
    ];
    const map = groupEventsByDate(events);
    const result = getEventsForDate(new Date(2025, 0, 15), map);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("returns empty array for a date with no events", () => {
    const map = groupEventsByDate([]);
    const result = getEventsForDate(new Date(2025, 0, 15), map);
    expect(result).toEqual([]);
  });
});

// ─── formatDayHeader ─────────────────────────────────────────────────────────

describe("formatDayHeader", () => {
  it("formats a Wednesday as 'Wed 15'", () => {
    // Jan 15, 2025 is a Wednesday
    expect(formatDayHeader(new Date(2025, 0, 15))).toBe("Wed 15");
  });

  it("formats a Monday as 'Mon 13'", () => {
    expect(formatDayHeader(new Date(2025, 0, 13))).toBe("Mon 13");
  });

  it("formats a Sunday as 'Sun 19'", () => {
    expect(formatDayHeader(new Date(2025, 0, 19))).toBe("Sun 19");
  });
});

// ─── isToday ─────────────────────────────────────────────────────────────────

describe("isToday", () => {
  it("returns true for today's date", () => {
    expect(isToday(new Date())).toBe(true);
  });

  it("returns false for yesterday", () => {
    const yesterday = addDays(new Date(), -1);
    expect(isToday(yesterday)).toBe(false);
  });

  it("returns false for a date far in the past", () => {
    expect(isToday(new Date(2020, 0, 1))).toBe(false);
  });
});


// ─── getThreeDayDates ────────────────────────────────────────────────────────

describe("getThreeDayDates", () => {
  it("returns exactly 3 dates", () => {
    const dates = getThreeDayDates(new Date(2025, 0, 15));
    expect(dates).toHaveLength(3);
  });

  it("returns [day-1, day, day+1] centered on the given date", () => {
    const center = new Date(2025, 0, 15); // Wednesday Jan 15
    const dates = getThreeDayDates(center);
    expect(isSameDay(dates[0], new Date(2025, 0, 14))).toBe(true);
    expect(isSameDay(dates[1], center)).toBe(true);
    expect(isSameDay(dates[2], new Date(2025, 0, 16))).toBe(true);
  });

  it("handles month boundaries correctly", () => {
    const center = new Date(2025, 1, 1); // Feb 1
    const dates = getThreeDayDates(center);
    expect(isSameDay(dates[0], new Date(2025, 0, 31))).toBe(true);
    expect(isSameDay(dates[1], new Date(2025, 1, 1))).toBe(true);
    expect(isSameDay(dates[2], new Date(2025, 1, 2))).toBe(true);
  });

  it("handles year boundaries correctly", () => {
    const center = new Date(2025, 0, 1); // Jan 1
    const dates = getThreeDayDates(center);
    expect(isSameDay(dates[0], new Date(2024, 11, 31))).toBe(true);
    expect(isSameDay(dates[1], new Date(2025, 0, 1))).toBe(true);
    expect(isSameDay(dates[2], new Date(2025, 0, 2))).toBe(true);
  });

  it("dates are consecutive (each 1 day apart)", () => {
    const dates = getThreeDayDates(new Date(2025, 5, 18));
    for (let i = 1; i < dates.length; i++) {
      const diff = dates[i].getTime() - dates[i - 1].getTime();
      expect(diff).toBeGreaterThanOrEqual(22 * 60 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(26 * 60 * 60 * 1000);
    }
  });
});

describe("getThreeDayStripDates", () => {
  it("centers the visible 3-day range inside the 7-day strip", () => {
    const dates = getThreeDayStripDates(new Date(2025, 0, 12)); // Sunday
    expect(isSameDay(dates[0], new Date(2025, 0, 9))).toBe(true);
    expect(isSameDay(dates[2], new Date(2025, 0, 11))).toBe(true);
    expect(isSameDay(dates[3], new Date(2025, 0, 12))).toBe(true);
    expect(isSameDay(dates[4], new Date(2025, 0, 13))).toBe(true);
    expect(isSameDay(dates[6], new Date(2025, 0, 15))).toBe(true);
  });

  it("covers the centered 3-day range even across month boundaries", () => {
    const dates = getThreeDayStripDates(new Date(2025, 1, 1)); // Feb 1
    expect(isSameDay(dates[0], new Date(2025, 0, 29))).toBe(true);
    expect(isSameDay(dates[2], new Date(2025, 0, 31))).toBe(true);
    expect(isSameDay(dates[3], new Date(2025, 1, 1))).toBe(true);
    expect(isSameDay(dates[4], new Date(2025, 1, 2))).toBe(true);
    expect(isSameDay(dates[6], new Date(2025, 1, 4))).toBe(true);
  });
});
