import type { CreateEventRequest } from "@workspace/calendar-core";
import { validateEventData } from "@workspace/calendar-core";

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
}): CreateEventRequest {
  return {
    title: fields.title.trim(),
    start: fields.start,
    end: fields.end,
    calendarId: fields.calendarId,
    allDay: fields.allDay,
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
