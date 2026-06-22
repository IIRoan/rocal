import type { CreateEventRequest } from "@workspace/calendar-core";
import {
  formatWallClockTime,
  parseCalendarDayKey,
  pickerDateAndTimeToUtc,
  pickerDateToAllDayUtcRange,
  resolveTimezone,
  utcToPickerDate,
  validateEventData,
} from "@workspace/calendar-core";

// ─── Constants ───────────────────────────────────────────────────────────────

export const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Round a date up to the next full hour. */
export function roundToNextHour(date: Date): Date {
  const d = new Date(date);
  if (d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  }
  return d;
}

/** Format a Date to `YYYY-MM-DDTHH:mm` for the text inputs. */
export function toLocalISOString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

/** Parse a calendar day from create-event route/sheet params. */
export function parseCreateEventCalendarDay(
  value: string,
  timezone?: string,
): Date | null {
  const calendarDay = parseCalendarDayKey(value.slice(0, 10));
  if (calendarDay) {
    return calendarDay;
  }

  const instant = new Date(value);
  if (isNaN(instant.getTime())) {
    return null;
  }

  return utcToPickerDate(instant, resolveTimezone(timezone));
}

export function toTimezonePickerISOString(date: Date, timezone?: string): string {
  const resolvedTimezone = resolveTimezone(timezone);
  const pickerDate = utcToPickerDate(date, resolvedTimezone);
  return `${toLocalISOString(pickerDate).slice(0, 10)}T${formatWallClockTime(
    date,
    resolvedTimezone,
  )}`;
}

export function pickerISOStringToUtc(value: string, timezone?: string): Date {
  const resolvedTimezone = resolveTimezone(timezone);
  const [datePart = "", timePart = "00:00"] = value.split("T");
  const [year = 0, month = 1, day = 1] = datePart.split("-").map(Number);
  return pickerDateAndTimeToUtc(
    new Date(year, month - 1, day),
    timePart,
    resolvedTimezone,
  );
}

function pickerISOStringToCalendarDay(value: string): Date {
  const [datePart = ""] = value.split("T");
  const [year = 0, month = 1, day = 1] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function setPickerDatePart(
  value: string,
  date: Date,
  timezone?: string,
): string {
  const currentUtc = pickerISOStringToUtc(value, timezone);
  const time = formatWallClockTime(currentUtc, resolveTimezone(timezone));
  return `${toLocalISOString(date).slice(0, 10)}T${time}`;
}

export function setPickerTimePart(value: string, time: Date): string {
  const [datePart = ""] = value.split("T");
  const hours = String(time.getHours()).padStart(2, "0");
  const minutes = String(time.getMinutes()).padStart(2, "0");
  return `${datePart}T${hours}:${minutes}`;
}

/** Set a date to the start of day (00:00). */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Set a date to the end of day (23:59). */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 0, 0);
  return d;
}

/**
 * Map a validation error message to the field it belongs to.
 * Returns null if the error doesn't map to a specific field.
 */
export function mapErrorToField(error: string): string | null {
  const lower = error.toLowerCase();
  if (lower.includes("title")) return "title";
  if (lower.includes("calendar")) return "calendarId";
  if (lower.includes("description")) return "description";
  if (lower.includes("location")) return "location";
  if (lower.includes("end time") || lower.includes("start")) return "end";
  if (lower.includes("color")) return "color";
  if (lower.includes("participant")) return "participants";
  return null;
}

/**
 * Build a CreateEventRequest from form field values.
 * Returns the request object ready for validation and submission.
 */
export function buildEventRequest(fields: {
  title: string;
  start: string;
  end: string;
  calendarId: string;
  allDay: boolean;
  location: string;
  description: string;
  color?: string;
  categoryId?: string;
  recurrence?: string | null;
  reminder?: number;
  participants?: CreateEventRequest["participants"];
  timezone?: string;
}): CreateEventRequest {
  const resolvedTimezone = resolveTimezone(fields.timezone);
  const { start, end } = fields.allDay
    ? pickerDateToAllDayUtcRange(
        pickerISOStringToCalendarDay(fields.start),
        pickerISOStringToCalendarDay(fields.end),
        resolvedTimezone,
      )
    : {
        start: pickerISOStringToUtc(fields.start, resolvedTimezone),
        end: pickerISOStringToUtc(fields.end, resolvedTimezone),
      };

  return {
    title: fields.title.trim(),
    start: start.toISOString(),
    end: end.toISOString(),
    calendarId: fields.calendarId,
    allDay: fields.allDay,
    timezone: resolvedTimezone,
    ...(fields.location.trim() ? { location: fields.location.trim() } : {}),
    ...(fields.description.trim()
      ? { description: fields.description.trim() }
      : {}),
    ...(fields.color ? { color: fields.color } : {}),
    ...(fields.categoryId ? { categoryId: fields.categoryId } : {}),
    ...(fields.recurrence ? { recurrence: fields.recurrence } : {}),
    ...(fields.reminder && fields.reminder > 0
      ? { reminder: fields.reminder }
      : {}),
    ...(fields.participants !== undefined
      ? { participants: fields.participants }
      : {}),
  };
}

/**
 * Validate form data and return categorised errors.
 * Returns `{ fieldErrors, generalErrors }`.
 */
export function validateForm(data: CreateEventRequest): {
  fieldErrors: Record<string, string>;
  generalErrors: string[];
} {
  const errors = validateEventData(data);
  const fieldErrors: Record<string, string> = {};
  const generalErrors: string[] = [];

  for (const err of errors) {
    const field = mapErrorToField(err);
    if (field) {
      fieldErrors[field] = err;
    } else {
      generalErrors.push(err);
    }
  }

  return { fieldErrors, generalErrors };
}
