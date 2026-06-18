import type { CalendarEvent } from "@workspace/calendar-core";
import {
  formatInUserTimezone,
  resolveTimezone,
} from "@workspace/calendar-core";

/**
 * Format the date portion of an event for display on the detail screen.
 * Returns a human-readable date string like "Wednesday, January 15, 2025".
 */
export function formatEventDate(event: CalendarEvent, timezone?: string): string {
  const start = new Date(event.start);
  return formatInUserTimezone(
    start,
    resolveTimezone(timezone ?? event.timezone),
    "EEEE, MMMM d, yyyy",
  );
}

/**
 * Format the time portion of an event for display on the detail screen.
 * Returns "All day" for all-day events, or a range like "9:00 AM – 10:00 AM".
 */
export function formatEventTime(event: CalendarEvent, timezone?: string): string {
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
 *
 * - 0 → "At time of event"
 * - < 60 → "N minute(s) before"
 * - exact hours → "N hour(s) before"
 * - mixed → "Nh Mm before"
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
