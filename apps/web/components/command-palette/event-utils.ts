import { isBefore } from "date-fns";
import {
  pickerDateAndTimeToUtc,
  pickerDateToAllDayUtcRange,
  resolveTimezone,
} from "@workspace/calendar-core";
import type { CalendarEvent } from "@workspace/ui/components/calendar";
import type { EventNotification } from "@workspace/ui/components/calendar";

export const resetEventForm = (
  calendars: any[],
  setters: {
    setSelectedEvent: (event: CalendarEvent | null) => void;
    setEventViewMode: (mode: "view" | "edit") => void;
    setEventTitle: (title: string) => void;
    setEventDescription: (description: string) => void;
    setEventStartDate: (date: Date) => void;
    setEventEndDate: (date: Date) => void;
    setEventStartTime: (time: string) => void;
    setEventEndTime: (time: string) => void;
    setEventAllDay: (allDay: boolean) => void;
    setEventLocation: (location: string) => void;
    setEventCalendarId: (id: string) => void;
    setEventReminder: (reminder: number | null) => void;
    setEventNotifications: (notifications: EventNotification[]) => void;
  },
) => {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setHours(startDate.getHours() + 1);

  setters.setSelectedEvent(null);
  setters.setEventViewMode("view");
  setters.setEventTitle("");
  setters.setEventDescription("");
  setters.setEventStartDate(startDate);
  setters.setEventEndDate(endDate);
  setters.setEventStartTime("09:00");
  setters.setEventEndTime("10:00");
  setters.setEventAllDay(false);
  setters.setEventLocation("");
  setters.setEventCalendarId(calendars?.[0]?.id || "");
  setters.setEventReminder(null);
  setters.setEventNotifications([]);
};

export const validateEventForm = (
  eventTitle: string,
  eventCalendarId: string,
  eventStartDate: Date,
  eventEndDate: Date,
  eventAllDay: boolean,
  eventStartTime: string,
  eventEndTime: string,
  timezone?: string,
) => {
  if (!eventTitle.trim()) return "Title is required";
  if (!eventCalendarId) return "Please select a calendar";

  const resolvedTimezone = resolveTimezone(timezone);
  let start: Date;
  let end: Date;

  if (!eventAllDay) {
    start = pickerDateAndTimeToUtc(
      eventStartDate,
      eventStartTime,
      resolvedTimezone,
    );
    end = pickerDateAndTimeToUtc(eventEndDate, eventEndTime, resolvedTimezone);
  } else {
    ({ start, end } = pickerDateToAllDayUtcRange(
      eventStartDate,
      eventEndDate,
      resolvedTimezone,
    ));
  }

  if (isBefore(end, start)) {
    return "End date cannot be before start date";
  }

  return null;
};
