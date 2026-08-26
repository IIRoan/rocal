"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createLogger } from "@workspace/logger";
import type {
  CalendarEvent,
  Calendar,
} from "@workspace/ui/components/calendar";
import type {
  EventParticipant,
  EventParticipantInput,
} from "@workspace/calendar-core";
import {
  getEventPickerDateRange,
  getOperationWarningMessages,
  pickerDateAndTimeToUtc,
  pickerDateToAllDayUtcRange,
} from "@workspace/calendar-core";
import { RecurrenceEngine } from "@workspace/calendar-core";
import type { RecurrenceRule } from "@/lib/types/calendar";
import type { EventNotification } from "@workspace/ui/components/calendar";
import type { UserSettings } from "@/lib/types/calendar";
import { isApiError } from "@/lib/types/calendar";
import {
  formatTimeForInput,
  validateTime,
  timeToMinutes,
  minutesToTime,
} from "@/components/command-palette/time-utils";
import { validateEventForm } from "@/components/command-palette/event-utils";
import { calendarApiService } from "@/lib/calendar-api-service";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { isCurrentUserMailAddress } from "@workspace/calendar-core";
import { useRecentContacts } from "./use-recent-contacts";

const log = createLogger("event-form");

type NotificationPayload = Pick<
  EventNotification,
  "notificationType" | "minutesBefore" | "isEnabled"
>;

function createLegacyReminderNotification(reminder: number): EventNotification {
  return {
    notificationType: "email",
    minutesBefore: reminder,
    isEnabled: true,
  };
}

function getFallbackNotifications(
  reminder: number | null | undefined,
): EventNotification[] {
  return reminder && reminder > 0
    ? [createLegacyReminderNotification(reminder)]
    : [];
}

function getReminderFromNotifications(
  notifications: NotificationPayload[],
): number | null {
  const reminderMinutes = notifications.flatMap((notification) => {
    if (!notification.isEnabled || notification.notificationType !== "email") {
      return [];
    }

    const minutes = Number(notification.minutesBefore) || 0;
    return minutes > 0 ? [minutes] : [];
  });

  return reminderMinutes.length > 0 ? Math.min(...reminderMinutes) : null;
}

function getDuplicateNotificationTimes(
  notifications: EventNotification[],
): number[] {
  const notificationTimes = notifications.flatMap((notification) =>
    notification.isEnabled ? [notification.minutesBefore] : [],
  );

  return notificationTimes.filter(
    (time, index) => notificationTimes.indexOf(time) !== index,
  );
}

function normalizeNotificationPayload(
  notifications: EventNotification[],
): NotificationPayload[] {
  const uniqueNotifications = new Map<string, NotificationPayload>();

  for (const notification of notifications) {
    const minutesBefore = Math.max(
      0,
      Math.min(43200, Number(notification.minutesBefore) || 0),
    );

    if (!notification.isEnabled || !Number.isFinite(minutesBefore)) {
      continue;
    }

    uniqueNotifications.set(
      `${notification.notificationType}-${minutesBefore}`,
      {
        notificationType: notification.notificationType,
        minutesBefore,
        isEnabled: true,
      },
    );
  }

  return Array.from(uniqueNotifications.values());
}

function replaceLegacyReminder(
  notifications: EventNotification[],
  reminder: number | null,
): EventNotification[] {
  const nonEmailNotifications = notifications.filter(
    (notification) => notification.notificationType !== "email",
  );

  if (!reminder || reminder <= 0) {
    return nonEmailNotifications;
  }

  return [...nonEmailNotifications, createLegacyReminderNotification(reminder)];
}

interface UseEventFormProps {
  calendars: Calendar[];
  localSettings: UserSettings;
  onEventSaved?: () => void;
  onClose: () => void;
}

