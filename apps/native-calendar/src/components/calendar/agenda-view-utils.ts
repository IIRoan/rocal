import {
  formatClockTime,
  formatEventSpanLabel,
  formatPickerDate,
  getEventCalendarDayRange,
  isSamePickerDay,
  resolveTimezone,
  type DecoratedCalendarEvent,
  type TimeFormat,
} from "@workspace/calendar-core";

/** Wall-clock time for the section day: the event's own start, or the day's start when it began earlier. */
export function formatAgendaEventTime(
  event: DecoratedCalendarEvent,
  sectionDay: Date,
  timeFormat: TimeFormat,
  timezone?: string | null,
): { start: string; end: string } {
  const resolvedTimezone = resolveTimezone(timezone ?? event.timezone);

  if (event.allDay) {
    return { start: "All day", end: "" };
  }

  const { firstDay, lastDay } = getEventCalendarDayRange(
    event,
    resolvedTimezone,
  );
  const start = new Date(event.start);
  const end = new Date(event.end);

  if (isSamePickerDay(firstDay, lastDay)) {
    return {
      start: formatClockTime(start, resolvedTimezone, timeFormat),
      end: formatClockTime(end, resolvedTimezone, timeFormat),
    };
  }

  const dayStart = isSamePickerDay(sectionDay, firstDay)
    ? formatClockTime(start, resolvedTimezone, timeFormat)
    : "All day";
  const dayEnd = isSamePickerDay(sectionDay, lastDay)
    ? formatClockTime(end, resolvedTimezone, timeFormat)
    : "";

  return { start: dayStart, end: dayEnd };
}

/** Secondary line under an agenda row title: span for multi-day events, location otherwise. */
export function formatAgendaEventSubtitle(
  event: DecoratedCalendarEvent,
  timezone?: string | null,
): string | null {
  const resolvedTimezone = resolveTimezone(timezone ?? event.timezone);
  const { firstDay, lastDay } = getEventCalendarDayRange(
    event,
    resolvedTimezone,
  );
  if (!isSamePickerDay(firstDay, lastDay)) {
    return formatEventSpanLabel(event, resolvedTimezone);
  }
  return event.location?.trim() || null;
}

/** Section header labels for an agenda day, e.g. { day: "12", weekday: "Thu", month: "March" }. */
export function formatAgendaSectionHeader(day: Date): {
  day: string;
  weekday: string;
  month: string;
} {
  return {
    day: formatPickerDate(day, "d"),
    weekday: formatPickerDate(day, "EEE"),
    month: formatPickerDate(day, "MMMM"),
  };
}
