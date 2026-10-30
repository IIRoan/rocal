import { formatCalendarDayKey, getMonthGridWeeks } from "@workspace/calendar-core";

/** The month's weeks from the user's week start; days of neighbouring months stay blank. */
export function buildCalendarGridWeeks(viewMonth: Date, weekStartDay: number) {
  return getMonthGridWeeks(viewMonth, weekStartDay).map((week, index) => ({
    key: `week-${index}`,
    cells: week.map((date) => ({
      key: formatCalendarDayKey(date),
      day: date.getMonth() === viewMonth.getMonth() ? date.getDate() : null,
    })),
  }));
}
