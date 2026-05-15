import { format, startOfWeek, endOfWeek, isSameMonth } from "date-fns";
import type { CalendarView } from "@workspace/calendar-core";
import { getThreeDayDates } from "./timeline-utils";

// ─── View Labels ─────────────────────────────────────────────────────────────

export const VIEW_LABELS: Record<CalendarView, string> = {
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
export function formatViewDateHeader(
  view: CalendarView,
  currentDate: Date,
  weekStartDay: number = 0,
): string {
  switch (view) {
    case "month":
    case "agenda":
      return format(currentDate, "MMMM yyyy");

    case "week": {
      const weekStart = startOfWeek(currentDate, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });
      const weekEnd = endOfWeek(currentDate, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      });

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
