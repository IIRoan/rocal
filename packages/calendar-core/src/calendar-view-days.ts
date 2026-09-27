import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { AgendaDaysToShow } from "./types";
import {
  eventSpansMultipleCalendarDays,
  formatPickerDate,
  getEventCalendarDayRange,
  type EventDateInput,
} from "./event-date";
import { comparePickerDays, formatCalendarDayKey } from "./timezone";

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const MONTH_GRID_FIXED_WEEKS = 6;

/** Jan 4 2026 is a Sunday, so offsets from it map directly to weekday indexes. */
const WEEKDAY_REFERENCE_SUNDAY = new Date(2026, 0, 4);

export interface CalendarDaySpan {
  firstDay: Date;
  lastDay: Date;
}

export interface MonthGridOptions {
  /** Always render six weeks so paged grids keep the same height. */
  fixedWeeks?: boolean;
}

export interface AgendaDaySection<T> {
  key: string;
  date: Date;
  data: T[];
}

function normalizeWeekStartDay(weekStartDay: number): DayOfWeek {
  return ((((Math.trunc(weekStartDay) || 0) % 7) + 7) % 7) as DayOfWeek;
}

function toPickerDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function hasValidInstants(event: EventDateInput): boolean {
  return (
    Number.isFinite(new Date(event.start).getTime()) &&
    Number.isFinite(new Date(event.end).getTime())
  );
}

/** Picker days for a month grid: whole weeks covering the month, starting on the user's week-start day. */
export function getMonthGridDays(
  monthDate: Date,
  weekStartDay: number,
  options?: MonthGridOptions,
): Date[] {
  const weekStartsOn = normalizeWeekStartDay(weekStartDay);
  const monthStart = startOfMonth(monthDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn });
  const dayCount = options?.fixedWeeks
    ? MONTH_GRID_FIXED_WEEKS * 7
    : differenceInCalendarDays(gridEnd, gridStart) + 1;

  return Array.from({ length: dayCount }, (_, index) =>
    addDays(gridStart, index),
  );
}

export function getMonthGridWeeks(
  monthDate: Date,
  weekStartDay: number,
  options?: MonthGridOptions,
): Date[][] {
  const days = getMonthGridDays(monthDate, weekStartDay, options);
  return Array.from({ length: days.length / 7 }, (_, week) =>
    days.slice(week * 7, week * 7 + 7),
  );
}

/** Weekday names in grid column order, formatted with a date-fns pattern (e.g. "EEE", "EEEEE"). */
export function getWeekdayLabels(
  weekStartDay: number,
  pattern = "EEE",
): string[] {
  const weekStartsOn = normalizeWeekStartDay(weekStartDay);
  return Array.from({ length: 7 }, (_, index) =>
    formatPickerDate(
      addDays(WEEKDAY_REFERENCE_SUNDAY, weekStartsOn + index),
      pattern,
    ),
  );
}

/** All-day and multi-day events first, then by start instant. */
export function sortCalendarDayEvents<T extends EventDateInput>(
  events: readonly T[],
  timezone: string,
): T[] {
  const ranked = events.map((event) => ({
    event,
    spanning:
      event.allDay === true || eventSpansMultipleCalendarDays(event, timezone),
    start: new Date(event.start).getTime(),
  }));

  ranked.sort((a, b) => {
    if (a.spanning !== b.spanning) return a.spanning ? -1 : 1;
    return a.start - b.start;
  });

  return ranked.map((entry) => entry.event);
}

/** Buckets events under every picker day (yyyy-MM-dd) they cover inside `span`, each bucket sorted for display. */
export function groupEventsByCalendarDay<T extends EventDateInput>(
  events: readonly T[],
  span: CalendarDaySpan,
  timezone: string,
): Map<string, T[]> {
  const buckets = new Map<string, T[]>();
  const spanStart = toPickerDay(span.firstDay);
  const spanEnd = toPickerDay(span.lastDay);

  for (const event of events) {
    if (!hasValidInstants(event)) continue;
    const { firstDay, lastDay } = getEventCalendarDayRange(event, timezone);
    const end = comparePickerDays(lastDay, spanEnd) > 0 ? spanEnd : lastDay;
    let day = comparePickerDays(firstDay, spanStart) < 0 ? spanStart : firstDay;

    while (comparePickerDays(day, end) <= 0) {
      const key = formatCalendarDayKey(day);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(event);
      } else {
        buckets.set(key, [event]);
      }
      day = addDays(day, 1);
    }
  }

  for (const [key, bucket] of buckets) {
    buckets.set(key, sortCalendarDayEvents(bucket, timezone));
  }

  return buckets;
}

/** Non-empty agenda days starting at `startDate`, in order, with each event under every day it covers. */
export function buildAgendaSections<T extends EventDateInput>(
  events: readonly T[],
  startDate: Date,
  timezone: string,
  dayCount: number = AgendaDaysToShow,
): AgendaDaySection<T>[] {
  const firstDay = toPickerDay(startDate);
  const days = Math.max(0, Math.floor(dayCount));
  const buckets = groupEventsByCalendarDay(
    events,
    { firstDay, lastDay: addDays(firstDay, days - 1) },
    timezone,
  );
  const sections: AgendaDaySection<T>[] = [];

  for (let offset = 0; offset < days; offset++) {
    const date = addDays(firstDay, offset);
    const key = formatCalendarDayKey(date);
    const data = buckets.get(key);
    if (data && data.length > 0) {
      sections.push({ key, date, data });
    }
  }

  return sections;
}

/** Agenda pages advance by the number of days they show. */
export function getAgendaPageDate(date: Date, direction: number): Date {
  return addDays(toPickerDay(date), direction * AgendaDaysToShow);
}

/** Last picker day covered by an agenda page. */
export function getAgendaLastDay(startDate: Date): Date {
  return addDays(toPickerDay(startDate), AgendaDaysToShow - 1);
}
