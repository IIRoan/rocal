import { isBefore } from "date-fns";
import { toast } from "sonner";
import { calendarApiService } from "@/lib/calendar-api-service";
export const resetEventForm = (calendars, setters) => {
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
export const loadEventNotifications = async (eventId, setEventNotifications, setNotificationsLoading) => {
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
                notificationType: "email",
                minutesBefore: n.minutesBefore,
                isEnabled: n.isEnabled,
            }));
            setEventNotifications(emailNotifications);
        }
    }
    catch (error) {
        console.error("Failed to load event notifications:", error);
        setEventNotifications([]);
    }
    finally {
        setNotificationsLoading(false);
    }
};
export const saveEventNotifications = async (eventId, notifications) => {
    if (!eventId)
        return;
    try {
        const notificationData = notifications.map((n) => ({
            notificationType: n.notificationType,
            minutesBefore: n.minutesBefore,
            isEnabled: n.isEnabled,
        }));
        await calendarApiService.updateEventNotifications(eventId, notificationData);
    }
    catch (error) {
        console.error("Failed to save event notifications:", error);
        toast.error("Failed to save notification settings");
    }
};
export const validateEventForm = (eventTitle, eventCalendarId, eventStartDate, eventEndDate, eventAllDay, eventStartTime, eventEndTime) => {
    if (!eventTitle.trim())
        return "Title is required";
    if (!eventCalendarId)
        return "Please select a calendar";
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
    }
    else {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
    }
    if (isBefore(end, start)) {
        return "End date cannot be before start date";
    }
    return null;
};
