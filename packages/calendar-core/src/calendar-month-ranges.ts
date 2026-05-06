import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns";

export interface CalendarDateRange {
  start: Date;
  end: Date;
}

export interface CalendarMonthRangeOptions {
  includeCurrent?: boolean;
  adjacentMonthDepth?: number;
  paddingDays?: number;
}

export const DEFAULT_CALENDAR_MONTH_PADDING_DAYS = 7;

export function getCalendarMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getPaddedCalendarMonthRange(
  date: Date,
  paddingDays = DEFAULT_CALENDAR_MONTH_PADDING_DAYS,
): CalendarDateRange {
  const first = startOfMonth(date);
  const last = endOfMonth(date);

  const start = new Date(first);
  start.setDate(start.getDate() - paddingDays);
  start.setHours(0, 0, 0, 0);

  const end = new Date(last);
  end.setDate(end.getDate() + paddingDays);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function buildPaddedCalendarMonthRanges(
  centerDate: Date,
  {
    includeCurrent = true,
    adjacentMonthDepth = 1,
    paddingDays = DEFAULT_CALENDAR_MONTH_PADDING_DAYS,
  }: CalendarMonthRangeOptions = {},
): CalendarDateRange[] {
  const ranges: CalendarDateRange[] = [];

  if (includeCurrent) {
    ranges.push(getPaddedCalendarMonthRange(centerDate, paddingDays));
  }

  for (let offset = 1; offset <= adjacentMonthDepth; offset += 1) {
    ranges.push(
      getPaddedCalendarMonthRange(subMonths(centerDate, offset), paddingDays),
    );
    ranges.push(
      getPaddedCalendarMonthRange(addMonths(centerDate, offset), paddingDays),
    );
  }

  return ranges;
}
