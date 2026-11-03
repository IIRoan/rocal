import {
  getOrderedDayLabels,
  getMonthDayEvents,
  resolveEventDotColor,
} from "./month-grid-utils";
import { nativeLightTheme, nativeDarkTheme } from "@workspace/design-tokens";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";

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

describe("getMonthDayEvents", () => {
  const event = {
    id: "1",
    title: "Event 1",
    start: new Date("2025-01-31T10:00:00.000Z"),
    end: new Date("2025-01-31T11:00:00.000Z"),
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as DecoratedCalendarEvent;
  const map = new Map([["2025-01-31", [event]]]);

  it("returns events for dates in the rendered month", () => {
    expect(getMonthDayEvents(map, new Date(2025, 0, 31), true)).toEqual([
      event,
    ]);
  });

  it("hides events for padded outside-month dates", () => {
    expect(getMonthDayEvents(map, new Date(2025, 0, 31), false)).toEqual([]);
  });
});

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

  it("falls back to the blue swatch when color is undefined, like web", () => {
    const result = resolveEventDotColor(undefined, theme);
    expect(result).toBe(theme.colors.calendar.blue.bg);
  });

  it("maps the web sky alias to blue", () => {
    expect(resolveEventDotColor("sky", theme)).toBe(
      theme.colors.calendar.blue.bg,
    );
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
