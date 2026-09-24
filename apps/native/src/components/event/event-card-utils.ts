import type {
  DecoratedCalendarEvent,
  TimeFormat,
} from "@workspace/calendar-core";
import {
  formatInUserTimezone,
  resolveTimezone,
} from "@workspace/calendar-core";

/** Compact time range: "All day", "9am – 10am" (12h), or "09:00 – 10:00" (24h). */
export function formatTimeRange(
  event: DecoratedCalendarEvent,
  timeFormat: TimeFormat,
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
