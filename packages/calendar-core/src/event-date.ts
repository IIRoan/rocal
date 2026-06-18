import { format } from "date-fns";

import type { CalendarEvent } from "./types";
import {
  eventOverlapsZonedCalendarDay,
  formatInUserTimezone,
  getInclusiveCalendarDayRange,
  resolveTimezone,
  spansMultipleCalendarDays,
  utcToPickerDate,
} from "./timezone";

export type EventDateInput = Pick<CalendarEvent, "start" | "end" | "allDay"> & {
  timezone?: string | null;
};

export type PickerDateRangeDisplay = {
  isSameDay: boolean;
  label: string;
  startLabel: string;
  endLabel: string;
};

/** Format a picker calendar day using its local date components (not as a UTC instant). */
export function formatPickerDate(pickerDate: Date, pattern: string): string {
  return format(pickerDate, pattern);
}

/** Map stored UTC instants to picker days for editor forms. */
export function getEventPickerDateRange(
  event: EventDateInput,
  timezone?: string | null,
): { startDate: Date; endDate: Date } {
  const resolvedTimezone = resolveTimezone(timezone ?? event.timezone);
  const start = new Date(event.start);
  const end = new Date(event.end);

  if (event.allDay) {
    const { firstDay, lastDay } = getInclusiveCalendarDayRange(
      start,
      end,
      resolvedTimezone,
      { allDay: true },
    );
    return { startDate: firstDay, endDate: lastDay };
  }

  return {
    startDate: utcToPickerDate(start, resolvedTimezone),
    endDate: utcToPickerDate(end, resolvedTimezone),
  };
}

export function getPickerDateRangeDisplay(
  startDate: Date,
  endDate: Date,
): PickerDateRangeDisplay {
  const isSameDay =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate();
  const label = formatPickerDate(startDate, "EEEE, MMMM d, yyyy");
  const startLabel = formatPickerDate(startDate, "EEE, MMM d");
  const endLabel = isSameDay
    ? startLabel
    : formatPickerDate(endDate, "EEE, MMM d, yyyy");

  return {
    isSameDay,
    label,
    startLabel,
    endLabel,
  };
}

export function formatEventCalendarDate(
  event: EventDateInput,
  timezone?: string | null,
  pattern = "EEEE, MMMM d, yyyy",
): string {
  const resolvedTimezone = resolveTimezone(timezone ?? event.timezone);
  const start = new Date(event.start);
  const end = new Date(event.end);

  if (event.allDay) {
    const { firstDay } = getInclusiveCalendarDayRange(start, end, resolvedTimezone, {
      allDay: true,
    });
    return formatPickerDate(firstDay, pattern);
  }

  return formatInUserTimezone(start, resolvedTimezone, pattern);
}

export function eventOverlapsCalendarDay(
  event: EventDateInput,
  calendarDay: Date,
  timezone?: string | null,
): boolean {
  const resolvedTimezone = resolveTimezone(timezone ?? event.timezone);

  return eventOverlapsZonedCalendarDay(
    new Date(event.start),
    new Date(event.end),
    calendarDay,
    resolvedTimezone,
    { allDay: event.allDay === true },
  );
}

export type TimedTimelineEventsOptions = {
  excludeMultiDay?: boolean;
};

export function getTimedTimelineEventsForDay<T extends EventDateInput>(
  events: T[],
  day: Date,
  timezone?: string | null,
  options?: TimedTimelineEventsOptions,
): T[] {
  const resolvedTimezone = resolveTimezone(timezone);

  return events.filter((event) => {
    if (event.allDay) return false;

    if (
      options?.excludeMultiDay &&
      spansMultipleCalendarDays(
        new Date(event.start),
        new Date(event.end),
        resolvedTimezone,
        { allDay: false },
      )
    ) {
      return false;
    }

    return eventOverlapsZonedCalendarDay(
      new Date(event.start),
      new Date(event.end),
      day,
      resolvedTimezone,
    );
  });
}
