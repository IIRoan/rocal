import {
  addDays,
  isSameDay,
  startOfDay,
  endOfDay,
  isWithinInterval,
  isBefore,
  isAfter,
} from "date-fns";
import {
  eventOverlapsCalendarDay,
  getInclusiveCalendarDayRange,
  getTimedTimelineEventsForDay,
  getZonedDayUtcBounds,
  isSameCalendarDayInTimezone,
  isSamePickerDay,
  resolveTimezone,
  spansMultipleCalendarDays,
} from "@workspace/calendar-core";

import type { CalendarEvent } from "./types";
export {
  getColorSwatchValue,
  getEventColorClasses,
  getEventColorStyles,
  isHexColor,
  resolveEventColorValue,
  resolveInlineColorValue,
} from "./color-utils";

/**
 * Get CSS classes for border radius based on event position in multi-day events
 */
export function getBorderRadiusClasses(
  isFirstDay: boolean,
  isLastDay: boolean,
  options?: { connectAcrossCells?: boolean },
): string {
  const connectAcrossCells = options?.connectAcrossCells !== false;

  if (isFirstDay && isLastDay) {
    return "rounded";
  }

  if (isFirstDay) {
    return connectAcrossCells
      ? "rounded-l rounded-r-none not-in-data-[slot=popover-content]:w-[calc(100%+5px)]"
      : "rounded-l rounded-r-none";
  }

  if (isLastDay) {
    return connectAcrossCells
      ? "rounded-r rounded-l-none not-in-data-[slot=popover-content]:w-[calc(100%+4px)] not-in-data-[slot=popover-content]:-translate-x-[4px]"
      : "rounded-r rounded-l-none";
  }

  return connectAcrossCells
    ? "rounded-none not-in-data-[slot=popover-content]:w-[calc(100%+9px)] not-in-data-[slot=popover-content]:-translate-x-[4px]"
    : "rounded-none";
}

/**
 * Events rendered in the all-day header row of timeline views.
 * Includes true all-day events and timed events that span multiple calendar days.
 */
export function isAllDayRowEvent(
  event: CalendarEvent,
  timezone?: string,
): boolean {
  return event.allDay === true || isMultiDayEvent(event, timezone);
}

/**
 * Border segment flags for a multi-day or all-day event on a specific calendar day.
 */
export function getEventSegmentForCalendarDay(
  event: CalendarEvent,
  calendarDay: Date,
  timezone: string,
): { isFirstDay: boolean; isLastDay: boolean } {
  const { firstDay, lastDay } = getInclusiveCalendarDayRange(
    new Date(event.start),
    new Date(event.end),
    timezone,
    { allDay: event.allDay },
  );

  return {
    isFirstDay: isSamePickerDay(calendarDay, firstDay),
    isLastDay: isSamePickerDay(calendarDay, lastDay),
  };
}

/**
 * Check if an event is a multi-day event
 */
export function isMultiDayEvent(
  event: CalendarEvent,
  timezone?: string,
): boolean {
  if (timezone) {
    return spansMultipleCalendarDays(
      new Date(event.start),
      new Date(event.end),
      timezone,
      { allDay: event.allDay },
    );
  }

  const rawStart = new Date(event.start);
  const rawEnd = new Date(event.end);
  const eventStart = startOfDay(rawStart);
  let eventEnd = startOfDay(rawEnd);

  if (event.allDay && eventEnd > eventStart) {
    eventEnd = addDays(eventEnd, -1);
  }

  return !isSameDay(eventStart, eventEnd);
}

/**
 * Normalize an event's interval for overlap checks.
 * - For day-level granularity: compare on day boundaries and treat end as endOfDay
 * - For time-level granularity: use actual start/end
 */
export function getEventInterval(
  event: CalendarEvent,
  granularity: "day" | "time" = "day",
  timezone?: string,
): { start: Date; end: Date } {
  const rawStart = new Date(event.start);
  const rawEnd = new Date(event.end);

  if (granularity === "time") {
    // Use precise times; guard against inverted ranges
    const start = rawStart <= rawEnd ? rawStart : rawEnd;
    const end = rawEnd >= rawStart ? rawEnd : rawStart;
    return { start, end };
  }

  if (timezone) {
    const { firstDay, lastDay } = getInclusiveCalendarDayRange(
      rawStart,
      rawEnd,
      timezone,
      { allDay: event.allDay },
    );

    if (!event.allDay && isSamePickerDay(firstDay, lastDay)) {
      return { start: rawStart, end: rawEnd };
    }

    return {
      start: getZonedDayUtcBounds(firstDay, timezone).start,
      end: getZonedDayUtcBounds(lastDay, timezone).end,
    };
  }

  // Day-level comparisons: inclusive of the final day
  const start = startOfDay(rawStart);
  const end = endOfDay(rawEnd);
  return { start, end };
}

