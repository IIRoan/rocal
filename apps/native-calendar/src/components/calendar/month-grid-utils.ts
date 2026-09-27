import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import {
  formatCalendarDayKey,
  formatInstantCalendarDayKey,
  getMonthGridDays,
  getWeekdayLabels,
  resolveTimezone,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { resolveCalendarSwatchColor } from "../../lib/calendar-color-utils";

export const MAX_DOTS = 3;

export function getOrderedDayLabels(weekStartDay: number): string[] {
  return getWeekdayLabels(weekStartDay, "EEE");
}

/** 42 dates (6 weeks) starting at the week that contains the first of the month. */
export function generateGridDates(
  currentDate: Date,
  weekStartDay: number,
): Date[] {
  return getMonthGridDays(currentDate, weekStartDay, { fixedWeeks: true });
}

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
