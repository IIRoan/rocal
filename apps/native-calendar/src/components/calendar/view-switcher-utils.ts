import { format, isSameMonth, isSameYear } from "date-fns";
import type { CalendarView } from "@workspace/calendar-core";
import {
  getAgendaLastDay,
  getThreeDayCalendarDays,
  getWeekCalendarRange,
  resolveTimezone,
} from "@workspace/calendar-core";
import { isTimelineCalendarView } from "../../lib/calendar-views";

/** Month-only title for the calendar tab toolbar (e.g. "Jun 2025"). */
export function formatCalendarToolbarTitle(currentDate: Date): string {
  return format(currentDate, "MMM yyyy");
}

/** Timelines preview the swiped page via `currentDate`; month and agenda only move on commit, so they follow `selectedDate`. */
export function resolveCalendarSwitcherDate({
  view,
  currentDate,
  selectedDate,
}: {
  view: CalendarView;
  currentDate: Date;
  selectedDate: Date;
}): Date {
  return isTimelineCalendarView(view) ? currentDate : selectedDate;
}

function formatAgendaHeader(startDate: Date): string {
  const lastDay = getAgendaLastDay(startDate);
  if (isSameMonth(startDate, lastDay)) {
    return format(startDate, "MMMM yyyy");
  }
  if (isSameYear(startDate, lastDay)) {
    return `${format(startDate, "MMM")} – ${format(lastDay, "MMM yyyy")}`;
  }
  return `${format(startDate, "MMM yyyy")} – ${format(lastDay, "MMM yyyy")}`;
}

export function formatViewDateHeader(
  view: CalendarView,
  currentDate: Date,
  weekStartDay: number = 0,
  timezone?: string | null,
): string {
  switch (view) {
    case "month":
      return format(currentDate, "MMMM yyyy");

    case "agenda":
      return formatAgendaHeader(currentDate);

    case "week": {
      const { start: weekStart, end: weekEnd } = getWeekCalendarRange(
        currentDate,
        weekStartDay,
        resolveTimezone(timezone),
      );

      if (isSameMonth(weekStart, weekEnd)) {
        return `${format(weekStart, "MMM d")} – ${format(weekEnd, "d")}`;
      }
      return `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d")}`;
    }

    case "day":
      return format(currentDate, "MMM d, yyyy");

    case "3day": {
      const [rangeStart, , rangeEnd] = getThreeDayCalendarDays(currentDate);

      if (isSameMonth(rangeStart, rangeEnd)) {
        return `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "d")}`;
      }
      return `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "MMM d")}`;
    }

    default:
      return format(currentDate, "MMMM yyyy");
  }
}
