import type {
  CalendarEvent,
  CreateEventRequest,
} from "@workspace/calendar-core";
import { resolveTimezone, wallClockToUtc } from "@workspace/calendar-core";
import type { EventSheetMode } from "./EventSheet";
import {
  parseCreateEventCalendarDay,
  toTimezonePickerISOString,
} from "./event-form-utils";

function eventToInitialValues(
  event: CalendarEvent,
  timezone?: string,
): Partial<CreateEventRequest> {
  const resolvedTimezone = resolveTimezone(timezone ?? event.timezone);
  return {
    title: event.title,
    description: event.description ?? undefined,
    start: toTimezonePickerISOString(new Date(event.start), resolvedTimezone),
    end: toTimezonePickerISOString(new Date(event.end), resolvedTimezone),
    timezone: resolvedTimezone,
    allDay: event.allDay ?? false,
    location: event.location ?? undefined,
    color: event.color ?? undefined,
    calendarId: event.calendarId,
    categoryId: event.categoryId ?? undefined,
    reminder: event.reminder ?? undefined,
    recurrence: event.recurrence ?? undefined,
    participants: event.participants?.map((participant) => ({
      email: participant.email,
      displayName: participant.displayName ?? undefined,
      role: participant.role,
      status: participant.status,
    })),
  };
}

/** Form seed for the sheet: the saved event when editing, or a one-hour slot on the tapped day/hour when creating. */
export function eventSheetInitialValues(
  mode: EventSheetMode | null,
  event: CalendarEvent | undefined,
  timezone: string,
): Partial<CreateEventRequest> | undefined {
  if ((mode?.type === "view" || mode?.type === "edit") && event) {
    return eventToInitialValues(event, timezone);
  }
  if (mode?.type !== "create" || !mode.date) return undefined;
  const calendarDay = parseCreateEventCalendarDay(mode.date, timezone);
  if (!calendarDay) return undefined;
  const hour = mode.hour !== undefined ? parseInt(mode.hour, 10) : NaN;
  const zonedStart = wallClockToUtc(
    calendarDay,
    isNaN(hour) ? 0 : hour,
    0,
    timezone,
  );
  const endDate = new Date(zonedStart.getTime() + 60 * 60 * 1000);
  return {
    start: toTimezonePickerISOString(zonedStart, timezone),
    end: toTimezonePickerISOString(endDate, timezone),
    timezone,
  };
}
