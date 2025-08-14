"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSettings } from "@/hooks/use-settings";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
import { format, isBefore } from "date-fns";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import type { UserSettings, UpdateSettingsRequest } from "@/lib/types/calendar";
import { PasskeySettings } from "./passkey-settings";
import { SubscriptionManagement } from "./subscription-management";
import {
  AppearanceSettings,
  NotificationSettings,
  TimeRegionSettings,
  CalendarDefaultsSettings,
  AccountSettings,
  SecuritySettings,
  ALL_TIMEZONES,
  WORKING_DAYS,
  type PaletteView,
  TransitionContainer,
  NAVIGATION_ITEMS,
  PRESET_COLORS,
  formatTimeForInput,
  validateTime,
  timeToMinutes,
  minutesToTime,
  scrollToSelectedTime,
  generateAllTimeOptions,
  resetEventForm,
  loadEventNotifications,
  saveEventNotifications,
  validateEventForm,
  validateCalendarForm,
  handleCalendarCreate,
  handleCalendarUpdate,
  handleCalendarDelete,
  resetCalendarForm,
} from "./command-palette/index";
import {
  NotificationManager,
  EventNotification,
} from "@workspace/ui/components/calendar/notification-manager";
import { calendarApiService } from "@/lib/calendar-api-service";
import {
  CommandDialog,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandInput,
} from "@workspace/ui/components/navigation/command";
import { Switch } from "@workspace/ui/components/ui/switch";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Textarea } from "@workspace/ui/components/ui/textarea";
import { Checkbox } from "@workspace/ui/components/ui/checkbox";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { Calendar as CalendarUI } from "@workspace/ui/components/ui/calendar";
import {
  Settings,
  Monitor,
  Sun,
  Moon,
  Clock,
  Globe,
  Bell,
  Calendar,
  Eye,
  User,
  Shield,
  Mail,
  Palette,
  Layout,
  Volume2,
  RotateCcw,
  ChevronRight,
  Check,
  RefreshCw,
  ArrowLeft,
  X,
  Key,
  CalendarIcon,
  FileText,
  MapPin,
  Plus,
  Edit3,
  Save,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";


interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventToEdit?: CalendarEvent | null;
  onEventSaved?: () => void;
  initialView?: string;
}



