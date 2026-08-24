import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
}

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DEFAULT_CALENDAR_TIMEZONE = "Europe/Amsterdam";

export function resolveTimezone(timezone?: string | null): string {
  const trimmed = timezone?.trim();
  if (trimmed) {
    return trimmed;
  }

  return DEFAULT_CALENDAR_TIMEZONE;
}

export function getZonedDateParts(
  date: Date,
  timezone: string,
): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((part) => part.type === type)?.value ?? "0", 10);

  const hours = read("hour") % 24;

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hours,
    minutes: read("minute"),
    seconds: read("second"),
  };
}

export function zonedDateTimeToUtc(
  parts: Pick<ZonedDateParts, "year" | "month" | "day" | "hours" | "minutes"> & {
    seconds?: number;
  },
  timezone: string,
): Date {
  return fromZonedTime(
    new Date(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hours,
      parts.minutes,
      parts.seconds ?? 0,
      0,
    ),
    timezone,
  );
}

export function utcToPickerDate(utc: Date, timezone: string): Date {
  const { year, month, day } = getZonedDateParts(utc, timezone);
  return new Date(year, month - 1, day);
}

export function formatWallClockTime(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "HH:mm");
}

export function formatInUserTimezone(
  date: Date,
  timezone: string,
  pattern: string,
): string {
  return formatInTimeZone(date, timezone, pattern);
}

export function wallClockToUtc(
  calendarDay: Date,
  hours: number,
  minutes: number,
  timezone: string,
): Date {
  return zonedDateTimeToUtc(
    {
      year: calendarDay.getFullYear(),
      month: calendarDay.getMonth() + 1,
      day: calendarDay.getDate(),
      hours,
      minutes,
    },
    timezone,
  );
}

export function pickerDateAndTimeToUtc(
  pickerDate: Date,
  timeHHMM: string,
  timezone: string,
): Date {
  const [hours = 0, minutes = 0] = timeHHMM.split(":").map(Number);
  return wallClockToUtc(pickerDate, hours, minutes, timezone);
}

export function pickerDateToAllDayUtcRange(
  pickerStart: Date,
  pickerEnd: Date,
  timezone: string,
): { start: Date; end: Date } {
  const start = wallClockToUtc(pickerStart, 0, 0, timezone);
  const end = zonedDateTimeToUtc(
    {
      year: pickerEnd.getFullYear(),
      month: pickerEnd.getMonth() + 1,
      day: pickerEnd.getDate(),
      hours: 23,
      minutes: 59,
      seconds: 59,
    },
    timezone,
  );

  return { start, end };
}

export function isStartOfZonedDay(instant: Date, timezone: string): boolean {
  const parts = getZonedDateParts(instant, timezone);
  return parts.hours === 0 && parts.minutes === 0 && parts.seconds === 0;
}

export function isSamePickerDay(left: Date, right: Date): boolean {
  return comparePickerDays(left, right) === 0;
}

/** Compare picker calendar days by Y-M-D only (not as UTC instants). */
export function comparePickerDays(left: Date, right: Date): number {
  const yearDelta = left.getFullYear() - right.getFullYear();
  if (yearDelta !== 0) return yearDelta;
  const monthDelta = left.getMonth() - right.getMonth();
  if (monthDelta !== 0) return monthDelta;
  return left.getDate() - right.getDate();
}

function isUtcMidnight(instant: Date): boolean {
  return (
    instant.getUTCHours() === 0 &&
    instant.getUTCMinutes() === 0 &&
    instant.getUTCSeconds() === 0 &&
    instant.getUTCMilliseconds() === 0
  );
}

/**
 * Returns the inclusive first/last calendar picker days covered by an event.
 * All-day events may end at exclusive midnight, inclusive 23:59:59, or UTC date
 * boundaries depending on how they were persisted.
 */
export function getInclusiveCalendarDayRange(
  start: Date,
  end: Date,
  timezone: string,
  options?: { allDay?: boolean },
): { firstDay: Date; lastDay: Date } {
  const resolvedTimezone = resolveTimezone(timezone);
  const rawStart = new Date(start);
  const rawEnd = new Date(end);
  const firstDay = utcToPickerDate(rawStart, resolvedTimezone);

  if (options?.allDay) {
    if (rawEnd <= rawStart) {
      return { firstDay, lastDay: firstDay };
    }

    const endPickerDay = utcToPickerDate(rawEnd, resolvedTimezone);

    if (isSamePickerDay(firstDay, endPickerDay)) {
      return { firstDay, lastDay: firstDay };
    }

    if (isStartOfZonedDay(rawEnd, resolvedTimezone) || isUtcMidnight(rawEnd)) {
      return { firstDay, lastDay: addDays(endPickerDay, -1) };
    }

    return { firstDay, lastDay: endPickerDay };
  }

  let lastInstant = rawEnd;
  if (
    rawEnd > rawStart &&
    isStartOfZonedDay(rawEnd, resolvedTimezone) &&
    !isSameCalendarDayInTimezone(rawStart, rawEnd, resolvedTimezone)
  ) {
    lastInstant = new Date(rawEnd.getTime() - 1);
  }

  const lastDay = utcToPickerDate(lastInstant, resolvedTimezone);
  return { firstDay, lastDay };
}

