import { isBefore } from "date-fns";
import { toast } from "sonner";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
import type { EventNotification } from "@workspace/ui/components/calendar/notification-manager";
import { calendarApiService } from "@/lib/calendar-api-service";

export const resetEventForm = (
  calendars: any[],
  setters: {
    setSelectedEvent: (event: CalendarEvent | null) => void;
    setEventViewMode: (mode: 'view' | 'edit') => void;
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
  setters.setEventViewMode('view');
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
  console.log("Event form reset for new event creation");
};

export const loadEventNotifications = async (
  eventId: string,
  setEventNotifications: (notifications: EventNotification[]) => void,
  setNotificationsLoading: (loading: boolean) => void
) => {
  if (!eventId) {
    setEventNotifications([]);
    return;
  }

  setNotificationsLoading(true);
  try {
    const response = await calendarApiService.getEventNotifications(eventId);
    if (response.success && response.data && response.data.notifications) {
      // Filter only email notifications and map to the expected format
      const emailNotifications = response.data.notifications
        .filter((n) => n.notificationType === "email")
        .map((n) => ({
          id: n.id,
          notificationType: "email" as const,
          minutesBefore: n.minutesBefore,
          isEnabled: n.isEnabled,
        }));
      setEventNotifications(emailNotifications);
    }
  } catch (error) {
    console.error("Failed to load event notifications:", error);
    setEventNotifications([]);
  } finally {
    setNotificationsLoading(false);
  }
};

export const saveEventNotifications = async (
  eventId: string,
  notifications: EventNotification[]
) => {
  if (!eventId) return;

  try {
    // Sanitize and dedupe
    const clamped = notifications
      .map((n) => ({
        notificationType: n.notificationType,
        minutesBefore: Math.max(0, Math.min(43200, Number(n.minutesBefore) || 0)),
        isEnabled: !!n.isEnabled,
      }))
      .filter((n) => n.isEnabled && Number.isFinite(n.minutesBefore));

    const unique = new Map<string, { notificationType: "browser" | "email"; minutesBefore: number; isEnabled: boolean }>();
    for (const n of clamped) unique.set(`${n.notificationType}-${n.minutesBefore}`, n);
    const notificationData = Array.from(unique.values());

    if (notificationData.length > 0) {
      await calendarApiService.updateEventNotifications(eventId, notificationData);
    }
  } catch (error) {
    console.error("Failed to save event notifications:", error);
    toast.error("Failed to save notification settings");
  }
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
    const [endHours = 0, endMinutes = 0] = eventEndTime
      .split(":")
      .map(Number);

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
