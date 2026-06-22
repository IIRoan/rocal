import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { AgendaDaysToShow, type CalendarView } from "./types";
import type { CalendarDateRange } from "./calendar-month-ranges";
import {
  formatCalendarDayKey,
  formatCalendarMonthKey,
  formatCalendarWeekKey,
  getWeekCalendarDays,
  getZonedDayUtcBounds,
  resolveTimezone,
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

/**
 * Visible calendar days in the three-day view (yesterday, center, tomorrow).
 */
export function getThreeDayCalendarDays(baseDate: Date): [Date, Date, Date] {
  return [addDays(baseDate, -1), new Date(baseDate), addDays(baseDate, 1)];
}

/**
 * Compute the base date for any calendar page offset.
 */
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

/**
 * Compute the next/previous date when navigating a calendar view.
 */
export function navigateCalendarDate(
  currentDate: Date,
  view: CalendarView,
  direction: 1 | -1,
): Date {
  return getCalendarPageDate(currentDate, view, direction);
}

/**
 * Returns the timezone-aware fetch range for a calendar view centered on baseDate.
 */
export function getTimezoneAwareCalendarDateRange({
  baseDate,
  view,
  weekStartDay,
  timezone,
}: TimezoneAwareCalendarDateRangeOptions): CalendarDateRange {
  const resolvedTimezone = resolveTimezone(timezone);

  if (view === "day") {
    return getZonedDayUtcBounds(baseDate, resolvedTimezone);
  }

  if (view === "3day") {
    const [firstDay, , lastDay] = getThreeDayCalendarDays(baseDate);
    return {
      start: getZonedDayUtcBounds(firstDay, resolvedTimezone).start,
      end: getZonedDayUtcBounds(lastDay, resolvedTimezone).end,
    };
  }

  if (view === "week") {
    const days = getWeekCalendarDays(
      baseDate,
      weekStartDay ?? 1,
      resolvedTimezone,
    );
    const firstDay = days[0] ?? baseDate;
    const lastDay = days[days.length - 1] ?? baseDate;
    return {
      start: getZonedDayUtcBounds(firstDay, resolvedTimezone).start,
      end: getZonedDayUtcBounds(lastDay, resolvedTimezone).end,
    };
  }

  if (view === "month") {
    const weekStartsOn = ((weekStartDay ?? 1) % 7) as Day;
    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(baseDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn });

    return {
      start: getZonedDayUtcBounds(gridStart, resolvedTimezone).start,
      end: getZonedDayUtcBounds(gridEnd, resolvedTimezone).end,
    };
  }

  if (view === "agenda") {
    const lastDay = addDays(baseDate, AgendaDaysToShow - 1);

    return {
      start: getZonedDayUtcBounds(baseDate, resolvedTimezone).start,
      end: getZonedDayUtcBounds(lastDay, resolvedTimezone).end,
    };
  }

  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);

  return {
    start: getZonedDayUtcBounds(monthStart, resolvedTimezone).start,
    end: getZonedDayUtcBounds(monthEnd, resolvedTimezone).end,
  };
}

/**
 * Compute one fetch window covering the current page and nearby swipe pages.
 */
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

  for (let offset = -radius; offset <= radius; offset++) {
    const baseDate = getCalendarPageDate(currentDate, view, offset);
    const range = getTimezoneAwareCalendarDateRange({
      baseDate,
      view,
      weekStartDay,
      timezone: resolvedTimezone,
    });

    if (start == null || range.start < start) {
      start = range.start;
    }
    if (end == null || range.end > end) {
      end = range.end;
    }
  }

  return { start: start ?? currentDate, end: end ?? currentDate };
}

/**
 * Returns the fetch range for the adjacent calendar page (prev/next prefetch).
 */
export function getPrefetchCalendarDateRange({
  currentDate,
  view,
  direction,
  weekStartDay,
  timezone,
}: PrefetchCalendarDateRangeOptions): CalendarDateRange {
  const nextDate = getCalendarPageDate(currentDate, view, direction);

  return getTimezoneAwareCalendarDateRange({
    baseDate: nextDate,
    view,
    weekStartDay,
    timezone,
  });
}

/**
 * Stable key used to animate calendar view transitions when the visible period changes.
 */
export function getCalendarViewAnimationKey(
  view: CalendarView,
  currentDate: Date,
  weekStartDay: number,
  timezone?: string | null,
): string {
  const resolvedTimezone = resolveTimezone(timezone);

  if (view === "day" || view === "3day" || view === "agenda") {
    return `${view}-${formatCalendarDayKey(currentDate)}`;
  }

  if (view === "week") {
    return `${view}-${formatCalendarWeekKey(currentDate, weekStartDay, resolvedTimezone)}`;
  }

  return `${view}-${formatCalendarMonthKey(currentDate)}`;
}