interface UseEventFormReturn {
  // Form state
  selectedEvent: CalendarEvent | null;
  eventViewMode: "view" | "edit";
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
  eventParticipants: EventParticipantInput[];
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
  setEventParticipants: (participants: EventParticipantInput[]) => void;
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
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { recordUsage } = useRecentContacts();
  // Use ref to store calendars to avoid infinite loops
  const calendarsRef = useRef(calendars);
  useEffect(() => {
    calendarsRef.current = calendars;
  }, [calendars]);
  // Event editor state
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [eventViewMode, setEventViewMode] = useState<"view" | "edit">("view");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStartDate, setEventStartDate] = useState<Date>(new Date());
  const [eventEndDate, setEventEndDate] = useState<Date>(new Date());
  const [eventStartTime, setEventStartTime] = useState("09:00");
  const [eventEndTime, setEventEndTime] = useState("10:00");
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventLocation, setEventLocation] = useState("");
  const [eventCalendarId, setEventCalendarId] = useState<string>("");
  const [eventSaving, setEventSaving] = useState(false);
  const [isRecurring, setIsRecurringState] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(
    null,
  );
  const [showRecurringDeleteModal, setShowRecurringDeleteModal] =
    useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [startTimeOpen, setStartTimeOpen] = useState(false);
  const [endTimeOpen, setEndTimeOpen] = useState(false);
  const [timeErrors, setTimeErrors] = useState<{
    start?: string;
    end?: string;
  }>({});

  // Notification state
  const [eventNotifications, setEventNotificationsState] = useState<
    EventNotification[]
  >([]);
  const [eventParticipants, setEventParticipants] = useState<
    EventParticipantInput[]
  >([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [showNotifications, setShowNotificationsState] = useState(false);
  const eventReminder = getReminderFromNotifications(eventNotifications);

  const setEventReminder = useCallback((reminder: number | null) => {
    setEventNotificationsState((currentNotifications) =>
      replaceLegacyReminder(currentNotifications, reminder),
    );
  }, []);

  const setEventNotifications = useCallback(
    (notifications: EventNotification[]) => {
      setEventNotificationsState(notifications);
    },
    [],
  );

  const setShowNotifications = useCallback((show: boolean) => {
    setShowNotificationsState(show);
    if (!show) {
      setEventNotificationsState([]);
    }
  }, []);

  const setIsRecurring = useCallback((recurring: boolean) => {
    setIsRecurringState(recurring);
    if (!recurring) {
      setRecurrenceRule(null);
    }
  }, []);

  // Mutations
  const validateRecurrenceMutation = useMutation({
    mutationFn: (rule: RecurrenceRule) =>
      calendarApiService.validateRecurrence(rule),
  });

  const updateNotificationsMutation = useMutation({
    mutationFn: ({
      eventId,
      data,
      displayTitle,
    }: {
      eventId: string;
      data: any[];
      displayTitle?: string | null;
    }) =>
      calendarApiService.updateEventNotifications(eventId, data, {
        displayTitle,
      }),
    onSuccess: (_result, variables) => {
      // Invalidate the cached notifications list so the editor shows the
      // freshly saved entries instead of the stale 5-minute cache.
      queryClient.invalidateQueries({
        queryKey: ["eventNotifications", variables.eventId],
      });
    },
  });

  const deleteRecurringEventMutation = useMutation({
    mutationFn: ({
      parentEventId,
      mode,
      date,
    }: {
      parentEventId: string;
      mode: "this_only" | "all";
      date?: string;
    }) => calendarApiService.deleteRecurringEvent(parentEventId, mode, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  // Load event data into form
  const loadEventData = useCallback(
    async (event: CalendarEvent) => {
      const isNewEvent = !event.id || event.id === "" || event.id === undefined;
      const fallbackNotifications = getFallbackNotifications(event.reminder);

      setSelectedEvent(event);
      setEventViewMode(isNewEvent ? "edit" : "view");
      setEventTitle(event.title || "");
      setEventDescription(event.description || "");
      const { startDate, endDate } = getEventPickerDateRange(
        event,
        localSettings.timezone,
      );
      setEventStartDate(startDate);
      setEventEndDate(endDate);
      setEventStartTime(
        formatTimeForInput(new Date(event.start), localSettings.timezone),
      );
      setEventEndTime(
        formatTimeForInput(new Date(event.end), localSettings.timezone),
      );
      setEventAllDay(event.allDay || false);
      setEventLocation(event.location || "");
      setEventCalendarId(
        event.calendarId ||
        calendarsRef.current?.find((c) => !c.isSyncOnly)?.id ||
        "",
      );
      setEventNotifications(fallbackNotifications);
      setEventParticipants(
        (event.participants ?? []).map((participant: EventParticipant) => ({
          email: participant.email,
          displayName: participant.displayName ?? undefined,
          role: participant.role,
          status: participant.status,
        })),
      );
      setShowNotifications(fallbackNotifications.length > 0);

      // Handle recurring event data
      const hasRecurrence = !!event.recurrence;
      setIsRecurring(hasRecurrence);
      if (hasRecurrence && event.recurrence) {
        const parsedRule = RecurrenceEngine.parseRecurrenceRule(
          event.recurrence,
        );
        if (parsedRule) {
          setRecurrenceRule(parsedRule as RecurrenceRule);
        } else {
          log.error("Failed to parse recurrence rule:", event.recurrence);
          setIsRecurring(false);
          setRecurrenceRule(null);
        }
      } else {
        setRecurrenceRule(null);
      }

      // Load notifications for existing events
      if (!isNewEvent && event.id) {
        setNotificationsLoading(true);
        try {
          const response = await queryClient.fetchQuery({
            queryKey: ["eventNotifications", event.id],
            queryFn: () => calendarApiService.getEventNotifications(event.id),
            staleTime: 1000 * 60 * 5, // 5 minutes
          });

          if (
            response.success &&
            response.data &&
            response.data.notifications
          ) {
            const emailNotifications = response.data.notifications.flatMap(
              (n) =>
                n.notificationType === "email"
                  ? [
                    {
                      id: n.id,
                      notificationType: "email" as const,
                      minutesBefore: n.minutesBefore,
                      isEnabled: n.isEnabled,
                    },
                  ]
                  : [],
            );
            const notificationsToUse =
              emailNotifications.length > 0
                ? emailNotifications
                : fallbackNotifications;

            setEventNotifications(notificationsToUse);
            setShowNotifications(notificationsToUse.length > 0);
          }
        } catch (error) {
          log.error("Failed to load event notifications:", error);
          setEventNotifications(fallbackNotifications);
          setShowNotifications(fallbackNotifications.length > 0);
        } finally {
          setNotificationsLoading(false);
        }
      } else {
        setEventNotifications([]);
        setEventParticipants([]);
        setShowNotifications(false);
      }
    },
    [queryClient, setEventNotifications, localSettings.timezone],
  );

  // Reset form to initial state
  const resetForm = useCallback(() => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setHours(startDate.getHours() + 1);

    setSelectedEvent(null);
    setEventViewMode("view");
    setEventTitle("");
    setEventDescription("");
    setEventStartDate(startDate);
    setEventEndDate(endDate);
    setEventStartTime("09:00");
    setEventEndTime("10:00");
    setEventAllDay(false);
    setEventLocation("");
    setEventCalendarId(
      calendarsRef.current?.find((c) => !c.isSyncOnly)?.id || "",
    );
    setEventNotifications([]);
    setEventParticipants([]);
    setIsRecurring(false);
    setRecurrenceRule(null);
    setShowRecurringDeleteModal(false);
    setStartDateOpen(false);
    setEndDateOpen(false);
    setStartTimeOpen(false);
    setEndTimeOpen(false);
    setTimeErrors({});
    setShowNotifications(false);
  }, [setEventNotifications]);

  // Handle start time change with validation
  const handleStartTimeChange = useCallback(
    (newStartTime: string) => {
      const validation = validateTime(newStartTime);

      if (validation.isValid && validation.time) {
        setEventStartTime(validation.time);
        setTimeErrors((prev) => ({ ...prev, start: undefined }));

        const startMinutes = timeToMinutes(validation.time);
        const endMinutes = timeToMinutes(eventEndTime);

        if (endMinutes <= startMinutes) {
          const newEndMinutes = startMinutes + 60;
          const newEndTime = minutesToTime(newEndMinutes);
          setEventEndTime(newEndTime);
          setTimeErrors((prev) => ({ ...prev, end: undefined }));
        }
      } else {
        setEventStartTime(newStartTime);
        setTimeErrors((prev) => ({ ...prev, start: validation.error }));
      }
    },
    [eventEndTime],
  );

  // Handle end time change with validation
  const handleEndTimeChange = useCallback(
    (newEndTime: string) => {
      const validation = validateTime(newEndTime);

      if (validation.isValid && validation.time) {
        setEventEndTime(validation.time);
        setTimeErrors((prev) => ({ ...prev, end: undefined }));

        const startMinutes = timeToMinutes(eventStartTime);
        const endMinutes = timeToMinutes(validation.time);

        // If end time is before or equal to start time, auto-adjust start time
        if (endMinutes <= startMinutes) {
          const newStartMinutes = Math.max(0, endMinutes - 60); // 1 hour before end time, but not negative
          const newStartTime = minutesToTime(newStartMinutes);
          setEventStartTime(newStartTime);
          setTimeErrors((prev) => ({ ...prev, start: undefined }));
        }
      } else {
        setEventEndTime(newEndTime);
        setTimeErrors((prev) => ({ ...prev, end: validation.error }));
      }
    },
    [eventStartTime],
  );

  // Handle notification changes
  const handleNotificationChange = useCallback(
    (notifications: EventNotification[]) => {
      setEventNotifications(notifications);
    },
    [setEventNotifications],
  );

  // Save event
  const handleEventSave = useCallback(
    async (calendarData: any) => {
      const validationError = validateEventForm(
        eventTitle,
        eventCalendarId,
        eventStartDate,
        eventEndDate,
        eventAllDay,
        eventStartTime,
        eventEndTime,
        localSettings.timezone,
      );
      if (validationError) {
        toast.error(validationError);
        return;
      }

      // Validate recurrence rule if recurring is enabled
      if (isRecurring && recurrenceRule) {
        try {
          const validation =
            await validateRecurrenceMutation.mutateAsync(recurrenceRule);
          if (!validation.valid) {
            toast.error(
              `Invalid recurrence rule: ${validation.errors.join(", ")}`,
            );
            return;
          }
        } catch (error) {
          log.error("Failed to validate recurrence rule:", error);
          toast.error("Failed to validate recurrence settings");
          return;
        }
      }

      // Validate for duplicate notifications
      const duplicateTimes = getDuplicateNotificationTimes(eventNotifications);

      if (duplicateTimes.length > 0) {
        const uniqueDuplicates = [...new Set(duplicateTimes)];
        const timeText =
          uniqueDuplicates.length === 1
            ? `${uniqueDuplicates[0]} minutes before`
            : uniqueDuplicates.map((time) => `${time} minutes`).join(", ") +
            " before";

        toast.error(
          `Cannot have multiple notifications for the same time: ${timeText}`,
        );
        return;
      }

      const timezone = localSettings.timezone;
      let start: Date;
      let end: Date;

      if (!eventAllDay) {
        start = pickerDateAndTimeToUtc(
          eventStartDate,
          eventStartTime,
          timezone,
        );
        end = pickerDateAndTimeToUtc(eventEndDate, eventEndTime, timezone);
      } else {
        ({ start, end } = pickerDateToAllDayUtcRange(
          eventStartDate,
          eventEndDate,
          timezone,
        ));
      }

      const selectedCalendar = calendars.find(
        (cal) => cal.id === eventCalendarId,
      );
      const calendarColor = selectedCalendar?.color || "blue";

      const eventData = {
        id: selectedEvent?.id || "",
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        start,
        end,
        timezone: localSettings.timezone,
        allDay: eventAllDay,
        location: eventLocation.trim(),
        color: calendarColor as any,
        calendarId: eventCalendarId,
        userId: selectedEvent?.userId || "demo-user",
        createdAt: selectedEvent?.createdAt || new Date(),
        updatedAt: new Date(),
        reminder: undefined,
        recurrence:
          isRecurring && recurrenceRule ? JSON.stringify(recurrenceRule) : null,
        participants: eventParticipants.map((participant) => ({
          email: participant.email.trim().toLowerCase(),
          displayName: participant.displayName?.trim() || undefined,
          role: participant.role,
          status: participant.status,
        })),
      } satisfies Omit<CalendarEvent, "participants"> & {
        participants: EventParticipantInput[];
      };

      const notificationData = normalizeNotificationPayload(
        showNotifications ? eventNotifications : [],
      );
      eventData.reminder = getReminderFromNotifications(notificationData);

      setEventSaving(true);
      try {
        const isUpdate =
          selectedEvent?.id &&
          selectedEvent.id !== "" &&
          selectedEvent.id !== undefined;
        let savedEventId = selectedEvent?.id;
        let persistedEvent: CalendarEvent | null = null;

        if (isUpdate) {
          persistedEvent = await calendarData.updateEvent(selectedEvent.id, {
            title: eventData.title,
            description: eventData.description,
            start: eventData.start.toISOString(),
            end: eventData.end.toISOString(),
            timezone: eventData.timezone ?? undefined,
            allDay: eventData.allDay,
            location: eventData.location,
            calendarId: eventData.calendarId,
            reminder: eventData.reminder ?? null,
            recurrence: eventData.recurrence ?? null,
            participants: eventData.participants,
          });
          savedEventId = persistedEvent?.id ?? selectedEvent.id;
          toast.success(`Event "${eventTitle}" updated`);
          for (const warningMessage of getOperationWarningMessages(
            persistedEvent,
          )) {
            toast.warning(warningMessage);
          }
        } else {
          const newEvent = await calendarData.createEvent({
            title: eventData.title,
            description: eventData.description,
            start: eventData.start.toISOString(),
            end: eventData.end.toISOString(),
            timezone: eventData.timezone ?? undefined,
            allDay: eventData.allDay,
            location: eventData.location,
            calendarId: eventData.calendarId,
            reminder: eventData.reminder ?? null,
            recurrence: eventData.recurrence ?? undefined,
            participants: eventData.participants,
          });
          persistedEvent = newEvent;
          savedEventId = newEvent.id;
          toast.success(`Event "${eventTitle}" created`);
          for (const warningMessage of getOperationWarningMessages(newEvent)) {
            toast.warning(warningMessage);
          }
        }

        // Save notifications (non-blocking, sanitized)
        if (savedEventId) {
          // If the event starts in the past, skip creating future reminders,
          // but still allow an empty update to clear existing rows.
          const now = new Date();
          const startsInFuture = new Date(eventData.start) > now;
          const shouldSyncNotifications =
            notificationData.length === 0 || startsInFuture;
          if (shouldSyncNotifications) {
            try {
              await updateNotificationsMutation.mutateAsync({
                eventId: savedEventId,
                data: notificationData,
                displayTitle: eventTitle,
              });
            } catch (notifError) {
              log.warn(
                "Failed to update event notifications (non-fatal):",
                notifError,
              );
              // Do not block saving the event on notification failures
              toast.warning?.("Saved event without notifications", {
                description:
                  "Notification settings could not be updated right now.",
                position: "bottom-left",
              } as any);
            }
          }
        }

        if (savedEventId) {
          const nextEvent: CalendarEvent = {
            ...(selectedEvent ?? {}),
            ...eventData,
            ...(persistedEvent ?? {}),
            id: persistedEvent?.id ?? savedEventId,
            reminder:
              persistedEvent && "reminder" in persistedEvent
                ? (persistedEvent.reminder ?? null)
                : (eventData.reminder ?? null),
            start: new Date(persistedEvent?.start ?? eventData.start),
            end: new Date(persistedEvent?.end ?? eventData.end),
            createdAt: new Date(
              persistedEvent?.createdAt ??
              selectedEvent?.createdAt ??
              eventData.createdAt,
            ),
            updatedAt: new Date(
              persistedEvent?.updatedAt ?? eventData.updatedAt,
            ),
            participants:
              persistedEvent?.participants ?? selectedEvent?.participants ?? [],
          };

          queryClient.setQueriesData<CalendarEvent[]>(
            { queryKey: ["events"] },
            (oldEvents) => {
              if (!oldEvents) {
                return oldEvents;
              }

              if (oldEvents.some((event) => event.id === nextEvent.id)) {
                return oldEvents.map((event) =>
                  event.id === nextEvent.id
                    ? { ...event, ...nextEvent }
                    : event,
                );
              }

              return isUpdate ? oldEvents : [...oldEvents, nextEvent];
            },
          );

          setSelectedEvent(nextEvent);
        }

        if (eventData.participants.length > 0) {
          const accountEmail = session?.user?.email ?? null;
          const entries: Array<{
            email: string;
            displayName: string | null | undefined;
          }> = [];
          for (const participant of eventData.participants) {
            if (isCurrentUserMailAddress(participant.email, accountEmail)) {
              continue;
            }
            entries.push({
              email: participant.email,
              displayName: participant.displayName,
            });
          }
          if (entries.length > 0) {
            recordUsage(entries, "calendar");
          }
        }

        onEventSaved?.();

        setTimeout(() => {
          onClose();
          resetForm();
        }, 100);
      } catch (error) {
        log.error("Failed to save event:", error);

        let errorMessage = "Failed to save event";
        if (isApiError(error)) {
          if (error.message.includes("Network")) {
            errorMessage =
              "Network error - please check your connection and try again";
          } else if (error.message.includes("validation")) {
            errorMessage = "Invalid event data - please check all fields";
          } else if (error.statusCode === 422) {
            if (
              error.message.includes("Duplicate notification") ||
              error.message.includes("duplicate")
            ) {
              errorMessage =
                "Cannot have multiple notifications for the same time. Please remove duplicate notification times.";
            } else {
              errorMessage =
                "Invalid data - please check all fields and try again";
            }
          } else if (error.statusCode === 404) {
            errorMessage = "Event not found - it may have been deleted";
            setSelectedEvent(null);
          } else if (error.statusCode === 403) {
            errorMessage = "You don't have permission to save this event";
          } else if (error.statusCode === 500) {
            errorMessage = "Server error - please try again later";
          }
        } else if (error instanceof Error) {
          if (error.message.includes("Network")) {
            errorMessage =
              "Network error - please check your connection and try again";
          }
        }

        toast.error(errorMessage);
      } finally {
        setEventSaving(false);
      }
    },
    [
      eventTitle,
      eventCalendarId,
      eventStartDate,
      eventEndDate,
      eventAllDay,
      eventStartTime,
      eventEndTime,
      isRecurring,
      recurrenceRule,
      eventNotifications,
      eventParticipants,
      eventDescription,
      eventLocation,
      showNotifications,
      calendars,
      selectedEvent,
      onEventSaved,
      onClose,
      queryClient,
      resetForm,
      validateRecurrenceMutation,
      updateNotificationsMutation,
      localSettings.timezone,
      session,
      recordUsage,
    ],
  );

  // Delete event
  const handleEventDelete = useCallback<(calendarData: any) => Promise<void>>(
    async (calendarData: any) => {
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
        log.error("Failed to delete event:", error);
        toast.error("Failed to delete event");
      } finally {
        setEventSaving(false);
      }
    },
    [selectedEvent, eventTitle, onEventSaved, onClose, resetForm],
  );

  // Delete recurring event - this instance only
  const handleRecurringDeleteThis = useCallback(
    async (calendarData: any) => {
      if (!selectedEvent?.id) return;

      if (eventSaving) return;

      setShowRecurringDeleteModal(false);

      let parentEventId = selectedEvent.parentEventId || selectedEvent.id;

      if (!selectedEvent.parentEventId && selectedEvent.id.includes("_")) {
        const parts = selectedEvent.id.split("_");
        if (parts.length > 1 && parts[0]) {
          parentEventId = parts[0];
        }
      }

      let occurrenceDate = selectedEvent.start.toISOString();
      let dateFromId = null;

      if (selectedEvent.id.includes("_")) {
        const parts = selectedEvent.id.split("_");
        if (parts.length > 1) {
          dateFromId = parts[1];
          if (dateFromId) {
            occurrenceDate = dateFromId;
          }
        }
      }

      setEventSaving(true);
      try {
        await deleteRecurringEventMutation.mutateAsync({
          parentEventId,
          mode: "this_only",
          date: occurrenceDate,
        });
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

        await new Promise((resolve) => setTimeout(resolve, 500));
        onClose();
      } catch (error: any) {
        log.error("Failed to delete recurring event occurrence:", error);
        toast.error(
          `Failed to delete event occurrence: ${error.message || "Unknown error"}`,
        );
      } finally {
        setEventSaving(false);
      }
    },
    [
      selectedEvent,
      eventSaving,
      onEventSaved,
      onClose,
      deleteRecurringEventMutation,
    ],
  );

  // Delete recurring event - entire series
  const handleRecurringDeleteAll = useCallback(
    async (calendarData: any) => {
      if (!selectedEvent?.id) return;

      if (eventSaving) return;

      setShowRecurringDeleteModal(false);

      let parentEventId = selectedEvent.parentEventId || selectedEvent.id;

      if (!selectedEvent.parentEventId && selectedEvent.id.includes("_")) {
        const parts = selectedEvent.id.split("_");
        if (parts.length > 1 && parts[0]) {
          parentEventId = parts[0];
        }
      }

      setEventSaving(true);
      try {
        await deleteRecurringEventMutation.mutateAsync({
          parentEventId,
          mode: "all",
        });
        toast.success("Entire event series deleted");

        if (calendarData?.refetchEvents) {
          await calendarData.refetchEvents();
        } else {
          onEventSaved?.();
        }

        onClose();
      } catch (error: any) {
        log.error("Failed to delete recurring event series:", error);
        toast.error("Failed to delete event series");
      } finally {
        setEventSaving(false);
      }
    },
    [
      selectedEvent,
      eventSaving,
      onEventSaved,
      onClose,
      deleteRecurringEventMutation,
    ],
  );

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
    eventParticipants,
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
    setEventParticipants,
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
