import type { EventDateInput } from "@workspace/calendar-core";
import type { CalendarEvent } from "../src/components/calendar/types";

export function createEvent({
  start,
  end,
  ...overrides
}: Omit<Partial<CalendarEvent>, "start" | "end"> &
  Pick<EventDateInput, "start" | "end">): CalendarEvent {
  return {
    id: "event-1",
    title: "Event",
    allDay: false,
    color: "blue",
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
    start: new Date(start),
    end: new Date(end),
  };
}
