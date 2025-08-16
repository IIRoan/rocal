"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { CalendarEvent, Calendar } from "@workspace/ui/components/calendar/types";
import type { RecurrenceRule } from "@/lib/types/calendar";
import type { EventNotification } from "@workspace/ui/components/calendar/notification-manager";
import type { UserSettings } from "@/lib/types/calendar";
import { formatTimeForInput, validateTime, timeToMinutes, minutesToTime } from "@/components/command-palette/time-utils";
import { validateEventForm, loadEventNotifications } from "@/components/command-palette/event-utils";
import { calendarApiService } from "@/lib/calendar-api-service";
import { toast } from "sonner";

interface UseEventFormProps {
  calendars: Calendar[];
  localSettings: UserSettings;
  onEventSaved?: () => void;
  onClose: () => void;
}

interface UseEventFormReturn {
  // Form state
  selectedEvent: CalendarEvent | null;
  eventViewMode: 'view' | 'edit';
  eventTitle: string;
  eventDescription: string;
  eventStartDate: Date;
  eventEndDate: Date;
  eventStartTime: string;
  eventEndTime: string;
  eventAllDay: boolean;
  eventLocation: string;
  eventCalendarId: string;
  eventReminder: number | null;
  eventNotifications: EventNotification[];
  isRecurring: boolean;
  recurrenceRule: RecurrenceRule | null;
  
  // UI state
  eventSaving: boolean;
  showRecurringDeleteModal: boolean;
  startDateOpen: boolean;
  endDateOpen: boolean;
  startTimeOpen: boolean;
  endTimeOpen: boolean;
  timeErrors: { start?: string; end?: string };
  notificationsLoading: boolean;
  showNotifications: boolean;
  
  // Actions
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
  setIsRecurring: (recurring: boolean) => void;
  setRecurrenceRule: (rule: RecurrenceRule | null) => void;
  setShowRecurringDeleteModal: (show: boolean) => void;
  setStartDateOpen: (open: boolean) => void;
  setEndDateOpen: (open: boolean) => void;
  setStartTimeOpen: (open: boolean) => void;
  setEndTimeOpen: (open: boolean) => void;
  setShowNotifications: (show: boolean) => void;
  
  // Form actions
  handleStartTimeChange: (newStartTime: string) => void;
  handleEndTimeChange: (newEndTime: string) => void;
  handleNotificationChange: (notifications: EventNotification[]) => void;
  loadEventData: (event: CalendarEvent) => void;
  resetForm: () => void;
  handleEventSave: (calendarData: any) => Promise<void>;
  handleEventDelete: (calendarData: any) => Promise<void>;
  handleRecurringDeleteThis: (calendarData: any) => Promise<void>;
  handleRecurringDeleteAll: (calendarData: any) => Promise<void>;
}

