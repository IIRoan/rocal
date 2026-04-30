import { addMonths, addWeeks, addDays } from "date-fns";
import type { CalendarView } from "@workspace/calendar-core";

/**
 * Compute the next/previous date when navigating a calendar view.
 * Forward: direction = 1, Backward: direction = -1
 */
export function navigateCalendarDate(
  currentDate: Date,
  view: CalendarView,
  direction: 1 | -1,
): Date {
  switch (view) {
    case "month":
      return addMonths(currentDate, direction);
    case "week":
      return addWeeks(currentDate, direction);
    case "day":
      return addDays(currentDate, direction);
    case "3day":
      return addDays(currentDate, direction * 3);
    case "agenda":
      return addMonths(currentDate, direction);
    default:
      return addMonths(currentDate, direction);
  }
}
