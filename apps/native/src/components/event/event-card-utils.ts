import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import {
  formatInUserTimezone,
  resolveTimezone,
} from "@workspace/calendar-core";

/**
 * Format a compact time range for display in the event card.
 *
 * - All-day events return "All day"
 * - 12h format: "9am – 10am"
 * - 24h format: "09:00 – 10:00"
 */
export function formatTimeRange(
  event: DecoratedCalendarEvent,
  timeFormat: "12h" | "24h",
  timezone?: string,
): string {
  if (event.allDay) return "All day";

  const start = new Date(event.start);
  const end = new Date(event.end);
  const resolvedTimezone = resolveTimezone(timezone ?? event.timezone);

  if (timeFormat === "24h") {
    return `${formatInUserTimezone(
      start,
      resolvedTimezone,
      "HH:mm",
    )} – ${formatInUserTimezone(end, resolvedTimezone, "HH:mm")}`;
  }

  return `${formatInUserTimezone(
    start,
    resolvedTimezone,
    "haaa",
  ).toLowerCase()} – ${formatInUserTimezone(
    end,
    resolvedTimezone,
    "haaa",
  ).toLowerCase()}`;
}
