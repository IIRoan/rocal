import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
import type { EventNotification } from "@workspace/ui/components/calendar/notification-manager";
export declare const resetEventForm: (calendars: any[], setters: {
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
}) => void;
export declare const loadEventNotifications: (eventId: string, setEventNotifications: (notifications: EventNotification[]) => void, setNotificationsLoading: (loading: boolean) => void) => Promise<void>;
export declare const saveEventNotifications: (eventId: string, notifications: EventNotification[]) => Promise<void>;
export declare const validateEventForm: (eventTitle: string, eventCalendarId: string, eventStartDate: Date, eventEndDate: Date, eventAllDay: boolean, eventStartTime: string, eventEndTime: string) => "Please select a calendar" | "Title is required" | "End date cannot be before start date" | null;
//# sourceMappingURL=event-utils.d.ts.map