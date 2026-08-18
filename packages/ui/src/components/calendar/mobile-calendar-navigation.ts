import {
  addDays,
  addMonths,
  addWeeks,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";

import { AgendaDaysToShow } from "./constants";
import type { CalendarView } from "./types";

export function shiftMobileCalendarDate(
  date: Date,
  view: CalendarView,
  direction: 1 | -1,
): Date {
  switch (view) {
    case "day":
      return direction > 0 ? addDays(date, 1) : subDays(date, 1);
    case "3day":
      return direction > 0 ? addDays(date, 3) : subDays(date, 3);
    case "week":
      return direction > 0 ? addWeeks(date, 1) : subWeeks(date, 1);
    case "month":
      return direction > 0 ? addMonths(date, 1) : subMonths(date, 1);
    case "agenda":
      return direction > 0
        ? addDays(date, AgendaDaysToShow)
        : subDays(date, AgendaDaysToShow);
    default:
      return direction > 0 ? addWeeks(date, 1) : subWeeks(date, 1);
  }
}
