import {
  formatEventCalendarDate,
  formatInUserTimezone,
  resolveTimezone,
} from "@workspace/calendar-core";
import type { CalendarEvent } from "@workspace/calendar-core";

/**
 * Format the date portion of an event for display on the detail screen.
 */
export function formatEventDate(
  event: CalendarEvent,
  timezone?: string,
): string {
  return formatEventCalendarDate(event, timezone);
}

/**
 * Format the time portion of an event for display on the detail screen.
 */
export function formatEventTime(
  event: CalendarEvent,
  timezone?: string,
): string {
  if (event.allDay) return "All day";
  const start = new Date(event.start);
  const end = new Date(event.end);
  const resolvedTimezone = resolveTimezone(timezone ?? event.timezone);
  return `${formatInUserTimezone(
    start,
    resolvedTimezone,
    "h:mm a",
  )} – ${formatInUserTimezone(end, resolvedTimezone, "h:mm a")}`;
}

/**
 * Format a reminder value (in minutes) into a human-readable label.
 */
export function formatReminderLabel(minutes: number): string {
  if (minutes === 0) return "At time of event";
  if (minutes < 60)
    return `${minutes} minute${minutes === 1 ? "" : "s"} before`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours} hour${hours === 1 ? "" : "s"} before`;
  return `${hours}h ${remaining}m before`;
}
