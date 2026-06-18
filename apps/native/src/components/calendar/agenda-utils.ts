import { format, isToday, isTomorrow, startOfDay, compareAsc } from "date-fns";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import {
  formatCalendarDayKey,
  formatInUserTimezone,
  getZonedDateParts,
  isTodayInTimezone,
  resolveTimezone,
} from "@workspace/calendar-core";

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
export function formatAgendaDate(date: Date, timezone?: string): string {
  if (timezone) {
    const resolvedTimezone = resolveTimezone(timezone);
    if (isTodayInTimezone(date, resolvedTimezone)) return "Today";
    const todayParts = getZonedDateParts(new Date(), resolvedTimezone);
    const tomorrow = new Date(
      todayParts.year,
      todayParts.month - 1,
      todayParts.day + 1,
    );
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return format(date, "EEEE, MMM d");
  }

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
    "h:mm a",
  )} – ${formatInUserTimezone(end, resolvedTimezone, "h:mm a")}`;
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
  timezone?: string,
): AgendaSection[] {
  if (events.length === 0) return [];

  // Group by date key
  const map = new Map<
    string,
    { date: Date; events: DecoratedCalendarEvent[] }
  >();

  const resolvedTimezone = timezone ? resolveTimezone(timezone) : null;

  for (const event of events) {
    const day = resolvedTimezone
      ? (() => {
          const { year, month, day } = getZonedDateParts(
            new Date(event.start),
            resolvedTimezone,
          );
          return new Date(year, month - 1, day);
        })()
      : startOfDay(new Date(event.start));
    const key = formatCalendarDayKey(day);

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
    title: formatAgendaDate(date, resolvedTimezone ?? undefined),
    data: sectionEvents.sort((a, b) => {
      // All-day events come first
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return compareAsc(new Date(a.start), new Date(b.start));
    }),
  }));
}
