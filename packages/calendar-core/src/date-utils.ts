import {
  addDays,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { AgendaDaysToShow, type CalendarView } from "./types";

type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Returns the date range to fetch events for a given calendar view.
 * For month view, the range extends to cover partial weeks at the start/end.
 */
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
      start.setHours(0, 0, 0, 0);
      end = new Date(baseDate);
      end.setHours(23, 59, 59, 999);
      break;
    case "3day":
      start = addDays(baseDate, -1);
      start.setHours(0, 0, 0, 0);
      end = addDays(baseDate, 1);
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

/**
 * Parses a JSON-encoded working days string into an array of day numbers (0-6).
 * Falls back to Monday–Friday if the input is invalid.
 */
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

/** Round a date up to the next full hour without mutating the input. */
export function roundToNextHour(date: Date): Date {
  const d = new Date(date);
  if (d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  }
  return d;
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
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfLocalDay(date: Date): Date {
  const d = new Date(date);
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