export function CommandPalette({
  open,
  onOpenChange,
  eventToEdit,
  onEventSaved,
  initialView = "main",
}: CommandPaletteProps) {
  const calendarData = useSharedCalendarData();
  const { calendars } = calendarData;
  const { settings, loading, updateSettings, resetSettings } = useSettings();

  const [currentView, setCurrentView] = useState<PaletteView>(
    initialView as PaletteView
  );
  const [transitionDirection, setTransitionDirection] = useState<
    "forward" | "back"
  >("forward");

  const goForward = (next: PaletteView) => {
    setTransitionDirection("forward");
    setCurrentView(next);
  };

  const goBack = (prev: PaletteView) => {
    setTransitionDirection("back");
    setCurrentView(prev);
  };

  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState("");

  // Event editor state
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
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
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [startTimeOpen, setStartTimeOpen] = useState(false);
  const [endTimeOpen, setEndTimeOpen] = useState(false);
  const [timeErrors, setTimeErrors] = useState<{ start?: string; end?: string }>({});
  const startTimeDropdownRef = useRef<HTMLDivElement>(null);
  const endTimeDropdownRef = useRef<HTMLDivElement>(null);

  // Notification state
  const [eventNotifications, setEventNotifications] = useState<
    EventNotification[]
  >([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Calendar management state
  const [calendarName, setCalendarName] = useState("");
  const [calendarColor, setCalendarColor] = useState("#3b82f6");
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<any>(null);
  const [calendarValidationErrors, setCalendarValidationErrors] = useState<{
    name?: string;
    color?: string;
  }>({});

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!open) {
      setCurrentView(initialView as PaletteView);
      setShowResetConfirm(false);
      // Reset event editor state when dialog closes
      setSelectedEvent(null);
      setEventNotifications([]);
      setShowNotifications(false);
    }
  }, [open, initialView]);

  // Update view when initialView changes
  useEffect(() => {
    if (open) {
      setCurrentView(initialView as PaletteView);
    }
  }, [initialView, open]);

  // Handle external event to edit
  useEffect(() => {
    if (eventToEdit && open) {
      const isNewEvent =
        !eventToEdit.id ||
        eventToEdit.id === "" ||
        eventToEdit.id === undefined;
      const isSynced = eventToEdit.isSynced || false;

      console.log("Setting up event editor:", {
        eventId: eventToEdit.id,
        isNewEvent,
        isSynced,
        title: eventToEdit.title,
      });

      setSelectedEvent(eventToEdit);
      // Set view mode: new events start in edit, existing events start in view
      // Synced events are always read-only unless explicitly edited
      setEventViewMode(isNewEvent ? 'edit' : 'view');
      setEventTitle(eventToEdit.title || "");
      setEventDescription(eventToEdit.description || "");
      setEventStartDate(new Date(eventToEdit.start));
      setEventEndDate(new Date(eventToEdit.end));
      setEventStartTime(formatTimeForInput(new Date(eventToEdit.start)));
      setEventEndTime(formatTimeForInput(new Date(eventToEdit.end)));
      setEventAllDay(eventToEdit.allDay || false);
      setEventLocation(eventToEdit.location || "");
      setEventCalendarId(eventToEdit.calendarId || calendars?.[0]?.id || "");
      setEventReminder(eventToEdit.reminder ?? null);

      // Load notifications for existing events
      if (!isNewEvent && eventToEdit.id) {
        loadEventNotifications(eventToEdit.id, setEventNotifications, setNotificationsLoading);
      } else {
        // For new events, add default 15-minute email notification
        setEventNotifications([
          {
            notificationType: "email",
            minutesBefore: 15,
            isEnabled: true,
          },
        ]);
      }

      setTransitionDirection("forward");
      setCurrentView("event-editor");
    }
  }, [eventToEdit, open, calendars]);

  useEffect(() => {
    setShowResetConfirm(false);
    setTimezoneSearch("");
  }, [currentView]);

  // Close time dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Check if click is outside both time input containers
      const startTimeContainer = target.closest('[data-time-input="start"]');
      const endTimeContainer = target.closest('[data-time-input="end"]');

      if (!startTimeContainer && startTimeOpen) {
        setStartTimeOpen(false);
      }
      if (!endTimeContainer && endTimeOpen) {
        setEndTimeOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [startTimeOpen, endTimeOpen]);

  // Scroll to selected time when dropdowns open
  useEffect(() => {
    if (startTimeOpen) {
      // Small delay to ensure dropdown is rendered
      setTimeout(() => {
        scrollToSelectedTime(startTimeDropdownRef, eventStartTime);
      }, 50);
    }
  }, [startTimeOpen, eventStartTime]);

  useEffect(() => {
    if (endTimeOpen) {
      // Small delay to ensure dropdown is rendered
      setTimeout(() => {
        scrollToSelectedTime(endTimeDropdownRef, eventEndTime);
      }, 50);
    }
  }, [endTimeOpen, eventEndTime]);

  // Save notifications for an event
  const saveEventNotifications = useCallback(
    async (eventId: string, notifications: EventNotification[]) => {
      if (!eventId) return;

      try {
        const notificationData = notifications.map((n) => ({
          notificationType: n.notificationType,
          minutesBefore: n.minutesBefore,
          isEnabled: n.isEnabled,
        }));

        await calendarApiService.updateEventNotifications(
          eventId,
          notificationData
        );
      } catch (error) {
        console.error("Failed to save event notifications:", error);
        toast.error("Failed to save notification settings");
      }
    },
    []
  );

  // Handle notification changes without auto-save
  const handleNotificationChange = useCallback(
    (notifications: EventNotification[]) => {
      setEventNotifications(notifications);
      // No auto-save - notifications will be saved when user saves the event
    },
    []
  );

  const updateSetting = async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    if (!localSettings || saving) return;

    // Update local state immediately
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);

    // Save to backend immediately
    setSaving(true);
    try {
      const updateData: UpdateSettingsRequest = {
        theme: newSettings.theme,
        defaultView: newSettings.defaultView,
        weekStartDay: newSettings.weekStartDay,
        timezone: newSettings.timezone,
        timeFormat: newSettings.timeFormat,
        workingHoursStart: newSettings.workingHoursStart,
        workingHoursEnd: newSettings.workingHoursEnd,
        workingDays: newSettings.workingDays,
        emailNotifications: newSettings.emailNotifications,
        browserNotifications: newSettings.browserNotifications,
        reminderSound: newSettings.reminderSound,
        defaultReminder: newSettings.defaultReminder,
        defaultEventDuration: newSettings.defaultEventDuration,
        defaultCalendarId: newSettings.defaultCalendarId,
        compactView: newSettings.compactView,
        showWeekNumbers: newSettings.showWeekNumbers,
        showDeclinedEvents: newSettings.showDeclinedEvents,
      };

      await updateSettings(updateData);
    } catch (err: any) {
      console.error("Failed to save settings:", err);
      // Revert to original settings on error
      setLocalSettings(localSettings);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await resetSettings();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Failed to reset settings:", err);
    } finally {
      setSaving(false);
    }
  };


  if (loading || !localSettings) {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Loading settings...
              </p>
            </div>
          </div>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  const workingDaysList = JSON.parse(localSettings.workingDays) as number[];



  // Handle start time change with validation
  const handleStartTimeChange = (newStartTime: string) => {
    const validation = validateTime(newStartTime);

    if (validation.isValid && validation.time) {
      setEventStartTime(validation.time);
      setTimeErrors(prev => ({ ...prev, start: undefined }));

      // Auto-update end time if it's before or equal to the new start time
      const startMinutes = timeToMinutes(validation.time);
      const endMinutes = timeToMinutes(eventEndTime);

      if (endMinutes <= startMinutes) {
        // Set end time to 1 hour after start time (Google Calendar default)
        const newEndMinutes = startMinutes + 60;
        const newEndTime = minutesToTime(newEndMinutes);
        setEventEndTime(newEndTime);
        setTimeErrors(prev => ({ ...prev, end: undefined }));
      }
    } else {
      setEventStartTime(newStartTime); // Keep the typed value for user feedback
      setTimeErrors(prev => ({ ...prev, start: validation.error }));
    }
  };

  // Handle end time change with validation
  const handleEndTimeChange = (newEndTime: string) => {
    const validation = validateTime(newEndTime);

    if (validation.isValid && validation.time) {
      const startMinutes = timeToMinutes(eventStartTime);
      const endMinutes = timeToMinutes(validation.time);

      if (endMinutes > startMinutes) {
        setEventEndTime(validation.time);
        setTimeErrors(prev => ({ ...prev, end: undefined }));
      } else {
        setEventEndTime(newEndTime); // Keep the typed value
        setTimeErrors(prev => ({ ...prev, end: 'End time must be after start time' }));
      }
    } else {
      setEventEndTime(newEndTime); // Keep the typed value for user feedback
      setTimeErrors(prev => ({ ...prev, end: validation.error }));
    }
  };





  const handleEventSave = async () => {
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
          : uniqueDuplicates.map((time) => `${time} minutes`).join(", ") +
            " before";

      toast.error(
        `Cannot have multiple notifications for the same time: ${timeText}`
      );
      return;
    }

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

    const selectedCalendar = calendars.find(
      (cal) => cal.id === eventCalendarId
    );
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
      // Don't use legacy reminder field - use new notification system instead
      reminder: undefined,
    };

    // Convert legacy reminder to notification if needed
    let finalNotifications = [...eventNotifications];
    if (eventReminder && eventReminder > 0) {
      // Check if we already have a notification for this time
      const existingNotification = finalNotifications.find(
        (n) =>
          n.minutesBefore === eventReminder && n.notificationType === "email"
      );

      if (!existingNotification) {
        finalNotifications.push({
          notificationType: "email",
          minutesBefore: eventReminder,
          isEnabled: true,
        });
        console.log(
          `🔄 Converted legacy reminder (${eventReminder}min) to notification`
        );
      }
    }

    setEventSaving(true);
    try {
      // Check if this is an update to an existing event or a new event creation
      const isUpdate =
        selectedEvent?.id &&
        selectedEvent.id !== "" &&
        selectedEvent.id !== undefined;

      console.log("Event save attempt:", {
        isUpdate,
        selectedEventId: selectedEvent?.id,
        selectedEvent: selectedEvent,
        availableEvents: calendarData.events?.length || 0,
        eventTitle,
      });

      let savedEventId = selectedEvent?.id;

      if (isUpdate) {
        console.log("Updating existing event:", selectedEvent.id, {
          title: eventTitle,
        });
        // Update existing event [buildwithfern.com](https://buildwithfern.com/learn/fern-definition/types) - Example of validation in `Person` interface
        await calendarData.updateEvent(selectedEvent.id, {
          title: eventData.title,
          description: eventData.description,
          start: eventData.start.toISOString(),
          end: eventData.end.toISOString(),
          allDay: eventData.allDay,
          location: eventData.location,
          calendarId: eventData.calendarId,
          reminder: undefined, // Use new notification system instead
        });
        toast.success(`Event "${eventTitle}" updated`);
      } else {
        console.log("Creating new event:", { title: eventTitle });
        // Create new event
        const newEvent = await calendarData.createEvent({
          title: eventData.title,
          description: eventData.description,
          start: eventData.start.toISOString(),
          end: eventData.end.toISOString(),
          allDay: eventData.allDay,
          location: eventData.location,
          calendarId: eventData.calendarId,
          reminder: undefined, // Use new notification system instead
        });
        console.log("Event created successfully:", newEvent.id);
        savedEventId = newEvent.id;
        toast.success(`Event "${eventTitle}" created`);
      }

      // Save notifications using the new notification system
      if (savedEventId && finalNotifications.length > 0) {
        await saveEventNotifications(savedEventId, finalNotifications);
      }

      // Trigger calendar refresh
      onEventSaved?.();

      // Small delay to ensure optimistic updates are processed, then close palette
      setTimeout(() => {
        onOpenChange(false);
        resetEventForm(calendars, {
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
        });
      }, 100);
    } catch (error: any) {
      console.error("Failed to save event:", error);

      // Provide more specific error messages
      let errorMessage = "Failed to save event";

      if (error.message?.includes("Network")) {
        errorMessage =
          "Network error - please check your connection and try again";
      } else if (error.message?.includes("validation")) {
        errorMessage = "Invalid event data - please check all fields";
      } else if (error.statusCode === 422) {
        // Handle 422 Unprocessable Entity errors
        if (
          error.message?.includes("Duplicate notification") ||
          error.message?.includes("duplicate")
        ) {
          errorMessage =
            "Cannot have multiple notifications for the same time. Please remove duplicate notification times.";
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
  };

  const handleEventDelete = async () => {
    if (!selectedEvent?.id) return;

    setEventSaving(true);
    try {
      await calendarData.deleteEvent(selectedEvent.id);
      toast.success(`Event "${eventTitle}" deleted`);

      // Trigger calendar refresh
      onEventSaved?.();

      // Small delay to ensure optimistic updates are processed, then close palette
      setTimeout(() => {
        onOpenChange(false);
        resetEventForm(calendars, {
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
        });
      }, 100);
    } catch (error: any) {
      console.error("Failed to delete event:", error);
      toast.error("Failed to delete event");
    } finally {
      setEventSaving(false);
    }
  };


  if (currentView === "main") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground">Settings</h2>
          </div>
          <CommandList>
            <CommandGroup heading="Categories">
              {NAVIGATION_ITEMS.map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => goForward(item.id as PaletteView)}
                  className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30 border-b border-border/30 last:border-b-0"
                >
                  <item.icon className="mr-3 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {item.label}
                    </span>
                    <span className="text-xs text-muted-foreground/80">
                      {item.description}
                    </span>
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  if (currentView === "appearance") {
    return (
      <AppearanceSettings
        open={open}
        onOpenChange={onOpenChange}
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
        TransitionContainer={TransitionContainer}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "notifications") {
    return (
      <NotificationSettings
        open={open}
        onOpenChange={onOpenChange}
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
        TransitionContainer={TransitionContainer}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "time-region" || currentView === "timezone") {
    return (
      <TimeRegionSettings
        open={open}
        onOpenChange={onOpenChange}
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
        goForward={goForward}
        currentView={currentView}
        TransitionContainer={TransitionContainer}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "calendar-defaults") {
    return (
      <CalendarDefaultsSettings
        open={open}
        onOpenChange={onOpenChange}
        localSettings={localSettings}
        updateSetting={updateSetting}
        goBack={goBack}
        workingDaysList={workingDaysList}
        TransitionContainer={TransitionContainer}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "account") {
    return (
      <AccountSettings
        open={open}
        onOpenChange={onOpenChange}
        goBack={goBack}
        saving={saving}
        handleReset={handleReset}
        TransitionContainer={TransitionContainer}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "security") {
    return (
      <SecuritySettings
        open={open}
        onOpenChange={onOpenChange}
        goBack={goBack}
        goForward={goForward}
        TransitionContainer={TransitionContainer}
        transitionDirection={transitionDirection}
      />
    );
  }

  if (currentView === "passkeys") {
    return (
      <PasskeySettings
        open={open}
        onOpenChange={onOpenChange}
        onBack={() => goBack("security")}
      />
    );
  }

  if (currentView === "subscriptions") {
    return (
      <SubscriptionManagement
        open={open}
        onOpenChange={onOpenChange}
        onBack={() => goBack("calendars")}
      />
    );
  }

  if (currentView === "calendars") {

    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
            <button
              onClick={() => goBack("main")}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <h2 className="text-lg font-semibold text-foreground">
              Calendar Management
            </h2>
          </div>
          <CommandList>
            <CommandGroup heading="Actions">
              <CommandItem
                onSelect={() => {
                  resetCalendarForm({
                    setCalendarName,
                    setCalendarColor,
                    setEditingCalendar,
                    setCalendarValidationErrors,
                  });
                  goForward("calendar-create");
                }}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Plus className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Create New Calendar</span>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
              </CommandItem>

              <CommandItem
                onSelect={() => {
                  goForward("subscriptions");
                }}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Globe className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Subscribe to External Calendar</span>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Your Calendars">
              {calendars.map((calendar) => (
                <CommandItem
                  key={calendar.id}
                  onSelect={() => {
                    setEditingCalendar(calendar);
                    setCalendarName(calendar.name);
                    setCalendarColor(calendar.color);
                    setCalendarValidationErrors({});
                    goForward("calendar-edit");
                  }}
                  className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
                >
                  <div
                    className="mr-3 h-4 w-4 rounded"
                    style={{ backgroundColor: calendar.color }}
                  />
                  <div className="flex flex-col">
                    <span className="text-foreground">{calendar.name}</span>
                    {calendar.isDefault && (
                      <span className="text-xs text-muted-foreground">
                        Default calendar
                      </span>
                    )}
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  if (currentView === "calendar-create") {

    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
            <button
              onClick={() => goBack("calendars")}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <h2 className="text-lg font-semibold text-foreground">
              Create Calendar
            </h2>
          </div>

          <div className="max-h-[80vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Calendar Name */}
              <div className="space-y-2">
                <Label
                  htmlFor="calendar-name"
                  className="flex items-center gap-2"
                >
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Calendar Name
                </Label>
                <Input
                  id="calendar-name"
                  value={calendarName}
                  onChange={(e) => {
                    setCalendarName(e.target.value);
                    if (calendarValidationErrors.name) {
                      setCalendarValidationErrors({
                        ...calendarValidationErrors,
                        name: undefined,
                      });
                    }
                  }}
                  placeholder="Enter calendar name"
                  className={
                    calendarValidationErrors.name ? "border-red-500" : ""
                  }
                />
                {calendarValidationErrors.name && (
                  <p className="text-sm text-red-600">
                    {calendarValidationErrors.name}
                  </p>
                )}
              </div>

              {/* Color Selection */}
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setCalendarColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        calendarColor === color
                          ? "border-foreground scale-110"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="color"
                    value={calendarColor}
                    onChange={(e) => setCalendarColor(e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">
                    Or pick a custom color
                  </span>
                </div>
                {calendarValidationErrors.color && (
                  <p className="text-sm text-red-600">
                    {calendarValidationErrors.color}
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="border-t border-border bg-card/20 px-6 py-4 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => goBack("calendars")}
                disabled={calendarSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleCalendarCreate(
                  calendarName,
                  calendarColor,
                  calendars,
                  calendarData,
                  {
                    setCalendarValidationErrors,
                    setCalendarSaving,
                    setCalendarName,
                    setCalendarColor,
                  },
                  goBack
                )}
                disabled={calendarSaving || !calendarName.trim()}
              >
                {calendarSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Create Calendar
                  </>
                )}
              </Button>
            </div>
          </div>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  if (currentView === "calendar-edit") {

    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
            <button
              onClick={() => goBack("calendars")}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <h2 className="text-lg font-semibold text-foreground">
              Edit Calendar
            </h2>
          </div>

          <div className="max-h-[80vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Calendar Name */}
              <div className="space-y-2">
                <Label
                  htmlFor="calendar-name"
                  className="flex items-center gap-2"
                >
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Calendar Name
                </Label>
                <Input
                  id="calendar-name"
                  value={calendarName}
                  onChange={(e) => {
                    setCalendarName(e.target.value);
                    if (calendarValidationErrors.name) {
                      setCalendarValidationErrors({
                        ...calendarValidationErrors,
                        name: undefined,
                      });
                    }
                  }}
                  placeholder="Enter calendar name"
                  className={
                    calendarValidationErrors.name ? "border-red-500" : ""
                  }
                />
                {calendarValidationErrors.name && (
                  <p className="text-sm text-red-600">
                    {calendarValidationErrors.name}
                  </p>
                )}
              </div>

              {/* Color Selection */}
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setCalendarColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        calendarColor === color
                          ? "border-foreground scale-110"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="color"
                    value={calendarColor}
                    onChange={(e) => setCalendarColor(e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">
                    Or pick a custom color
                  </span>
                </div>
                {calendarValidationErrors.color && (
                  <p className="text-sm text-red-600">
                    {calendarValidationErrors.color}
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="border-t border-border bg-card/20 px-6 py-4 flex items-center justify-between">
              {editingCalendar && (
                <Button
                  variant="outline"
                  onClick={() => handleCalendarDelete(
                    editingCalendar,
                    calendarData,
                    setCalendarSaving,
                    goBack
                  )}
                  disabled={calendarSaving}
                  className="text-destructive hover:text-destructive"
                >
                  {calendarSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button
                  variant="outline"
                  onClick={() => goBack("calendars")}
                  disabled={calendarSaving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleCalendarUpdate(
                    calendarName,
                    calendarColor,
                    calendars,
                    editingCalendar,
                    calendarData,
                    {
                      setCalendarValidationErrors,
                      setCalendarSaving,
                      setEditingCalendar,
                    },
                    goBack
                  )}
                  disabled={calendarSaving || !calendarName.trim()}
                >
                  {calendarSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  if (currentView === "events") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
            <button
              onClick={() => goBack("main")}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <h2 className="text-lg font-semibold text-foreground">Events</h2>
          </div>
          <CommandList>
            <CommandGroup heading="Actions">
              <CommandItem
                onSelect={() => {
                  resetEventForm(calendars, {
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
        });
                  goForward("event-editor");
                }}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Plus className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Create New Event</span>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  // Generate all time options once
  const allTimeOptions = generateAllTimeOptions(localSettings?.timeFormat);

  if (currentView === "event-editor") {

    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-gradient-to-r from-primary/5 to-primary/10 border-b border-border/50 px-6 py-5 flex items-center gap-4">
            <button
              onClick={() => goBack("events")}
              className="p-2 rounded-full hover:bg-background/80 transition-colors shadow-sm border border-border/50"
            >
              <ArrowLeft className="h-4 w-4 text-foreground" />
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-foreground">
                {!selectedEvent?.id ? "Create New Event" :
                 eventViewMode === 'view' ? selectedEvent.title : "Edit Event"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {!selectedEvent?.id ? "Add an event to your calendar" :
                 selectedEvent.isSynced && eventViewMode === 'view' ? "Synced from external calendar" :
                 eventViewMode === 'view' ? "Event details" :
                 "Make changes to your event"}
              </p>
            </div>

            {/* Edit button for view mode */}
            {selectedEvent?.id && eventViewMode === 'view' && !selectedEvent.isSynced && (
              <Button
                onClick={() => setEventViewMode('edit')}
                variant="outline"
                size="sm"
                className="ml-4"
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Edit Event
              </Button>
            )}
          </div>

          <div className="max-h-[80vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              {eventViewMode === 'view' ? (
                /* VIEW MODE - Read-only display */
                <>
                  {/* Title */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Event Title
                      {selectedEvent?.isSynced && (
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                          Synced
                        </span>
                      )}
                    </Label>
                    <div className="p-3 bg-muted/50 rounded-md border">
                      <p className="text-base">{eventTitle || "Untitled Event"}</p>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Description</Label>
                    <div className="p-3 bg-muted/50 rounded-md border min-h-[60px]">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {eventDescription || "No description provided"}
                      </p>
                    </div>
                  </div>

                  {/* Date and Time */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      Date & Time
                    </Label>
                    <div className="p-3 bg-muted/50 rounded-md border space-y-2">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-sm font-medium">
                            {format(eventStartDate, "EEEE, MMMM d, yyyy")}
                          </p>
                          {!eventAllDay && (
                            <p className="text-sm text-muted-foreground">
                              {eventStartTime} - {eventEndTime}
                            </p>
                          )}
                          {eventAllDay && (
                            <p className="text-sm text-muted-foreground">All day</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  {eventLocation && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        Location
                      </Label>
                      <div className="p-3 bg-muted/50 rounded-md border">
                        <p className="text-sm">{eventLocation}</p>
                      </div>
                    </div>
                  )}

                  {/* Calendar */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: calendars.find(c => c.id === eventCalendarId)?.color || '#3b82f6' }}></div>
                      Calendar
                    </Label>
                    <div className="p-3 bg-muted/50 rounded-md border">
                      <p className="text-sm">{calendars.find(c => c.id === eventCalendarId)?.name || "Unknown Calendar"}</p>
                    </div>
                  </div>
                </>
              ) : (
                /* EDIT MODE - Editable form */
                <>
                  {/* Title */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="event-title"
                      className="flex items-center gap-2 text-sm font-medium"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Event Title
                    </Label>
                    <Input
                      id="event-title"
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder="What's the event about?"
                      className="border-2 hover:border-primary/50 focus:border-primary transition-colors text-base"
                      autoFocus // [academy.posh.vip](https://academy.posh.vip/edit-your-event-details) - Event title can be edited here
                    />
                  </div>
                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="event-description" className="text-sm font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Textarea
                      id="event-description"
                      value={eventDescription}
                      onChange={(e) => setEventDescription(e.target.value)}
                      rows={2}
                      placeholder="Add more details about your event..."
                      className="border-2 hover:border-primary/50 focus:border-primary transition-colors resize-none"
                    />
                  </div>

                  {/* Calendar Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="event-calendar" className="text-sm font-medium flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: calendars.find(c => c.id === eventCalendarId)?.color || '#3b82f6' }}></div>
                      Calendar
                    </Label>
                    <Select
                      value={eventCalendarId}
                      onValueChange={setEventCalendarId}
                    >
                      <SelectTrigger id="event-calendar" className="border-2 hover:border-primary/50 focus:border-primary transition-colors">
                        <SelectValue placeholder="Choose which calendar to save to" />
                      </SelectTrigger>
                      <SelectContent>
                        {calendars.map((calendar) => (
                          <SelectItem key={calendar.id} value={calendar.id} className="cursor-pointer">
                            <div className="flex items-center gap-3">
                              <span
                                className="size-3 rounded-full border border-white/20"
                                style={{ backgroundColor: calendar.color }}
                              />
                              <span>{calendar.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date and Time - Google Material Design Style */}
                  <div className="space-y-6">
                    {/* Date Row */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">Start Date</Label>
                        <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-between px-3 py-2.5 font-normal border-2 hover:border-primary/50 focus:border-primary transition-colors"
                            >
                              <span className="text-sm">
                                {eventStartDate
                                  ? format(eventStartDate, "EEE, MMM d")
                                  : "Pick a date"}
                              </span>
                              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarUI
                              mode="single"
                              selected={eventStartDate}
                              onSelect={(date) => {
                                if (date) {
                                  setEventStartDate(date);
                                  if (isBefore(eventEndDate, date))
                                    setEventEndDate(date);
                                  setStartDateOpen(false);
                                }
                              }}
                              className="rounded-md border shadow-md"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">End Date</Label>
                        <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-between px-3 py-2.5 font-normal border-2 hover:border-primary/50 focus:border-primary transition-colors"
                            >
                              <span className="text-sm">
                                {eventEndDate
                                  ? format(eventEndDate, "EEE, MMM d")
                                  : "Pick a date"}
                              </span>
                              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarUI
                              mode="single"
                              selected={eventEndDate}
                              disabled={{ before: eventStartDate }}
                              onSelect={(date) => {
                                if (date) {
                                  setEventEndDate(date);
                                  setEndDateOpen(false);
                                }
                              }}
                              className="rounded-md border shadow-md"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Time Row */}
                    {!eventAllDay && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 relative">
                          <Label className="text-sm font-medium text-foreground">Start Time</Label>
                          <div className="relative">
                            <Input
                              value={eventStartTime}
                              onChange={(e) => {
                                const value = e.target.value;
                                setEventStartTime(value);
                              }}
                              onFocus={() => setStartTimeOpen(true)}
                              onBlur={(e) => {
                                // Small delay to allow dropdown clicks to register
                                setTimeout(() => {
                                  const value = e.target.value;
                                  handleStartTimeChange(value);
                                  setStartTimeOpen(false);
                                }, 150);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const value = e.currentTarget.value;
                                  handleStartTimeChange(value);
                                  setStartTimeOpen(false);
                                  e.currentTarget.blur();
                                } else if (e.key === "Escape") {
                                  setStartTimeOpen(false);
                                  e.currentTarget.blur();
                                }
                              }}
                              placeholder="09:00 or type time"
                              className={`pr-10 border-2 transition-colors ${
                                timeErrors.start
                                  ? 'border-destructive focus:border-destructive'
                                  : 'hover:border-primary/50 focus:border-primary'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                // Scroll to the selected time when opening
                                if (!startTimeOpen) {
                                  setTimeout(() => scrollToSelectedTime(startTimeDropdownRef, eventStartTime), 0);
                                }
                                setStartTimeOpen(!startTimeOpen);
                              }}
                              className="absolute right-0 top-0 h-full px-3 hover:bg-accent/20 transition-colors rounded-r-md"
                            >
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </div>
                          {startTimeOpen && (
                            <div
                              ref={startTimeDropdownRef}
                              className="absolute z-50 top-full left-0 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-[200px] overflow-auto"
                            >
                              {allTimeOptions.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  data-time-value={option.value}
                                  className={`w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none transition-colors ${
                                    option.value === eventStartTime ? 'bg-accent text-accent-foreground font-medium' : ''
                                  }`}
                                  onClick={() => {
                                    handleStartTimeChange(option.value);
                                    setStartTimeOpen(false);
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          )}
                          {timeErrors.start && (
                            <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                              <span className="inline-block w-3 h-3 rounded-full bg-destructive/20 flex items-center justify-center">
                                <span className="text-[8px] text-destructive font-bold">!</span>
                              </span>
                              {timeErrors.start}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2 relative">
                          <Label className="text-sm font-medium text-foreground">End Time</Label>
                          <div className="relative">
                            <Input
                              value={eventEndTime}
                              onChange={(e) => {
                                const value = e.target.value;
                                setEventEndTime(value);
                              }}
                              onFocus={() => setEndTimeOpen(true)}
                              onBlur={(e) => {
                                // Small delay to allow dropdown clicks to register
                                setTimeout(() => {
                                  const value = e.target.value;
                                  handleEndTimeChange(value);
                                  setEndTimeOpen(false);
                                }, 150);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const value = e.currentTarget.value;
                                  handleEndTimeChange(value);
                                  setEndTimeOpen(false);
                                  e.currentTarget.blur();
                                } else if (e.key === "Escape") {
                                  setEndTimeOpen(false);
                                  e.currentTarget.blur();
                                }
                              }}
                              placeholder="10:00 or type time"
                              className={`pr-10 border-2 transition-colors ${
                                timeErrors.end
                                  ? 'border-destructive focus:border-destructive'
                                  : 'hover:border-primary/50 focus:border-primary'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                // Scroll to the selected time when opening
                                if (!endTimeOpen) {
                                  setTimeout(() => scrollToSelectedTime(endTimeDropdownRef, eventEndTime), 0);
                                }
                                setEndTimeOpen(!endTimeOpen);
                              }}
                              className="absolute right-0 top-0 h-full px-3 hover:bg-accent/20 transition-colors rounded-r-md"
                            >
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </div>
                          {endTimeOpen && (
                            <div
                              ref={endTimeDropdownRef}
                              className="absolute z-50 top-full left-0 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-[200px] overflow-auto"
                            >
                              {allTimeOptions
                                .filter((option) => {
                                  // Only show times after the start time
                                  const startMinutes = timeToMinutes(eventStartTime);
                                  const optionMinutes = timeToMinutes(option.value);
                                  return optionMinutes > startMinutes;
                                })
                                .map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    data-time-value={option.value}
                                    className={`w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none transition-colors ${
                                      option.value === eventEndTime ? 'bg-accent text-accent-foreground font-medium' : ''
                                    }`}
                                    onClick={() => {
                                      handleEndTimeChange(option.value);
                                      setEndTimeOpen(false);
                                    }}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                            </div>
                          )}
                          {timeErrors.end && (
                            <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                              <span className="inline-block w-3 h-3 rounded-full bg-destructive/20 flex items-center justify-center">
                                <span className="text-[8px] text-destructive font-bold">!</span>
                              </span>
                              {timeErrors.end}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* All Day Toggle - Simple and intuitive */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="all-day"
                          checked={eventAllDay}
                          onCheckedChange={(checked) => {
                            setEventAllDay(checked === true);
                            // Clear time errors when switching to all-day
                            if (checked) {
                              setTimeErrors({});
                            }
                          }}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <Label htmlFor="all-day" className="text-sm font-medium cursor-pointer">
                          All day event
                        </Label>
                      </div>
                      {eventAllDay && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                          No specific times
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Location */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="event-location"
                      className="flex items-center gap-2 text-sm font-medium"
                    >
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      Location <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="event-location"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      placeholder="Where is this happening?"
                      className="border-2 hover:border-primary/50 focus:border-primary transition-colors"
                    />
                  </div>

                  {/* Email Notifications */}
                  <div className="space-y-2">
                    <div className="border rounded-lg overflow-hidden transition-all duration-200 hover:shadow-sm bg-gradient-to-br from-card/50 to-card/30">
                      <button
                        type="button"
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors duration-150"
                      >
                        <div className="flex items-center gap-2">
                          <Bell className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-foreground">
                            Email Notifications
                          </span>
                          {eventNotifications.length > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                              {eventNotifications.length}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {notificationsLoading && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                          {showNotifications ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                          )}
                        </div>
                      </button>

                      <div
                        className={`transition-all duration-300 ease-in-out overflow-hidden ${
                          showNotifications
                            ? "max-h-96 opacity-100 border-t border-border/50" // [shadcn.io](https://www.shadcn.io/components/interactive/animated-modal) - Contains information about additional CSS classes used in internal components for things like content areas and footer.
                            : "max-h-0 opacity-0"
                        }`}
                      >
                        <div className="p-4 pt-3">
                          <NotificationManager
                            eventId={selectedEvent?.id}
                            notifications={eventNotifications}
                            onChange={handleNotificationChange}
                            loading={notificationsLoading}
                            defaultReminder={localSettings?.defaultReminder}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="border-t border-border bg-gradient-to-r from-background/80 to-muted/20 px-6 py-5 flex items-center justify-between backdrop-blur-sm">
              {eventViewMode === 'view' ? (
                /* VIEW MODE BUTTONS */
                <>
                  <div></div> {/* Spacer */}
                  <div className="flex items-center gap-3">
                    {selectedEvent?.id && !selectedEvent.isSynced && (
                      <Button
                        onClick={() => setEventViewMode('edit')}
                        className="bg-primary hover:bg-primary/90 px-6 shadow-sm transition-all duration-200"
                      >
                        <Edit3 className="h-4 w-4 mr-2" />
                        Edit Event
                      </Button>
                    )}
                    {selectedEvent?.isSynced && (
                      <div className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-md">
                        <span className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          This event is synced from an external calendar and cannot be edited
                        </span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* EDIT MODE BUTTONS */
                <>
                  {selectedEvent?.id && !selectedEvent.isSynced && (
                    <Button
                      variant="outline"
                      onClick={handleEventDelete}
                      disabled={eventSaving}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 transition-all duration-200"
                    >
                      {eventSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Delete Event
                    </Button>
                  )}
                  <div className="flex gap-3 ml-auto">
                    {selectedEvent?.id ? (
                      <Button
                        variant="outline"
                        onClick={() => setEventViewMode('view')}
                        disabled={eventSaving}
                        className="hover:bg-muted/50 transition-all duration-200"
                      >
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => goBack("events")}
                        disabled={eventSaving}
                        className="hover:bg-muted/50 transition-all duration-200"
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      onClick={handleEventSave}
                      disabled={eventSaving || !eventCalendarId || !eventTitle.trim()}
                      className="bg-primary hover:bg-primary/90 px-6 shadow-sm transition-all duration-200"
                    >
                      {eventSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          {selectedEvent?.id ? 'Updating...' : 'Creating...'}
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          {selectedEvent?.id ? 'Update Event' : 'Create Event'}
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  // Other views fallback
  return (
    <>
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <TransitionContainer direction={transitionDirection}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => goBack("main")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        </div>
        <CommandList>
          <CommandGroup heading="Status">
            <CommandItem disabled className="px-4 py-3 opacity-60">
              <Settings className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">
                This section is coming soon
              </span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </TransitionContainer>
    </CommandDialog>

    </>
  );
}