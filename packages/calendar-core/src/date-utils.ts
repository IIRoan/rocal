import {
  addDays,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { AgendaDaysToShow, type CalendarView } from "./types";

type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Event fetch range for a view; month view extends to cover the partial first and last weeks. */
export function getDefaultCalendarDateRange({
  baseDate,
  view,
  weekStartDay,
}: {
  baseDate: Date;
  view: CalendarView;
  weekStartDay?: number | null;
}) {
  let start: Date;
  let end: Date;
  const weekStartsOn = (weekStartDay ?? 1) as Day;

  switch (view) {
    case "month": {
      const monthStart = startOfMonth(baseDate);
      const monthEnd = endOfMonth(monthStart);

      start = startOfWeek(monthStart, { weekStartsOn });
      end = endOfWeek(monthEnd, { weekStartsOn });
      break;
    }
    case "week":
      start = startOfWeek(baseDate, { weekStartsOn });
      end = endOfWeek(baseDate, { weekStartsOn });
      break;
    case "day":
      start = new Date(baseDate);
      // repo-rules-allow timezone-safe-calendar-code: legacy local-tz range for shipped callers; zoned code uses getTimezoneAwareCalendarDateRange.
      start.setHours(0, 0, 0, 0);
      end = new Date(baseDate);
      // repo-rules-allow timezone-safe-calendar-code: legacy local-tz range for shipped callers; zoned code uses getTimezoneAwareCalendarDateRange.
      end.setHours(23, 59, 59, 999);
      break;
    case "3day":
      start = addDays(baseDate, -1);
      // repo-rules-allow timezone-safe-calendar-code: legacy local-tz range for shipped callers; zoned code uses getTimezoneAwareCalendarDateRange.
      start.setHours(0, 0, 0, 0);
      end = addDays(baseDate, 1);
      // repo-rules-allow timezone-safe-calendar-code: legacy local-tz range for shipped callers; zoned code uses getTimezoneAwareCalendarDateRange.
      end.setHours(23, 59, 59, 999);
      break;
    case "agenda":
      start = new Date(baseDate);
      end = addDays(baseDate, AgendaDaysToShow - 1);
      break;
    default:
      start = startOfMonth(baseDate);
      end = endOfMonth(baseDate);
      break;
  }

  return { start, end };
}

/** Parses a JSON working-days string (0-6), falling back to Monday–Friday. */
export function parseWorkingDays(
  workingDays: string | null | undefined,
): number[] {
  if (!workingDays) {
    return [1, 2, 3, 4, 5];
  }

  try {
    const parsedDays = JSON.parse(workingDays);

    if (
      Array.isArray(parsedDays) &&
      parsedDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    ) {
      return parsedDays as number[];
    }
  } catch {
    // Fall through to the default work week.
  }

  return [1, 2, 3, 4, 5];
}

export type WorkingDayShade = "workday" | "weekend";

/** Working days get the workday tint; Sat/Sun off days the weekend tint; other off days none. */
export function getWorkingDayShade(
  dayOfWeek: number,
  workingDays: readonly number[],
): WorkingDayShade | null {
  if (workingDays.includes(dayOfWeek)) return "workday";
  if (dayOfWeek === 0 || dayOfWeek === 6) return "weekend";
  return null;
}

const QUARTER_HOUR_MS = 15 * 60 * 1000;

/** Every current zone offset is a whole number of quarter hours, so this lands on :00/:15/:30/:45 in the account zone too. */
export function roundUpToQuarterHour(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS);
}

/** Within a day of the start, a picked end time means its next occurrence after the start (overnight ends roll over); longer events keep the end day. */
export function placePickedEndTime(
  start: string,
  previousEnd: string,
  pickedEnd: string,
): string {
  const nextDay = new Date(Date.parse(`${start.slice(0, 10)}T00:00Z`) + 864e5)
    .toISOString()
    .slice(0, 10);
  if (previousEnd >= `${nextDay}${start.slice(10)}`) return pickedEnd;
  const time = pickedEnd.slice(11);
  const sameDay = `${start.slice(0, 10)}T${time}`;
  return sameDay > start ? sameDay : `${nextDay}T${time}`;
}

/** Format a Date to `YYYY-MM-DDTHH:mm` using local time. */
export function toLocalISOString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

export function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  // repo-rules-allow timezone-safe-calendar-code: documented local-day helper; callers pass wall-clock picker dates.
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfLocalDay(date: Date): Date {
  const d = new Date(date);
  // repo-rules-allow timezone-safe-calendar-code: documented local-day helper; callers pass wall-clock picker dates.
  d.setHours(23, 59, 0, 0);
  return d;
}

export function mapEventErrorToField(error: string): string | null {
  const lower = error.toLowerCase();
  if (lower.includes("title")) return "title";
  if (lower.includes("calendar")) return "calendarId";
  if (lower.includes("description")) return "description";
  if (lower.includes("location")) return "location";
  if (lower.includes("end time") || lower.includes("start")) return "end";
  if (lower.includes("color")) return "color";
  return null;
}
