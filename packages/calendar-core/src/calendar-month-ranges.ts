import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns";
import {
  formatCalendarMonthKey,
  getZonedDayUtcBounds,
  resolveTimezone,
} from "./timezone";

export interface CalendarDateRange {
  start: Date;
  end: Date;
}

export interface CalendarMonthRangeOptions {
  includeCurrent?: boolean;
  adjacentMonthDepth?: number;
  paddingDays?: number;
  timezone?: string;
}

export const DEFAULT_CALENDAR_MONTH_PADDING_DAYS = 7;

export function getCalendarMonthKey(date: Date): string {
  return formatCalendarMonthKey(date);
}

export function getPaddedCalendarMonthRange(
  date: Date,
  paddingDays = DEFAULT_CALENDAR_MONTH_PADDING_DAYS,
  timezone?: string,
): CalendarDateRange {
  const first = startOfMonth(date);
  const last = endOfMonth(date);

  const start = new Date(first);
  start.setDate(start.getDate() - paddingDays);

  const end = new Date(last);
  end.setDate(end.getDate() + paddingDays);
  const resolvedTimezone = resolveTimezone(timezone);
  return {
    start: getZonedDayUtcBounds(start, resolvedTimezone).start,
    end: getZonedDayUtcBounds(end, resolvedTimezone).end,
  };
}

export function buildPaddedCalendarMonthRanges(
  centerDate: Date,
  {
    includeCurrent = true,
    adjacentMonthDepth = 1,
    paddingDays = DEFAULT_CALENDAR_MONTH_PADDING_DAYS,
    timezone,
  }: CalendarMonthRangeOptions = {},
): CalendarDateRange[] {
  const ranges: CalendarDateRange[] = [];

  if (includeCurrent) {
    ranges.push(getPaddedCalendarMonthRange(centerDate, paddingDays, timezone));
  }

  for (let offset = 1; offset <= adjacentMonthDepth; offset += 1) {
    ranges.push(
      getPaddedCalendarMonthRange(
        subMonths(centerDate, offset),
        paddingDays,
        timezone,
      ),
    );
    ranges.push(
      getPaddedCalendarMonthRange(
        addMonths(centerDate, offset),
        paddingDays,
        timezone,
      ),
    );
  }

  return ranges;
}