export function spansMultipleCalendarDays(
  start: Date,
  end: Date,
  timezone: string,
  options?: { allDay?: boolean },
): boolean {
  const { firstDay, lastDay } = getInclusiveCalendarDayRange(
    start,
    end,
    timezone,
    options,
  );

  return !isSamePickerDay(firstDay, lastDay);
}

export function isSameCalendarDayInTimezone(
  instant: Date,
  calendarDay: Date,
  timezone: string,
): boolean {
  const instantParts = getZonedDateParts(instant, timezone);

  return (
    instantParts.year === calendarDay.getFullYear() &&
    instantParts.month === calendarDay.getMonth() + 1 &&
    instantParts.day === calendarDay.getDate()
  );
}

export function isTodayInTimezone(calendarDay: Date, timezone: string): boolean {
  const today = utcToPickerDate(new Date(), timezone);

  return (
    calendarDay.getFullYear() === today.getFullYear() &&
    calendarDay.getMonth() === today.getMonth() &&
    calendarDay.getDate() === today.getDate()
  );
}

export function getWeekCalendarDays(
  currentDate: Date,
  weekStartDay: number,
  timezone: string,
): Date[] {
  const anchor = utcToPickerDate(currentDate, timezone);
  const weekStartsOn = (((weekStartDay % 7) + 7) % 7) as DayOfWeek;
  const weekStart = startOfWeek(anchor, { weekStartsOn });
  const weekEnd = endOfWeek(anchor, { weekStartsOn });

  return eachDayOfInterval({ start: weekStart, end: weekEnd });
}

export function getWeekCalendarRange(
  currentDate: Date,
  weekStartDay: number,
  timezone?: string | null,
): { start: Date; end: Date } {
  const days = getWeekCalendarDays(
    currentDate,
    weekStartDay,
    resolveTimezone(timezone),
  );

  return {
    start: days[0] ?? currentDate,
    end: days[days.length - 1] ?? currentDate,
  };
}

export function getZonedDayUtcBounds(
  calendarDay: Date,
  timezone: string,
): { start: Date; end: Date } {
  const start = wallClockToUtc(calendarDay, 0, 0, timezone);
  const nextCalendarDay = addDays(calendarDay, 1);
  const end = wallClockToUtc(nextCalendarDay, 0, 0, timezone);

  return { start, end };
}

export function eventOverlapsZonedCalendarDay(
  eventStart: Date,
  eventEnd: Date,
  calendarDay: Date,
  timezone: string,
  options?: { allDay?: boolean },
): boolean {
  if (options?.allDay) {
    const { firstDay, lastDay } = getInclusiveCalendarDayRange(
      eventStart,
      eventEnd,
      timezone,
      { allDay: true },
    );
    const dayTime = startOfDay(calendarDay).getTime();
    const firstTime = startOfDay(firstDay).getTime();
    const lastTime = startOfDay(lastDay).getTime();

    return dayTime >= firstTime && dayTime <= lastTime;
  }

  const { start: dayStart, end: dayEnd } = getZonedDayUtcBounds(
    calendarDay,
    timezone,
  );

  return eventStart < dayEnd && eventEnd > dayStart;
}

export function formatCalendarDayKey(calendarDay: Date): string {
  const year = calendarDay.getFullYear();
  const month = String(calendarDay.getMonth() + 1).padStart(2, "0");
  const day = String(calendarDay.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatCalendarMonthKey(calendarDay: Date): string {
  const year = calendarDay.getFullYear();
  const month = String(calendarDay.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export function formatCalendarWeekKey(
  calendarDay: Date,
  weekStartDay = 1,
  timezone?: string | null,
): string {
  const days = getWeekCalendarDays(
    calendarDay,
    weekStartDay,
    resolveTimezone(timezone),
  );
  return `${formatCalendarDayKey(days[0] ?? calendarDay)}:${formatCalendarDayKey(
    days[6] ?? calendarDay,
  )}`;
}

export function formatInstantCalendarDayKey(
  instant: Date,
  timezone?: string | null,
): string {
  return formatInTimeZone(instant, resolveTimezone(timezone), "yyyy-MM-dd");
}

export function formatInstantCalendarMonthKey(
  instant: Date,
  timezone?: string | null,
): string {
  return formatInTimeZone(instant, resolveTimezone(timezone), "yyyy-MM");
}

export function parseCalendarDayKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1] ?? "0", 10);
  const month = Number.parseInt(match[2] ?? "0", 10);
  const day = Number.parseInt(match[3] ?? "0", 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }

  return new Date(year, month - 1, day);
}

export function wallClockFromCalendarDayKey(
  dayKey: string,
  hours: number,
  minutes: number,
  timezone: string,
): Date | null {
  const calendarDay = parseCalendarDayKey(dayKey);
  if (!calendarDay) {
    return null;
  }

  return wallClockToUtc(calendarDay, hours, minutes, timezone);
}
