import { isBefore } from "date-fns";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
import type { EventNotification } from "@workspace/ui/components/calendar/notification-manager";

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
  }
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
  // Add default 15-minute email notification for new events
  setters.setEventNotifications([
    {
      notificationType: "email",
      minutesBefore: 15,
      isEnabled: true,
    },
  ]);
};

export const validateEventForm = (
  eventTitle: string,
  eventCalendarId: string,
  eventStartDate: Date,
  eventEndDate: Date,
  eventAllDay: boolean,
  eventStartTime: string,
  eventEndTime: string
) => {
  if (!eventTitle.trim()) return "Title is required";
  if (!eventCalendarId) return "Please select a calendar";

  const start = new Date(eventStartDate);
  const end = new Date(eventEndDate);

  if (!eventAllDay) {
    const [startHours = 0, startMinutes = 0] = eventStartTime
      .split(":")
      .map(Number);
    const [endHours = 0, endMinutes = 0] = eventEndTime.split(":").map(Number);

    start.setHours(startHours, startMinutes, 0);
    end.setHours(endHours, endMinutes, 0);
  } else {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  if (isBefore(end, start)) {
    return "End date cannot be before start date";
  }

  return null;
};
