import {
  startOfMonth,
  startOfWeek,
  addDays,
  format,
} from "date-fns";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import type { CalendarColor, ThemeTokens } from "@workspace/design-tokens";

// ─── Constants ───────────────────────────────────────────────────────────────

export const DAYS_IN_GRID = 42; // 6 rows × 7 columns
export const MAX_DOTS = 3;

export const KNOWN_CALENDAR_COLORS: ReadonlySet<string> = new Set<CalendarColor>([
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
]);

// ─── Day-of-week header labels ──────────────────────────────────────────────

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Types ───────────────────────────────────────────────────────────────────

type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build an ordered array of day-of-week header labels starting from the
 * configured week start day.
 */
export function getOrderedDayLabels(weekStartDay: number): string[] {
  const start = ((weekStartDay % 7) + 7) % 7;
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    labels.push(DAY_LABELS[(start + i) % 7]);
  }
  return labels;
}

/**
 * Generate the 42 dates (6 weeks) that fill the month grid, starting from
 * the first day of the week that contains the first day of the month.
 */
export function generateGridDates(currentDate: Date, weekStartDay: number): Date[] {
  const monthStart = startOfMonth(currentDate);
  const weekStartsOn = ((weekStartDay % 7) + 7) % 7 as Day;
  const gridStart = startOfWeek(monthStart, { weekStartsOn });

  const dates: Date[] = [];
  for (let i = 0; i < DAYS_IN_GRID; i++) {
    dates.push(addDays(gridStart, i));
  }
  return dates;
}

/**
 * Build a map from date key (YYYY-MM-DD) to the list of events on that day.
 */
export function groupEventsByDay(
  events: DecoratedCalendarEvent[],
): Map<string, DecoratedCalendarEvent[]> {
  const map = new Map<string, DecoratedCalendarEvent[]>();
  for (const event of events) {
    const key = format(new Date(event.start), "yyyy-MM-dd");
    const list = map.get(key);
    if (list) {
      list.push(event);
    } else {
      map.set(key, [event]);
    }
  }
  return map;
}

/**
 * Resolve the dot color for an event. If the event's color matches a known
 * CalendarColor, use the theme's calendar palette bg. Otherwise use the raw
 * color string, falling back to mutedForeground.
 */
export function resolveEventDotColor(
  eventColor: string | undefined,
  theme: ThemeTokens,
): string {
  if (!eventColor) {
    return theme.colors.mutedForeground;
  }
  if (KNOWN_CALENDAR_COLORS.has(eventColor)) {
    return theme.colors.calendar[eventColor as CalendarColor].bg;
  }
  return eventColor;
}

// ─── CompactMonthStrip height helpers ────────────────────────────────────────

/** Height of a single week row in the compact strip */
export const COMPACT_STRIP_WEEK_ROW_HEIGHT = 48;
/** Height of the day-of-week header row in the compact strip */
export const COMPACT_STRIP_HEADER_ROW_HEIGHT = 24;

/**
 * Returns the collapsed content height for CompactMonthStrip.
 * When `collapseToHandleOnly` is true (timeline views that already render
 * a sticky day header), the content area collapses to 0.
 */
export function getCompactStripCollapsedHeight(
  collapseToHandleOnly: boolean,
): number {
  return collapseToHandleOnly
    ? 0
    : COMPACT_STRIP_HEADER_ROW_HEIGHT + COMPACT_STRIP_WEEK_ROW_HEIGHT;
}

/** Returns the fully expanded content height for CompactMonthStrip. */
export function getCompactStripExpandedHeight(): number {
  return COMPACT_STRIP_HEADER_ROW_HEIGHT + COMPACT_STRIP_WEEK_ROW_HEIGHT * 6;
}
