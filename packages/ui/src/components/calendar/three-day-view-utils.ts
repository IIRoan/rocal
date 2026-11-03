import {
  getThreeDayCalendarDays as getThreeDaysAroundPickerDay,
  getZonedDateParts,
  resolveTimezone,
  utcToPickerDate,
} from "@workspace/calendar-core";

import { WeekCellsHeight } from "./constants";

/** Account-zone days around the selected instant, like getWeekCalendarDays. */
export function getThreeDayCalendarDays(
  currentDate: Date,
  timezone?: string | null,
): [Date, Date, Date] {
  return getThreeDaysAroundPickerDay(
    utcToPickerDate(currentDate, resolveTimezone(timezone)),
  );
}

export const THREE_DAY_GRID_COLS = "grid-cols-[3rem_repeat(3,minmax(0,1fr))]";

export function getThreeDayTimelineScrollTop(
  days: Date[],
  timezone?: string | null,
  options?: {
    defaultHour?: number;
    leadingCellOffset?: number;
    cellHeight?: number;
    now?: Date;
  },
): number {
  const resolvedTimezone = resolveTimezone(timezone);
  const defaultHour = options?.defaultHour ?? 9;
  const leadingCellOffset = options?.leadingCellOffset ?? 1;
  const cellHeight = options?.cellHeight ?? WeekCellsHeight;
  const now = options?.now ?? new Date();
  const today = utcToPickerDate(now, resolvedTimezone);
  const hasToday = days.some(
    (day) =>
      day.getFullYear() === today.getFullYear() &&
      day.getMonth() === today.getMonth() &&
      day.getDate() === today.getDate(),
  );
  let targetHour = defaultHour;

  if (hasToday) {
    const nowParts = getZonedDateParts(now, resolvedTimezone);
    targetHour = nowParts.hours + nowParts.minutes / 60;
  }

  return Math.max(0, targetHour * cellHeight - leadingCellOffset * cellHeight);
}
