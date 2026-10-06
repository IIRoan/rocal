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
  eventSpansMultipleCalendarDays,
  getEventCalendarDayRange,
  getTimedTimelineEventsForDay,
  getZonedDayUtcBounds,
  isSameCalendarDayInTimezone,
  isSamePickerDay,
  resolveTimezone,
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

/** True for ghost previews that mergePreviewCalendarEvents injected with an isPreview flag. */
export function isPreviewEvent(event: CalendarEvent): boolean {
  return (event as CalendarEvent & { isPreview?: boolean }).isPreview === true;
}

/** Border-radius classes for an event's position in a multi-day span. */
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

/** All-day header row: true all-day events plus timed events spanning multiple days. */
export function isAllDayRowEvent(
  event: CalendarEvent,
  timezone?: string,
): boolean {
  return event.allDay === true || isMultiDayEvent(event, timezone);
}

/** Border segment flags for an event on a specific calendar day. */
export function getEventSegmentForCalendarDay(
  event: CalendarEvent,
  calendarDay: Date,
  timezone: string,
): { isFirstDay: boolean; isLastDay: boolean } {
  const { firstDay, lastDay } = getEventCalendarDayRange(event, timezone);

  return {
    isFirstDay: isSamePickerDay(calendarDay, firstDay),
    isLastDay: isSamePickerDay(calendarDay, lastDay),
  };
}

export function isMultiDayEvent(
  event: CalendarEvent,
  timezone?: string,
): boolean {
  if (timezone) {
    return eventSpansMultipleCalendarDays(event, timezone);
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

/** Interval for overlap checks: day granularity compares day boundaries; time granularity uses the actual instants. */
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
    const { firstDay, lastDay } = getEventCalendarDayRange(event, timezone);

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

export function calendarDayOverlapsEvent(
  event: CalendarEvent,
  calendarDay: Date,
  timezone: string,
): boolean {
  return eventOverlapsCalendarDay(event, calendarDay, timezone);
}

export { getTimedTimelineEventsForDay };

export function getEventsForDay(
  events: CalendarEvent[],
  day: Date,
  timezone?: string,
): CalendarEvent[] {
  return events
    .filter((event) => {
      const eventStart = new Date(event.start);
      if (timezone && event.allDay) {
        return isSamePickerDay(
          getEventCalendarDayRange(event, timezone).firstDay,
          day,
        );
      }
      if (timezone) {
        return isSameCalendarDayInTimezone(eventStart, day, timezone);
      }
      return isSameDay(day, eventStart);
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/** Multi-day events first, then by start time. */
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

/** Multi-day events spanning a day without starting on it. */
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
    const { firstDay, lastDay } = getEventCalendarDayRange(
      event,
      timezone ?? resolveTimezone(),
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

/** Events starting, ending, or spanning the day. */
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

export function addHoursToDate(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

export function addMinutesToDate(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}
