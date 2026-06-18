import {
  getThreeDayCalendarDays,
  getZonedDateParts,
  resolveTimezone,
  utcToPickerDate,
} from "@workspace/calendar-core";
import { endOfDay, startOfDay } from "date-fns";

import type { CalendarEvent } from "./types";
import {
  eventOverlapsRange,
  getEventSegmentForCalendarDay,
  isAllDayRowEvent,
  sortEvents,
} from "./utils";
import { WeekCellsHeight } from "./constants";

export { getThreeDayCalendarDays };

export function getThreeDayLocalRangeBounds(days: [Date, Date, Date]): {
  rangeStart: Date;
  rangeEnd: Date;
} {
  return {
    rangeStart: startOfDay(days[0]),
    rangeEnd: endOfDay(days[2]),
  };
}

export function getThreeDayTimelineScrollTop(
  days: Date[],
  timezone?: string | null,
  options?: {
    defaultHour?: number;
    leadingCellOffset?: number;
    cellHeight?: number;
    now?: Date;
  },
): number {
  const resolvedTimezone = resolveTimezone(timezone);
  const defaultHour = options?.defaultHour ?? 9;
  const leadingCellOffset = options?.leadingCellOffset ?? 1;
  const cellHeight = options?.cellHeight ?? WeekCellsHeight;
  const now = options?.now ?? new Date();
  const today = utcToPickerDate(now, resolvedTimezone);
  const hasToday = days.some(
    (day) =>
      day.getFullYear() === today.getFullYear() &&
      day.getMonth() === today.getMonth() &&
      day.getDate() === today.getDate(),
  );
  let targetHour = defaultHour;

  if (hasToday) {
    const nowParts = getZonedDateParts(now, resolvedTimezone);
    targetHour = nowParts.hours + nowParts.minutes / 60;
  }

  return Math.max(0, targetHour * cellHeight - leadingCellOffset * cellHeight);
}

export function getThreeDayAllDayEvents(events: CalendarEvent[], baseDate: Date, timezone?: string | null) {
  const days = getThreeDayCalendarDays(baseDate);
  const { rangeStart, rangeEnd } = getThreeDayLocalRangeBounds(days);
  const resolvedTimezone = resolveTimezone(timezone);

  return events
    .filter((event) => isAllDayRowEvent(event))
    .filter((event) =>
      eventOverlapsRange(event, rangeStart, rangeEnd, "day", resolvedTimezone),
    );
}

export function groupThreeDayAllDayEventsByDay(
  events: CalendarEvent[],
  baseDate: Date,
  timezone?: string | null,
): CalendarEvent[][] {
  const days = getThreeDayCalendarDays(baseDate);
  const allDayEvents = getThreeDayAllDayEvents(events, baseDate, timezone);
  const resolvedTimezone = resolveTimezone(timezone);

  return days.map((day) =>
    sortEvents(
      allDayEvents.filter((event) =>
        eventOverlapsRange(event, day, day, "day", resolvedTimezone),
      ),
      resolvedTimezone,
    ),
  );
}
