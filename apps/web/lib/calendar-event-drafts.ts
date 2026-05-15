import type { CalendarEvent } from "@workspace/ui/components/calendar";

type CreateDraftCalendarEventInput = {
  defaultCalendarId?: string | null;
  fallbackCalendarId?: string | null;
  durationMinutes?: number;
  start?: Date;
};

export function createDraftCalendarEvent(
  input: CreateDraftCalendarEventInput = {},
): CalendarEvent {
  const {
    defaultCalendarId,
    fallbackCalendarId,
    durationMinutes = 60,
    start = new Date(),
  } = input;
  const startTime = new Date(start);

  startTime.setSeconds(0);
  startTime.setMilliseconds(0);

  const createdAt = new Date();
  const updatedAt = new Date(createdAt);

  return {
    id: undefined as never,
    title: "",
    start: startTime,
    end: new Date(startTime.getTime() + durationMinutes * 60 * 1000),
    allDay: false,
    calendarId: defaultCalendarId || fallbackCalendarId || "",
    userId: "",
    createdAt,
    updatedAt,
  };
}
