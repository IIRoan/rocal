import { format, isToday, isTomorrow, startOfDay, compareAsc } from "date-fns";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgendaSection {
  title: string;
  data: DecoratedCalendarEvent[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format a date for use as an agenda section header.
 *
 * - Returns "Today" if the date is today
 * - Returns "Tomorrow" if the date is tomorrow
 * - Otherwise returns a formatted string like "Wednesday, Jan 15"
 */
export function formatAgendaDate(date: Date): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEEE, MMM d");
}

/**
 * Format an event's time range for display in the agenda list.
 *
 * - All-day events return "All day"
 * - 12h format: "9:00 AM – 10:00 AM"
 * - 24h format: "09:00 – 10:00"
 */
export function formatEventTime(
  event: DecoratedCalendarEvent,
  timeFormat: "12h" | "24h" = "12h",
): string {
  if (event.allDay) return "All day";

  const start = new Date(event.start);
  const end = new Date(event.end);

  if (timeFormat === "24h") {
    return `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`;
  }

  return `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
}

/**
 * Group a flat list of events into sections keyed by date, suitable for
 * React Native's `SectionList`.
 *
 * Events are grouped by their start date and sorted chronologically
 * within each section. Sections themselves are ordered by date ascending.
 */
export function groupEventsIntoSections(
  events: DecoratedCalendarEvent[],
): AgendaSection[] {
  if (events.length === 0) return [];

  // Group by date key
  const map = new Map<
    string,
    { date: Date; events: DecoratedCalendarEvent[] }
  >();

  for (const event of events) {
    const day = startOfDay(new Date(event.start));
    const key = format(day, "yyyy-MM-dd");

    const entry = map.get(key);
    if (entry) {
      entry.events.push(event);
    } else {
      map.set(key, { date: day, events: [event] });
    }
  }

  // Sort sections by date ascending
  const sortedEntries = Array.from(map.values()).sort((a, b) =>
    compareAsc(a.date, b.date),
  );

  // Sort events within each section by start time, all-day events first
  return sortedEntries.map(({ date, events: sectionEvents }) => ({
    title: formatAgendaDate(date),
    data: sectionEvents.sort((a, b) => {
      // All-day events come first
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return compareAsc(new Date(a.start), new Date(b.start));
    }),
  }));
}
