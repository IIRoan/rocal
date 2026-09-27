import type { CalendarEvent, UpdateEventRequest } from "./types";
import {
  getZonedDateParts,
  resolveTimezone,
  zonedDateTimeToUtc,
} from "./timezone";

type RecurringEventLike = Pick<
  CalendarEvent,
  "id" | "start" | "recurrence" | "parentEventId" | "isRecurringInstance"
>;

type TimedRange = { start: Date | string; end: Date | string };

export interface RecurringEventTarget {
  parentEventId: string;
  occurrenceDate: string;
  /** Set when the occurrence was already edited once and lives as its own row. */
  detachedEventId: string | null;
}

const OCCURRENCE_ID_SUFFIX =
  /_(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/;

function toIsoInstant(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/** Generated occurrences use `parentId_ISODate` ids; pass the pre-edit event so the occurrence date is the original one. */
export function resolveRecurringEventTarget(
  event: RecurringEventLike | null | undefined,
): RecurringEventTarget | null {
  if (!event?.id) return null;

  const occurrenceMatch = event.id.match(OCCURRENCE_ID_SUFFIX);
  if (occurrenceMatch?.[1]) {
    return {
      parentEventId:
        event.parentEventId || event.id.slice(0, -occurrenceMatch[0].length),
      occurrenceDate: occurrenceMatch[1],
      detachedEventId: null,
    };
  }

  if (event.recurrence || event.isRecurringInstance) {
    return {
      parentEventId: event.id,
      occurrenceDate: toIsoInstant(event.start),
      detachedEventId: null,
    };
  }

  if (event.parentEventId) {
    return {
      parentEventId: event.parentEventId,
      occurrenceDate: toIsoInstant(event.start),
      detachedEventId: event.id,
    };
  }

  return null;
}

export function isRecurringSeriesMember(
  event: Pick<CalendarEvent, "id" | "parentEventId">,
  parentEventId: string,
): boolean {
  return (
    event.id === parentEventId ||
    event.parentEventId === parentEventId ||
    event.id.startsWith(`${parentEventId}_`)
  );
}

/** The recurring edit endpoint rejects null reminder/recurrence and unknown fields. */
export function toRecurringEventUpdates(
  updates: UpdateEventRequest | Record<string, unknown>,
): UpdateEventRequest {
  const source = updates as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of [
    "title",
    "description",
    "start",
    "end",
    "location",
    "calendarId",
    "categoryId",
    "color",
    "timezone",
  ] as const) {
    if (typeof source[key] === "string") result[key] = source[key];
  }
  if (typeof source.allDay === "boolean") result.allDay = source.allDay;
  if (Array.isArray(source.participants))
    result.participants = source.participants;
  if (typeof source.reminder === "number") result.reminder = source.reminder;
  if (typeof source.recurrence === "string") {
    result.recurrence = source.recurrence;
  }
  return result as UpdateEventRequest;
}

/** Applies an occurrence's time change to the series start so "all events" keeps the series anchored instead of jumping to the occurrence. */
export function shiftRecurringSeriesTimes(input: {
  series: TimedRange;
  occurrence: TimedRange;
  next: { start?: string; end?: string };
  timezone?: string | null;
}): { start?: string; end?: string } {
  const { series, occurrence, next } = input;
  const timezone = resolveTimezone(input.timezone);
  const result: { start?: string; end?: string } = {};
  for (const key of ["start", "end"] as const) {
    const value = next[key];
    if (!value) continue;
    const delta =
      wallClockStamp(value, timezone) -
      wallClockStamp(occurrence[key], timezone);
    if (delta !== 0) {
      const shifted = new Date(wallClockStamp(series[key], timezone) + delta);
      const instant = zonedDateTimeToUtc(
        {
          year: shifted.getUTCFullYear(),
          month: shifted.getUTCMonth() + 1,
          day: shifted.getUTCDate(),
          hours: shifted.getUTCHours(),
          minutes: shifted.getUTCMinutes(),
          seconds: shifted.getUTCSeconds(),
        },
        timezone,
      );
      instant.setUTCMilliseconds(shifted.getUTCMilliseconds());
      result[key] = instant.toISOString();
    }
  }
  return result;
}

function wallClockStamp(value: Date | string, timezone: string): number {
  const instant = new Date(value);
  const parts = getZonedDateParts(instant, timezone);
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hours,
    parts.minutes,
    parts.seconds,
    instant.getUTCMilliseconds(),
  );
}
