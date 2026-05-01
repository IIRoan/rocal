import { addMonths, addWeeks, addDays } from "date-fns";
import {
  getDefaultCalendarDateRange,
  type CalendarView,
} from "@workspace/calendar-core";

interface SurroundingCalendarDateRangeOptions {
  currentDate: Date;
  view: CalendarView;
  weekStartDay?: number | null;
  pageRadius?: number;
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
 * Compute one fetch window covering the current page and nearby swipe pages.
 */
export function getSurroundingCalendarDateRange({
  currentDate,
  view,
  weekStartDay,
  pageRadius = 1,
}: SurroundingCalendarDateRangeOptions): { start: Date; end: Date } {
  const radius = Math.max(0, Math.floor(pageRadius));
  let start: Date | null = null;
  let end: Date | null = null;

  for (let offset = -radius; offset <= radius; offset++) {
    const baseDate = getCalendarPageDate(currentDate, view, offset);
    const range = getDefaultCalendarDateRange({
      baseDate,
      view,
      weekStartDay,
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
 * Compute the next/previous date when navigating a calendar view.
 * Forward: direction = 1, Backward: direction = -1
 */
export function navigateCalendarDate(
  currentDate: Date,
  view: CalendarView,
  direction: 1 | -1,
): Date {
  return getCalendarPageDate(currentDate, view, direction);
}