/**
 * Check if an event overlaps a target range [start, end]
 * Uses day-level or time-level semantics.
 */
export function eventOverlapsRange(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
  granularity: "day" | "time" = "day",
  timezone?: string,
): boolean {
  const { start, end } = getEventInterval(event, granularity, timezone);
  const bounds =
    granularity === "day" && timezone
      ? {
        start: getZonedDayUtcBounds(rangeStart, timezone).start,
        end: getZonedDayUtcBounds(rangeEnd, timezone).end,
      }
      : null;
  const rStart = bounds
    ? bounds.start
    : granularity === "day"
      ? startOfDay(rangeStart)
      : rangeStart;
  const rEnd = bounds
    ? bounds.end
    : granularity === "day"
      ? endOfDay(rangeEnd)
      : rangeEnd;

  return start < rEnd && end > rStart;
}

/**
 * Check if an event overlaps a calendar picker day in the user's timezone.
 */
export function calendarDayOverlapsEvent(
  event: CalendarEvent,
  calendarDay: Date,
  timezone: string,
): boolean {
  return eventOverlapsCalendarDay(event, calendarDay, timezone);
}

export { getTimedTimelineEventsForDay };

/**
 * Filter events for a specific day
 */
export function getEventsForDay(
  events: CalendarEvent[],
  day: Date,
  timezone?: string,
): CalendarEvent[] {
  return events
    .filter((event) => {
      const eventStart = new Date(event.start);
      if (timezone) {
        return isSameCalendarDayInTimezone(eventStart, day, timezone);
      }
      return isSameDay(day, eventStart);
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/**
 * Sort events with multi-day events first, then by start time
 */
export function sortEvents(
  events: CalendarEvent[],
  timezone?: string,
): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const aIsMultiDay = isMultiDayEvent(a, timezone);
    const bIsMultiDay = isMultiDayEvent(b, timezone);

    if (aIsMultiDay && !bIsMultiDay) return -1;
    if (!aIsMultiDay && bIsMultiDay) return 1;

    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });
}

/**
 * Get multi-day events that span across a specific day (but don't start on that day)
 */
export function getSpanningEventsForDay(
  events: CalendarEvent[],
  day: Date,
  timezone?: string,
): CalendarEvent[] {
  const { start: dayStart, end: dayEnd } = timezone
    ? getZonedDayUtcBounds(day, timezone)
    : { start: startOfDay(day), end: endOfDay(day) };

  return events.filter((event) => {
    if (!isMultiDayEvent(event, timezone)) return false;
    const { firstDay, lastDay } = getInclusiveCalendarDayRange(
      new Date(event.start),
      new Date(event.end),
      timezone ?? resolveTimezone(),
      { allDay: event.allDay },
    );
    const { start: dayStart, end: dayEnd } = timezone
      ? getZonedDayUtcBounds(day, timezone)
      : { start: startOfDay(day), end: endOfDay(day) };
    const intervalStart = timezone
      ? getZonedDayUtcBounds(firstDay, timezone).start
      : startOfDay(firstDay);
    const intervalEnd = timezone
      ? getZonedDayUtcBounds(lastDay, timezone).end
      : endOfDay(lastDay);

    return (
      !(timezone
        ? isSamePickerDay(day, firstDay)
        : isSameDay(day, firstDay)) &&
      intervalStart < dayEnd &&
      intervalEnd > dayStart
    );
  });
}

/**
 * Get all events visible on a specific day (starting, ending, or spanning)
 */
export function getAllEventsForDay(
  events: CalendarEvent[],
  day: Date,
  timezone?: string,
): CalendarEvent[] {
  if (timezone) {
    return events.filter((event) =>
      calendarDayOverlapsEvent(event, day, timezone),
    );
  }

  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  return events.filter((event) =>
    eventOverlapsRange(event, dayStart, dayEnd, "day"),
  );
}

/**
 * Get all events for a day (for agenda view)
 */
export function getAgendaEventsForDay(
  events: CalendarEvent[],
  day: Date,
  timezone?: string,
): CalendarEvent[] {
  if (timezone) {
    return events
      .filter((event) => calendarDayOverlapsEvent(event, day, timezone))
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
  }

  return events
    .filter((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      return (
        isSameDay(day, eventStart) ||
        isSameDay(day, eventEnd) ||
        (day > eventStart && day < eventEnd)
      );
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/**
 * Add hours to a date
 */
export function addHoursToDate(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

/**
 * Add minutes to a date
 */
export function addMinutesToDate(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}
