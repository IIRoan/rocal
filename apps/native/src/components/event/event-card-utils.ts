import { format } from "date-fns";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";

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
): string {
  if (event.allDay) return "All day";

  const start = new Date(event.start);
  const end = new Date(event.end);

  if (timeFormat === "24h") {
    return `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`;
  }

  return `${format(start, "haaa")} – ${format(end, "haaa")}`;
}
