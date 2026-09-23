import { startOfMonth, startOfWeek, addDays } from "date-fns";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import {
  formatCalendarDayKey,
  formatInstantCalendarDayKey,
  resolveTimezone,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { resolveCalendarSwatchColor } from "../../lib/calendar-color-utils";

// ─── Constants ───────────────────────────────────────────────────────────────

const DAYS_IN_GRID = 42; // 6 rows × 7 columns
export const MAX_DOTS = 3;

// ─── Day-of-week header labels ──────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
export function generateGridDates(
  currentDate: Date,
  weekStartDay: number,
): Date[] {
  const monthStart = startOfMonth(currentDate);
  const weekStartsOn = (((weekStartDay % 7) + 7) % 7) as Day;
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
  timezone?: string,
): Map<string, DecoratedCalendarEvent[]> {
  const resolvedTimezone = timezone ? resolveTimezone(timezone) : null;
  const map = new Map<string, DecoratedCalendarEvent[]>();
  for (const event of events) {
    const key = resolvedTimezone
      ? formatInstantCalendarDayKey(new Date(event.start), resolvedTimezone)
      : formatCalendarDayKey(new Date(event.start));
    const list = map.get(key);
    if (list) {
      list.push(event);
    } else {
      map.set(key, [event]);
    }
  }
  return map;
}

export function getMonthDayEvents(
  eventsByDay: Map<string, DecoratedCalendarEvent[]>,
  date: Date,
  isCurrentMonth: boolean,
): DecoratedCalendarEvent[] {
  if (!isCurrentMonth) {
    return [];
  }

  return eventsByDay.get(formatCalendarDayKey(date)) ?? [];
}

/** Dot color for an event, matching the web swatch (named palette bg, raw hex, sky fallback). */
export function resolveEventDotColor(
  eventColor: string | undefined,
  theme: ThemeTokens,
): string {
  return resolveCalendarSwatchColor(eventColor, theme);
}
