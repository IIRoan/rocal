import {
  formatCalendarDayKey,
  getWeekdayLabels,
  type DecoratedCalendarEvent,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { resolveCalendarSwatchColor } from "../../lib/calendar-color-utils";

export const MAX_DOTS = 3;

export function getOrderedDayLabels(weekStartDay: number): string[] {
  return getWeekdayLabels(weekStartDay, "EEE");
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
