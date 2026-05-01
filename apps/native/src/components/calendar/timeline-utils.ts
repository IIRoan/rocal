import {
  startOfWeek,
  addDays,
  format,
  isSameDay,
} from "date-fns";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import type { CalendarColor, ThemeTokens } from "@workspace/design-tokens";
import { KNOWN_CALENDAR_COLORS } from "./month-grid-utils";

// ─── Constants ───────────────────────────────────────────────────────────────

export const HOUR_HEIGHT = 60;
export const TIME_GUTTER_WIDTH = 50;
export const TOTAL_HOURS = 24;

// ─── Types ───────────────────────────────────────────────────────────────────

type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface EventPosition {
  top: number;
  height: number;
}

export interface ResolvedEventColor {
  bg: string;
  fg: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns an array of 7 dates for the week containing `currentDate`,
 * starting from the configured `weekStartDay`.
 */
export function getWeekDates(currentDate: Date, weekStartDay: number): Date[] {
  const weekStartsOn = (((weekStartDay % 7) + 7) % 7) as Day;
  const weekStart = startOfWeek(currentDate, { weekStartsOn });
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(weekStart, i));
  }
  return dates;
}

/**
 * Calculate the vertical position and height of an event block within
 * the timeline grid based on its start and end times.
 */
export function calculateEventPosition(
  event: DecoratedCalendarEvent,
  hourHeight: number,
): EventPosition {
  const start = new Date(event.start);
  const end = new Date(event.end);

  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();

  // If end is midnight (0:00) or earlier than start (spans midnight),
  // clamp to end of day
  const effectiveEndMinutes =
    endMinutes <= startMinutes ? TOTAL_HOURS * 60 : endMinutes;

  const top = (startMinutes / 60) * hourHeight;
  const height = Math.max(
    ((effectiveEndMinutes - startMinutes) / 60) * hourHeight,
    hourHeight / 4, // minimum height so tiny events are still visible
  );

  return { top, height };
}

/**
 * Format an hour number (0–23) into a display label based on the time format.
 */
export function formatHourLabel(
  hour: number,
  timeFormat: "12h" | "24h",
): string {
  if (timeFormat === "24h") {
    return `${hour.toString().padStart(2, "0")}:00`;
  }
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

/**
 * Resolve the background and foreground colors for an event block.
 * Uses the calendar color palette when the event color is a known CalendarColor,
 * otherwise falls back to the raw color string or muted defaults.
 */
export function resolveEventBlockColor(
  eventColor: string | undefined,
  theme: ThemeTokens,
): ResolvedEventColor {
  if (eventColor && KNOWN_CALENDAR_COLORS.has(eventColor)) {
    const palette = theme.colors.calendar[eventColor as CalendarColor];
    return { bg: palette.bg, fg: palette.fg };
  }
  if (eventColor) {
    return { bg: eventColor, fg: theme.colors.foreground };
  }
  return { bg: theme.colors.muted, fg: theme.colors.mutedForeground };
}

/**
 * Group events by their start date, returning a map from date key
 * (YYYY-MM-DD) to the list of events on that day.
 */
export function groupEventsByDate(
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
 * Get events for a specific date from a pre-grouped map.
 */
export function getEventsForDate(
  date: Date,
  eventsByDate: Map<string, DecoratedCalendarEvent[]>,
): DecoratedCalendarEvent[] {
  const key = format(date, "yyyy-MM-dd");
  return eventsByDate.get(key) ?? [];
}

/**
 * Format a short day header label (e.g., "Mon 15").
 */
export function formatDayHeader(date: Date): string {
  return format(date, "EEE d");
}

/**
 * Check if a date is today.
 */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/**
 * Returns an array of 3 consecutive dates centered on `currentDate`:
 * [currentDate - 1, currentDate, currentDate + 1].
 */
export function getThreeDayDates(currentDate: Date): Date[] {
  return [addDays(currentDate, -1), currentDate, addDays(currentDate, 1)];
}
