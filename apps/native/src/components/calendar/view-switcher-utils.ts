import { format, isSameMonth } from "date-fns";
import type { CalendarView } from "@workspace/calendar-core";
import {
  getWeekCalendarRange,
  resolveTimezone,
} from "@workspace/calendar-core";
import { getThreeDayDates } from "./timeline-utils";

// ─── View Labels ─────────────────────────────────────────────────────────────

const VIEW_LABELS: Record<CalendarView, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
  "3day": "3-Day",
  agenda: "Agenda",
};

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

const TIMELINE_VIEWS = new Set<CalendarView>(["week", "day", "3day"]);

/**
 * Date used by the calendar toolbar title. Timeline swipes preview the next
 * page before `selectedDate` commits, so the title must follow that preview
 * or it stays a week behind the day row.
 */
export function resolveCalendarSwitcherDate({
  view,
  currentDate,
  selectedDate,
  previewDate,
}: {
  view: CalendarView;
  currentDate: Date;
  selectedDate: Date;
  previewDate?: Date | null;
}): Date {
  if (TIMELINE_VIEWS.has(view)) {
    return previewDate ?? selectedDate;
  }

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
      const [rangeStart, , rangeEnd] = getThreeDayDates(currentDate);

      if (isSameMonth(rangeStart, rangeEnd)) {
        return `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "d")}`;
      }
      return `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "MMM d")}`;
    }

    default:
      return format(currentDate, "MMMM yyyy");
  }
}
