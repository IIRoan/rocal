import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import type { CalendarView } from "./types";
import type { CalendarDateRange } from "./calendar-month-ranges";
import { getAgendaLastDay, getAgendaPageDate } from "./calendar-view-days";
import {
  formatCalendarWeekKey,
  formatInstantCalendarDayKey,
  formatInstantCalendarMonthKey,
  getZonedDayUtcBounds,
  resolveTimezone,
  utcToPickerDate,
  wallClockToUtc,
} from "./timezone";

type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TimezoneAwareCalendarDateRangeOptions {
  baseDate: Date;
  view: CalendarView;
  weekStartDay?: number | null;
  timezone?: string | null;
}

export interface SurroundingCalendarDateRangeOptions {
  currentDate: Date;
  view: CalendarView;
  weekStartDay?: number | null;
  pageRadius?: number;
  timezone?: string | null;
}

export interface PrefetchCalendarDateRangeOptions {
  currentDate: Date;
  view: CalendarView;
  direction: 1 | -1;
  weekStartDay?: number | null;
  timezone?: string | null;
}

/** Visible three-day-view days: yesterday, the center date, and tomorrow. */
export function getThreeDayCalendarDays(baseDate: Date): [Date, Date, Date] {
  return [addDays(baseDate, -1), new Date(baseDate), addDays(baseDate, 1)];
}

export function getCalendarPageDate(
  currentDate: Date,
  view: CalendarView,
  offset: number,
): Date {
  switch (view) {
    case "month":
      return addMonths(currentDate, offset);
    case "week":
      return addWeeks(currentDate, offset);
    case "day":
      return addDays(currentDate, offset);
    case "3day":
      return addDays(currentDate, offset * 3);
    case "agenda":
      return addMonths(currentDate, offset);
    default:
      return addMonths(currentDate, offset);
  }
}

export function navigateCalendarDate(
  currentDate: Date,
  view: CalendarView,
  direction: 1 | -1,
): Date {
  return getCalendarPageDate(currentDate, view, direction);
}

/** Pages the account-zone day an instant falls on and returns noon of the new day, so the browser's zone cannot shift it. */
export function navigateCalendarInstant(
  currentDate: Date,
  view: CalendarView,
  direction: 1 | -1,
  timezone?: string | null,
): Date {
  const resolvedTimezone = resolveTimezone(timezone);
  const day = utcToPickerDate(currentDate, resolvedTimezone);
  const target =
    view === "agenda"
      ? getAgendaPageDate(day, direction)
      : getCalendarPageDate(day, view, direction);
  return wallClockToUtc(target, 12, 0, resolvedTimezone);
}

/** UTC range of the first through last account-zone day a view shows around the calendar day `day`. */
function getCalendarDayViewRange(
  day: Date,
  view: CalendarView,
  weekStartDay: number | null | undefined,
  timezone: string,
): CalendarDateRange {
  const weekStartsOn = ((((weekStartDay ?? 1) % 7) + 7) % 7) as Day;
  const range = (firstDay: Date, lastDay: Date): CalendarDateRange => ({
    start: getZonedDayUtcBounds(firstDay, timezone).start,
    end: getZonedDayUtcBounds(lastDay, timezone).end,
  });

  switch (view) {
    case "day":
      return range(day, day);
    case "3day": {
      const [firstDay, , lastDay] = getThreeDayCalendarDays(day);
      return range(firstDay, lastDay);
    }
    case "week":
      return range(startOfWeek(day, { weekStartsOn }), endOfWeek(day, { weekStartsOn }));
    case "month":
      return range(
        startOfWeek(startOfMonth(day), { weekStartsOn }),
        endOfWeek(endOfMonth(day), { weekStartsOn }),
      );
    case "agenda":
      return range(day, getAgendaLastDay(day));
  }
}

/** UTC range of the account-zone days a view shows around the instant `baseDate`. */
export function getTimezoneAwareCalendarDateRange({
  baseDate,
  view,
  weekStartDay,
  timezone,
}: TimezoneAwareCalendarDateRangeOptions): CalendarDateRange {
  const resolvedTimezone = resolveTimezone(timezone);

  return getCalendarDayViewRange(
    utcToPickerDate(baseDate, resolvedTimezone),
    view,
    weekStartDay,
    resolvedTimezone,
  );
}

/** One fetch window covering the current page and nearby swipe pages. */
export function getSurroundingCalendarDateRange({
  currentDate,
  view,
  weekStartDay,
  pageRadius = 1,
  timezone,
}: SurroundingCalendarDateRangeOptions): CalendarDateRange {
  const radius = Math.max(0, Math.floor(pageRadius));
  let start: Date | null = null;
  let end: Date | null = null;
  const resolvedTimezone = resolveTimezone(timezone);
  const day = utcToPickerDate(currentDate, resolvedTimezone);

  for (let offset = -radius; offset <= radius; offset++) {
    const range = getCalendarDayViewRange(
      getCalendarPageDate(day, view, offset),
      view,
      weekStartDay,
      resolvedTimezone,
    );

    if (start == null || range.start < start) {
      start = range.start;
    }
    if (end == null || range.end > end) {
      end = range.end;
    }
  }

  return { start: start ?? currentDate, end: end ?? currentDate };
}

export function getPrefetchCalendarDateRange({
  currentDate,
  view,
  direction,
  weekStartDay,
  timezone,
}: PrefetchCalendarDateRangeOptions): CalendarDateRange {
  const resolvedTimezone = resolveTimezone(timezone);

  return getCalendarDayViewRange(
    getCalendarPageDate(
      utcToPickerDate(currentDate, resolvedTimezone),
      view,
      direction,
    ),
    view,
    weekStartDay,
    resolvedTimezone,
  );
}

/** Stable per-period key that drives calendar view transition animations. */
export function getCalendarViewAnimationKey(
  view: CalendarView,
  currentDate: Date,
  weekStartDay: number,
  timezone?: string | null,
): string {
  const resolvedTimezone = resolveTimezone(timezone);

  if (view === "day" || view === "3day" || view === "agenda") {
    return `${view}-${formatInstantCalendarDayKey(currentDate, resolvedTimezone)}`;
  }

  if (view === "week") {
    return `${view}-${formatCalendarWeekKey(currentDate, weekStartDay, resolvedTimezone)}`;
  }

  return `${view}-${formatInstantCalendarMonthKey(currentDate, resolvedTimezone)}`;
}
