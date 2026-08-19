import { format, isSameMonth } from "date-fns";
import type { CalendarView } from "@workspace/calendar-core";
import {
  getThreeDayCalendarDays,
  getWeekCalendarRange,
  resolveTimezone,
} from "@workspace/calendar-core";

// ─── Date Header Formatting ──────────────────────────────────────────────────

/**
 * Format the date header string for a given calendar view and current date.
 *
 * - Month view: "January 2025"
 * - Week view: "Jan 13 – 19" or "Dec 30 – Jan 5" (cross-month)
 * - Day view: "Jan 15, 2025"
 * - 3-Day view: "Jan 14 – 16" or "Dec 31 – Jan 2" (cross-month)
 * - Agenda view: "January 2025"
 */
/** Month-only title for the calendar tab toolbar (e.g. "Jun 2025"). */
export function formatCalendarToolbarTitle(currentDate: Date): string {
  return format(currentDate, "MMM yyyy");
}

export function resolveCalendarSwitcherDate({
  currentDate,
}: {
  view: CalendarView;
  currentDate: Date;
  selectedDate: Date;
}): Date {
  return currentDate;
}

export function formatViewDateHeader(
  view: CalendarView,
  currentDate: Date,
  weekStartDay: number = 0,
  timezone?: string | null,
): string {
  switch (view) {
    case "month":
    case "agenda":
      return format(currentDate, "MMMM yyyy");

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