export function useEventForm({
  calendars,
  localSettings,
  onEventSaved,
  onClose,
}: UseEventFormProps): UseEventFormReturn {
  // Use ref to store calendars to avoid infinite loops
  const calendarsRef = useRef(calendars);
  calendarsRef.current = calendars;
  // Event editor state
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventViewMode, setEventViewMode] = useState<'view' | 'edit'>('view');
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStartDate, setEventStartDate] = useState<Date>(new Date());
  const [eventEndDate, setEventEndDate] = useState<Date>(new Date());
  const [eventStartTime, setEventStartTime] = useState("09:00");
  const [eventEndTime, setEventEndTime] = useState("10:00");
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventLocation, setEventLocation] = useState("");
  const [eventCalendarId, setEventCalendarId] = useState<string>("");
  const [eventReminder, setEventReminder] = useState<number | null>(null);
  const [eventSaving, setEventSaving] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null);
  const [showRecurringDeleteModal, setShowRecurringDeleteModal] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [startTimeOpen, setStartTimeOpen] = useState(false);
  const [endTimeOpen, setEndTimeOpen] = useState(false);
  const [timeErrors, setTimeErrors] = useState<{ start?: string; end?: string }>({});

  // Notification state
  const [eventNotifications, setEventNotifications] = useState<EventNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Load event data into form
  const loadEventData = useCallback((event: CalendarEvent) => {
    const isNewEvent = !event.id || event.id === "" || event.id === undefined;
    const isSynced = event.isSynced || false;

    setSelectedEvent(event);
    setEventViewMode(isNewEvent ? 'edit' : 'view');
    setEventTitle(event.title || "");
    setEventDescription(event.description || "");
    setEventStartDate(new Date(event.start));
    setEventEndDate(new Date(event.end));
    setEventStartTime(formatTimeForInput(new Date(event.start)));
    setEventEndTime(formatTimeForInput(new Date(event.end)));
    setEventAllDay(event.allDay || false);
    setEventLocation(event.location || "");
    setEventCalendarId(event.calendarId || calendarsRef.current?.[0]?.id || "");
    setEventReminder(event.reminder ?? null);
    
    // Handle recurring event data
    const hasRecurrence = !!event.recurrence;
    setIsRecurring(hasRecurrence);
    if (hasRecurrence && event.recurrence) {
      try {
        const parsedRule = JSON.parse(event.recurrence) as RecurrenceRule;
        setRecurrenceRule(parsedRule);
      } catch (error) {
        console.error("Failed to parse recurrence rule:", error);
        setIsRecurring(false);
        setRecurrenceRule(null);
      }
    } else {
      setRecurrenceRule(null);
    }

    // Load notifications for existing events
    if (!isNewEvent && event.id) {
      loadEventNotifications(event.id, setEventNotifications, setNotificationsLoading);
    } else {
      setEventNotifications([
        {
          notificationType: "email",
          minutesBefore: 15,
          isEnabled: true,
        },
      ]);
    }
  }, []);

  // Reset form to initial state
  const resetForm = useCallback(() => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setHours(startDate.getHours() + 1);

    setSelectedEvent(null);
    setEventViewMode('view');
    setEventTitle("");
    setEventDescription("");
    setEventStartDate(startDate);
    setEventEndDate(endDate);
    setEventStartTime("09:00");
    setEventEndTime("10:00");
    setEventAllDay(false);
    setEventLocation("");
    setEventCalendarId(calendarsRef.current?.[0]?.id || "");
    setEventReminder(null);
    setEventNotifications([
      {
        notificationType: "email",
        minutesBefore: 15,
        isEnabled: true,
      },
    ]);
    setIsRecurring(false);
    setRecurrenceRule(null);
    setShowRecurringDeleteModal(false);
    setTimeErrors({});
    setShowNotifications(false);
  }, []);

  // Handle start time change with validation
  const handleStartTimeChange = useCallback((newStartTime: string) => {
    const validation = validateTime(newStartTime);

    if (validation.isValid && validation.time) {
      setEventStartTime(validation.time);
      setTimeErrors(prev => ({ ...prev, start: undefined }));

      const startMinutes = timeToMinutes(validation.time);
      const endMinutes = timeToMinutes(eventEndTime);

      if (endMinutes <= startMinutes) {
        const newEndMinutes = startMinutes + 60;
        const newEndTime = minutesToTime(newEndMinutes);
        setEventEndTime(newEndTime);
        setTimeErrors(prev => ({ ...prev, end: undefined }));
      }
    } else {
      setEventStartTime(newStartTime);
      setTimeErrors(prev => ({ ...prev, start: validation.error }));
    }
  }, [eventEndTime]);

  // Handle end time change with validation
  const handleEndTimeChange = useCallback((newEndTime: string) => {
    const validation = validateTime(newEndTime);

    if (validation.isValid && validation.time) {
      const startMinutes = timeToMinutes(eventStartTime);
      const endMinutes = timeToMinutes(validation.time);

      if (endMinutes > startMinutes) {
        setEventEndTime(validation.time);
        setTimeErrors(prev => ({ ...prev, end: undefined }));
      } else {
        setEventEndTime(newEndTime);
        setTimeErrors(prev => ({ ...prev, end: 'End time must be after start time' }));
      }
    } else {
      setEventEndTime(newEndTime);
      setTimeErrors(prev => ({ ...prev, end: validation.error }));
    }
  }, [eventStartTime]);

  // Handle notification changes
  const handleNotificationChange = useCallback((notifications: EventNotification[]) => {
    setEventNotifications(notifications);
  }, []);

  // Save event
  const handleEventSave = useCallback(async (calendarData: any) => {
    const validationError = validateEventForm(
      eventTitle,
      eventCalendarId,
      eventStartDate,
      eventEndDate,
      eventAllDay,
      eventStartTime,
      eventEndTime
    );
    if (validationError) {
      toast.error(validationError);
      return;
    }

    // Validate recurrence rule if recurring is enabled
    if (isRecurring && recurrenceRule) {
      try {
        const validation = await calendarApiService.validateRecurrence(recurrenceRule);
        if (!validation.valid) {
          toast.error(`Invalid recurrence rule: ${validation.errors.join(', ')}`);
          return;
        }
      } catch (error) {
        console.error("Failed to validate recurrence rule:", error);
        toast.error("Failed to validate recurrence settings");
        return;
      }
    }

    // Validate for duplicate notifications
    const enabledNotifications = eventNotifications.filter((n) => n.isEnabled);
    const notificationTimes = enabledNotifications.map((n) => n.minutesBefore);
    const duplicateTimes = notificationTimes.filter(
      (time, index) => notificationTimes.indexOf(time) !== index
    );

    if (duplicateTimes.length > 0) {
      const uniqueDuplicates = [...new Set(duplicateTimes)];
      const timeText =
        uniqueDuplicates.length === 1
          ? `${uniqueDuplicates[0]} minutes before`
          : uniqueDuplicates.map((time) => `${time} minutes`).join(", ") + " before";

      toast.error(`Cannot have multiple notifications for the same time: ${timeText}`);
      return;
    }

    const start = new Date(eventStartDate);
    const end = new Date(eventEndDate);

    if (!eventAllDay) {
      const [startHours = 0, startMinutes = 0] = eventStartTime.split(":").map(Number);
      const [endHours = 0, endMinutes = 0] = eventEndTime.split(":").map(Number);

      start.setHours(startHours, startMinutes, 0);
      end.setHours(endHours, endMinutes, 0);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    const selectedCalendar = calendars.find((cal) => cal.id === eventCalendarId);
    const calendarColor = selectedCalendar?.color || "blue";

    const eventData: CalendarEvent = {
      id: selectedEvent?.id || "",
      title: eventTitle.trim(),
      description: eventDescription.trim() || undefined,
      start,
      end,
      allDay: eventAllDay,
      location: eventLocation.trim() || undefined,
      color: calendarColor as any,
      calendarId: eventCalendarId,
      userId: selectedEvent?.userId || "demo-user",
      createdAt: selectedEvent?.createdAt || new Date(),
      updatedAt: new Date(),
      reminder: undefined,
      recurrence: isRecurring && recurrenceRule ? JSON.stringify(recurrenceRule) : undefined,
    };

    // Convert legacy reminder to notification if needed
    let finalNotifications = [...eventNotifications];
    if (eventReminder && eventReminder > 0) {
      const existingNotification = finalNotifications.find(
        (n) => n.minutesBefore === eventReminder && n.notificationType === "email"
      );

      if (!existingNotification) {
        finalNotifications.push({
          notificationType: "email",
          minutesBefore: eventReminder,
          isEnabled: true,
        });
      }
    }

    setEventSaving(true);
    try {
      const isUpdate = selectedEvent?.id && selectedEvent.id !== "" && selectedEvent.id !== undefined;
      let savedEventId = selectedEvent?.id;

      if (isUpdate) {
        await calendarData.updateEvent(selectedEvent.id, {
          title: eventData.title,
          description: eventData.description,
          start: eventData.start.toISOString(),
          end: eventData.end.toISOString(),
          allDay: eventData.allDay,
          location: eventData.location,
          calendarId: eventData.calendarId,
          reminder: undefined,
          recurrence: eventData.recurrence || undefined,
        });
        toast.success(`Event "${eventTitle}" updated`);
      } else {
        const newEvent = await calendarData.createEvent({
          title: eventData.title,
          description: eventData.description,
          start: eventData.start.toISOString(),
          end: eventData.end.toISOString(),
          allDay: eventData.allDay,
          location: eventData.location,
          calendarId: eventData.calendarId,
          reminder: undefined,
          recurrence: eventData.recurrence || undefined,
        });
        savedEventId = newEvent.id;
        toast.success(`Event "${eventTitle}" created`);
      }

      // Save notifications
      if (savedEventId && finalNotifications.length > 0) {
        const notificationData = finalNotifications.map((n) => ({
          notificationType: n.notificationType,
          minutesBefore: n.minutesBefore,
          isEnabled: n.isEnabled,
        }));
        await calendarApiService.updateEventNotifications(savedEventId, notificationData);
      }

      onEventSaved?.();

      setTimeout(() => {
        onClose();
        resetForm();
      }, 100);
    } catch (error: any) {
      console.error("Failed to save event:", error);

      let errorMessage = "Failed to save event";
      if (error.message?.includes("Network")) {
        errorMessage = "Network error - please check your connection and try again";
      } else if (error.message?.includes("validation")) {
        errorMessage = "Invalid event data - please check all fields";
      } else if (error.statusCode === 422) {
        if (error.message?.includes("Duplicate notification") || error.message?.includes("duplicate")) {
          errorMessage = "Cannot have multiple notifications for the same time. Please remove duplicate notification times.";
        } else {
          errorMessage = "Invalid data - please check all fields and try again";
        }
      } else if (error.statusCode === 404) {
        errorMessage = "Event not found - it may have been deleted";
        setSelectedEvent(null);
      } else if (error.statusCode === 403) {
        errorMessage = "You don't have permission to save this event";
      } else if (error.statusCode === 500) {
        errorMessage = "Server error - please try again later";
      }

      toast.error(errorMessage);
    } finally {
      setEventSaving(false);
    }
  }, [
    eventTitle, eventCalendarId, eventStartDate, eventEndDate, eventAllDay,
    eventStartTime, eventEndTime, isRecurring, recurrenceRule, eventNotifications,
    eventDescription, eventLocation, calendars, selectedEvent, eventReminder,
    onEventSaved, onClose, resetForm
  ]);

  // Delete event
  const handleEventDelete = useCallback(async (calendarData: any) => {
    if (!selectedEvent?.id) return;

    setEventSaving(true);
    try {
      await calendarData.deleteEvent(selectedEvent.id);
      toast.success(`Event "${eventTitle}" deleted`);
      onEventSaved?.();

      setTimeout(() => {
        onClose();
        resetForm();
      }, 100);
    } catch (error: any) {
      console.error("Failed to delete event:", error);
      toast.error("Failed to delete event");
    } finally {
      setEventSaving(false);
    }
  }, [selectedEvent, eventTitle, onEventSaved, onClose, resetForm]);

  // Delete recurring event - this instance only
  const handleRecurringDeleteThis = useCallback(async (calendarData: any) => {
    if (!selectedEvent?.id) return;
    
    if (eventSaving) return;
    
    setShowRecurringDeleteModal(false);
    
    let parentEventId = selectedEvent.parentEventId || selectedEvent.id;
    
    if (!selectedEvent.parentEventId && selectedEvent.id.includes('_')) {
      const parts = selectedEvent.id.split('_');
      if (parts.length > 1 && parts[0]) {
        parentEventId = parts[0];
      }
    }
    
    let occurrenceDate = selectedEvent.start.toISOString();
    let dateFromId = null;
    
    if (selectedEvent.id.includes('_')) {
      const parts = selectedEvent.id.split('_');
      if (parts.length > 1) {
        dateFromId = parts[1];
        if (dateFromId) {
          occurrenceDate = dateFromId;
        }
      }
    }
    
    setEventSaving(true);
    try {
      await calendarApiService.deleteRecurringEvent(parentEventId, 'this_only', occurrenceDate);
      toast.success("Event occurrence deleted");
      
      if (calendarData?.clearCache) {
        calendarData.clearCache();
      }
      
      if (calendarData?.refetchEvents) {
        await calendarData.refetchEvents();
      }
      
      if (onEventSaved) {
        onEventSaved();
      }
      
      if (calendarData?.refetch) {
        await calendarData.refetch();
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      onClose();
    } catch (error: any) {
      console.error("Failed to delete recurring event occurrence:", error);
      toast.error(`Failed to delete event occurrence: ${error.message || 'Unknown error'}`);
    } finally {
      setEventSaving(false);
    }
  }, [selectedEvent, eventSaving, onEventSaved, onClose]);

  // Delete recurring event - entire series
  const handleRecurringDeleteAll = useCallback(async (calendarData: any) => {
    if (!selectedEvent?.id) return;
    
    if (eventSaving) return;
    
    setShowRecurringDeleteModal(false);
    
    let parentEventId = selectedEvent.parentEventId || selectedEvent.id;
    
    if (!selectedEvent.parentEventId && selectedEvent.id.includes('_')) {
      const parts = selectedEvent.id.split('_');
      if (parts.length > 1 && parts[0]) {
        parentEventId = parts[0];
      }
    }
    
    setEventSaving(true);
    try {
      await calendarApiService.deleteRecurringEvent(parentEventId, 'all');
      toast.success("Entire event series deleted");
      
      if (calendarData?.refetchEvents) {
        await calendarData.refetchEvents();
      } else {
        onEventSaved?.();
      }
      
      onClose();
    } catch (error: any) {
      console.error("Failed to delete recurring event series:", error);
      toast.error("Failed to delete event series");
    } finally {
      setEventSaving(false);
    }
  }, [selectedEvent, eventSaving, onEventSaved, onClose]);

  return {
    // Form state
    selectedEvent,
    eventViewMode,
    eventTitle,
    eventDescription,
    eventStartDate,
    eventEndDate,
    eventStartTime,
    eventEndTime,
    eventAllDay,
    eventLocation,
    eventCalendarId,
    eventReminder,
    eventNotifications,
    isRecurring,
    recurrenceRule,
    
    // UI state
    eventSaving,
    showRecurringDeleteModal,
    startDateOpen,
    endDateOpen,
    startTimeOpen,
    endTimeOpen,
    timeErrors,
    notificationsLoading,
    showNotifications,
    
    // Actions
    setSelectedEvent,
    setEventViewMode,
    setEventTitle,
    setEventDescription,
    setEventStartDate,
    setEventEndDate,
    setEventStartTime,
    setEventEndTime,
    setEventAllDay,
    setEventLocation,
    setEventCalendarId,
    setEventReminder,
    setEventNotifications,
    setIsRecurring,
    setRecurrenceRule,
    setShowRecurringDeleteModal,
    setStartDateOpen,
    setEndDateOpen,
    setStartTimeOpen,
    setEndTimeOpen,
    setShowNotifications,
    
    // Form actions
    handleStartTimeChange,
    handleEndTimeChange,
    handleNotificationChange,
    loadEventData,
    resetForm,
    handleEventSave,
    handleEventDelete,
    handleRecurringDeleteThis,
    handleRecurringDeleteAll,
  };
}