"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSettings } from "@/hooks/use-settings";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
import { format, isBefore } from "date-fns";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import type { UserSettings, UpdateSettingsRequest } from "@/lib/types/calendar";
import { PasskeySettings } from "./passkey-settings";
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

const TIMEZONE_GROUPS = {
  Popular: [
    { value: "UTC", label: "UTC (Coordinated Universal Time)" },
    { value: "America/New_York", label: "Eastern Time (New York)" },
    { value: "America/Chicago", label: "Central Time (Chicago)" },
    { value: "America/Denver", label: "Mountain Time (Denver)" },
    { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
    { value: "Europe/London", label: "London" },
    { value: "Asia/Tokyo", label: "Tokyo" },
  ],
  Americas: [
    { value: "America/Anchorage", label: "Anchorage" },
    { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
    { value: "America/Bogota", label: "Bogotá" },
    { value: "America/Caracas", label: "Caracas" },
    { value: "America/Guatemala", label: "Guatemala City" },
    { value: "America/Havana", label: "Havana" },
    { value: "America/Lima", label: "Lima" },
    { value: "America/Mexico_City", label: "Mexico City" },
    { value: "America/Montevideo", label: "Montevideo" },
    { value: "America/Santiago", label: "Santiago" },
    { value: "America/Sao_Paulo", label: "São Paulo" },
    { value: "America/Toronto", label: "Toronto" },
    { value: "America/Vancouver", label: "Vancouver" },
  ],
  "Europe & Africa": [
    { value: "Europe/Amsterdam", label: "Amsterdam" },
    { value: "Europe/Berlin", label: "Berlin" },
    { value: "Europe/Brussels", label: "Brussels" },
    { value: "Europe/Dublin", label: "Dublin" },
    { value: "Europe/Helsinki", label: "Helsinki" },
    { value: "Europe/Istanbul", label: "Istanbul" },
    { value: "Europe/Madrid", label: "Madrid" },
    { value: "Europe/Moscow", label: "Moscow" },
    { value: "Europe/Paris", label: "Paris" },
    { value: "Europe/Rome", label: "Rome" },
    { value: "Europe/Stockholm", label: "Stockholm" },
    { value: "Europe/Vienna", label: "Vienna" },
    { value: "Europe/Zurich", label: "Zurich" },
    { value: "Africa/Cairo", label: "Cairo" },
    { value: "Africa/Johannesburg", label: "Johannesburg" },
    { value: "Africa/Lagos", label: "Lagos" },
  ],
  "Asia & Pacific": [
    { value: "Asia/Bangkok", label: "Bangkok" },
    { value: "Asia/Beijing", label: "Beijing" },
    { value: "Asia/Calcutta", label: "Mumbai" },
    { value: "Asia/Dubai", label: "Dubai" },
    { value: "Asia/Hong_Kong", label: "Hong Kong" },
    { value: "Asia/Jakarta", label: "Jakarta" },
    { value: "Asia/Karachi", label: "Karachi" },
    { value: "Asia/Seoul", label: "Seoul" },
    { value: "Asia/Shanghai", label: "Shanghai" },
    { value: "Asia/Singapore", label: "Singapore" },
    { value: "Asia/Taipei", label: "Taipei" },
    { value: "Asia/Tehran", label: "Tehran" },
    { value: "Australia/Adelaide", label: "Adelaide" },
    { value: "Australia/Brisbane", label: "Brisbane" },
    { value: "Australia/Melbourne", label: "Melbourne" },
    { value: "Australia/Perth", label: "Perth" },
    { value: "Australia/Sydney", label: "Sydney" },
    { value: "Pacific/Auckland", label: "Auckland" },
    { value: "Pacific/Fiji", label: "Fiji" },
    { value: "Pacific/Honolulu", label: "Honolulu" },
  ],
};

const ALL_TIMEZONES = Object.values(TIMEZONE_GROUPS).flat();

const WORKING_DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventToEdit?: CalendarEvent | null;
  onEventSaved?: () => void;
  initialView?: string;
}

type PaletteView =
  | "main"
  | "appearance"
  | "time-region"
  | "timezone"
  | "notifications"
  | "calendar-defaults"
  | "account"
  | "security"
  | "passkeys"
  | "calendars"
  | "calendar-create"
  | "calendar-edit"
  | "events"
  | "event-editor";

// Transition wrapper for slide-fade
function TransitionContainer({
  direction,
  children,
}: {
  direction: "forward" | "back";
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden">
      <div
        className={[
          "animate-slide-fade",
          direction === "forward" ? "enter-left" : "enter-right",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
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
      console.log("Setting up event editor:", {
        eventId: eventToEdit.id,
        isNewEvent,
        title: eventToEdit.title,
      });

      setSelectedEvent(eventToEdit);
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
        loadEventNotifications(eventToEdit.id);
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

  const navigationItems = [
    {
      id: "events",
      label: "Events",
      icon: CalendarIcon,
      description: "Create and manage events",
    },
    {
      id: "calendars",
      label: "Calendar Management",
      icon: Calendar,
      description: "Create, edit, and delete calendars",
    },
    {
      id: "appearance",
      label: "Appearance",
      icon: Palette,
      description: "Theme and layout settings",
    },
    {
      id: "time-region",
      label: "Time & Region",
      icon: Globe,
      description: "Timezone and format preferences",
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      description: "Notification preferences",
    },
    {
      id: "calendar-defaults",
      label: "Calendar Defaults",
      icon: Calendar,
      description: "Default event settings",
    },
    {
      id: "account",
      label: "Account",
      icon: User,
      description: "Account information",
    },
    {
      id: "security",
      label: "Security",
      icon: Shield,
      description: "Security settings",
    },
  ];

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

  // Helper functions for event editing
  const formatTimeForInput = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes();
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  };

  // Google-style time validation - simple and predictable
  interface TimeValidationResult {
    isValid: boolean;
    time?: string;
    error?: string;
  }

  const validateTime = (timeString: string): TimeValidationResult => {
    if (!timeString || timeString.trim() === '') {
      return { isValid: false, error: 'Time is required' };
    }

    // Clean the input - remove any non-digit or colon characters
    const cleaned = timeString.replace(/[^\d:]/g, '');
    
    // Handle various input formats
    let formattedTime = cleaned;
    
    // Convert common formats to HH:MM
    if (/^\d{1,2}$/.test(cleaned)) {
      // Just hours: "9" -> "09:00"
      const hours = parseInt(cleaned, 10);
      if (hours >= 0 && hours <= 23) {
        formattedTime = `${hours.toString().padStart(2, '0')}:00`;
      } else {
        return { isValid: false, error: 'Hours must be between 0-23' };
      }
    } else if (/^\d{3,4}$/.test(cleaned)) {
      // HHMM format: "930" -> "09:30" or "1430" -> "14:30"
      let hours, minutes;
      if (cleaned.length === 3) {
        hours = parseInt(cleaned.slice(0, 1), 10);
        minutes = parseInt(cleaned.slice(1), 10);
      } else {
        hours = parseInt(cleaned.slice(0, 2), 10);
        minutes = parseInt(cleaned.slice(2), 10);
      }
      
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      } else {
        return { isValid: false, error: 'Invalid time format' };
      }
    }
    
    // Validate HH:MM format
    const timeRegex = /^(\d{1,2}):(\d{1,2})$/;
    const match = formattedTime.match(timeRegex);
    
    if (!match) {
      return { isValid: false, error: 'Use HH:MM format (e.g. 09:30)' };
    }
    
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    
    if (hours < 0 || hours > 23) {
      return { isValid: false, error: 'Hours must be between 0-23' };
    }
    
    if (minutes < 0 || minutes > 59) {
      return { isValid: false, error: 'Minutes must be between 0-59' };
    }
    
    return {
      isValid: true,
      time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    };
  };

  const timeToMinutes = (timeString: string): number => {
    const [hoursStr, minutesStr] = timeString.split(':');
    const hours = parseInt(hoursStr || '0', 10);
    const minutes = parseInt(minutesStr || '0', 10);
    return hours * 60 + minutes;
  };

  const minutesToTime = (totalMinutes: number): string => {
    const normalizedMinutes = Math.max(0, totalMinutes % (24 * 60));
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };


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

  // Scroll dropdown to selected time
  const scrollToSelectedTime = (dropdownRef: React.RefObject<HTMLDivElement | null>, selectedTime: string) => {
    if (!dropdownRef.current) return;
    
    // Try to find exact match first
    const selectedButton = dropdownRef.current.querySelector(`[data-time-value="${selectedTime}"]`) as HTMLElement;
    if (selectedButton) {
      selectedButton.scrollIntoView({
        block: 'center',
        behavior: 'instant'
      });
      return;
    }
    
    // If no exact match, find the closest time option
    const selectedMinutes = timeToMinutes(selectedTime);
    
    // Find the closest time option by rounding to nearest 15 minutes
    const roundedMinutes = Math.floor(selectedMinutes / 15) * 15;
    const roundedTime = minutesToTime(roundedMinutes);
    
    const closestButton = dropdownRef.current.querySelector(`[data-time-value="${roundedTime}"]`) as HTMLElement;
    if (closestButton) {
      closestButton.scrollIntoView({
        block: 'center',
        behavior: 'instant'
      });
    }
  };

  const resetEventForm = () => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setHours(startDate.getHours() + 1);

    setSelectedEvent(null);
    setEventTitle("");
    setEventDescription("");
    setEventStartDate(startDate);
    setEventEndDate(endDate);
    setEventStartTime("09:00");
    setEventEndTime("10:00");
    setEventAllDay(false);
    setEventLocation("");
    setEventCalendarId(calendars?.[0]?.id || "");
    setEventReminder(null);
    // Add default 15-minute email notification for new events
    setEventNotifications([
      {
        notificationType: "email",
        minutesBefore: 15,
        isEnabled: true,
      },
    ]);
    console.log("Event form reset for new event creation");
  };

  // Load notifications for an existing event
  const loadEventNotifications = async (eventId: string) => {
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

  const validateEventForm = () => {
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

  const handleEventSave = async () => {
    const validationError = validateEventForm();
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
        // Update existing event
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
        resetEventForm();
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
        resetEventForm();
      }, 100);
    } catch (error: any) {
      console.error("Failed to delete event:", error);
      toast.error("Failed to delete event");
    } finally {
      setEventSaving(false);
    }
  };

  // Calendar management functions
  const validateCalendarForm = () => {
    const errors: { name?: string; color?: string } = {};

    // Check if name is empty
    if (!calendarName.trim()) {
      errors.name = "Calendar name is required";
    }

    // Check name length
    if (calendarName.trim().length > 100) {
      errors.name = "Calendar name cannot exceed 100 characters";
    }

    // Check for duplicate names (case-insensitive)
    const existingNames = calendars.map((cal) => cal.name.toLowerCase());
    if (existingNames.includes(calendarName.trim().toLowerCase())) {
      errors.name = "A calendar with this name already exists";
    }

    // Validate color format (basic hex validation)
    const isHexColor = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(calendarColor);
    if (!isHexColor) {
      errors.color = "Please select a valid color";
    }

    return errors;
  };

  const handleCalendarCreate = async () => {
    setCalendarValidationErrors({});

    const errors = validateCalendarForm();
    if (Object.keys(errors).length > 0) {
      setCalendarValidationErrors(errors);
      return;
    }

    setCalendarSaving(true);
    try {
      await calendarData.createCalendar({
        name: calendarName.trim(),
        color: calendarColor,
        isDefault: false,
      });

      toast.success(`Calendar "${calendarName}" created`);
      setCalendarName("");
      setCalendarColor("#3b82f6");
      goBack("calendars");
    } catch (error: any) {
      console.error("Failed to create calendar:", error);
      if (error.message && error.message.includes("already exists")) {
        setCalendarValidationErrors({
          name: "A calendar with this name already exists",
        });
      } else {
        toast.error("Failed to create calendar");
      }
    } finally {
      setCalendarSaving(false);
    }
  };

  const handleCalendarUpdate = async () => {
    if (!editingCalendar) return;

    setCalendarValidationErrors({});

    // Validate only if name changed
    if (calendarName !== editingCalendar.name) {
      const existingNames = calendars
        .filter((cal) => cal.id !== editingCalendar.id)
        .map((cal) => cal.name.toLowerCase());

      if (!calendarName.trim()) {
        setCalendarValidationErrors({ name: "Calendar name is required" });
        return;
      }

      if (calendarName.trim().length > 100) {
        setCalendarValidationErrors({
          name: "Calendar name cannot exceed 100 characters",
        });
        return;
      }

      if (existingNames.includes(calendarName.trim().toLowerCase())) {
        setCalendarValidationErrors({
          name: "A calendar with this name already exists",
        });
        return;
      }
    }

    setCalendarSaving(true);
    try {
      await calendarData.updateCalendar(editingCalendar.id, {
        name: calendarName.trim(),
        color: calendarColor,
      });

      toast.success(`Calendar "${calendarName}" updated`);
      setEditingCalendar(null);
      goBack("calendars");
    } catch (error: any) {
      console.error("Failed to update calendar:", error);
      if (error.message && error.message.includes("already exists")) {
        setCalendarValidationErrors({
          name: "A calendar with this name already exists",
        });
      } else {
        toast.error("Failed to update calendar");
      }
    } finally {
      setCalendarSaving(false);
    }
  };

  const handleCalendarDelete = async (calendar: any) => {
    setCalendarSaving(true);
    try {
      await calendarData.deleteCalendar(calendar.id);
      toast.success(`Calendar "${calendar.name}" deleted`);
      goBack("calendars");
    } catch (error: any) {
      console.error("Failed to delete calendar:", error);
      toast.error("Failed to delete calendar");
    } finally {
      setCalendarSaving(false);
    }
  };

  const resetCalendarForm = () => {
    setCalendarName("");
    setCalendarColor("#3b82f6");
    setEditingCalendar(null);
    setCalendarValidationErrors({});
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
              {navigationItems.map((item) => (
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
              Appearance
            </h2>
          </div>
          <CommandList>
            <CommandGroup heading="Theme">
              <CommandItem
                onSelect={() => updateSetting("theme", "light")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Sun className="mr-3 h-4 w-4 text-amber-500" />
                <span className="text-foreground">Light Theme</span>
                {localSettings.theme === "light" && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
              <CommandItem
                onSelect={() => updateSetting("theme", "dark")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Moon className="mr-3 h-4 w-4 text-slate-400" />
                <span className="text-foreground">Dark Theme</span>
                {localSettings.theme === "dark" && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
              <CommandItem
                onSelect={() => updateSetting("theme", "system")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Monitor className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">System Theme</span>
                {localSettings.theme === "system" && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Default View">
              <CommandItem
                onSelect={() => updateSetting("defaultView", "month")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Layout className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Month View</span>
                {localSettings.defaultView === "month" && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
              <CommandItem
                onSelect={() => updateSetting("defaultView", "week")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Layout className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Week View</span>
                {localSettings.defaultView === "week" && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
              <CommandItem
                onSelect={() => updateSetting("defaultView", "day")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Layout className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Day View</span>
                {localSettings.defaultView === "day" && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
              <CommandItem
                onSelect={() => updateSetting("defaultView", "agenda")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Layout className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Agenda View</span>
                {localSettings.defaultView === "agenda" && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Display Options">
              <CommandItem
                onSelect={() =>
                  updateSetting("compactView", !localSettings.compactView)
                }
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Eye className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Compact View</span>
                <Switch
                  checked={localSettings.compactView}
                  className="ml-auto"
                />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  if (currentView === "notifications") {
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
              Notifications
            </h2>
          </div>
          <CommandList>
            <CommandGroup heading="Notification Types">
              <CommandItem
                onSelect={() =>
                  updateSetting(
                    "emailNotifications",
                    !localSettings.emailNotifications
                  )
                }
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Mail className="mr-3 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-foreground">Email Notifications</span>
                  <span className="text-xs text-muted-foreground">
                    Receive event reminders via email
                  </span>
                </div>
                <Switch
                  checked={localSettings.emailNotifications}
                  className="ml-auto"
                />
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Default Reminder">
              <div className="px-4 py-3">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <Label className="text-sm font-medium text-foreground">
                        Default Reminder Time (minutes)
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        Leave empty for no default reminder
                      </span>
                    </div>
                  </div>
                  <Input
                    type="number"
                    value={localSettings.defaultReminder || ""}
                    onChange={(e) =>
                      updateSetting(
                        "defaultReminder",
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    placeholder="No default reminder"
                    min={1}
                    max={43200}
                    className="w-full"
                  />
                </div>
              </div>
            </CommandGroup>
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  if (currentView === "time-region") {
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
              Time & Region
            </h2>
          </div>
          <CommandList>
            <CommandGroup heading="Timezone">
              <CommandItem
                onSelect={() => goForward("timezone")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Globe className="mr-3 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-foreground">Timezone</span>
                  <span className="text-xs text-muted-foreground">
                    {ALL_TIMEZONES.find(
                      (tz) => tz.value === localSettings.timezone
                    )?.label || localSettings.timezone}
                  </span>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Time Format">
              <CommandItem
                onSelect={() => updateSetting("timeFormat", "12h")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Clock className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">12 Hour (1:00 PM)</span>
                {localSettings.timeFormat === "12h" && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
              <CommandItem
                onSelect={() => updateSetting("timeFormat", "24h")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Clock className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">24 Hour (13:00)</span>
                {localSettings.timeFormat === "24h" && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  if (currentView === "timezone") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
            <button
              onClick={() => goBack("time-region")}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <h2 className="text-lg font-semibold text-foreground">Timezone</h2>
          </div>
          <div className="bg-muted/30 border-b border-border focus-within:ring-0">
            <input
              type="text"
              placeholder="Search timezones..."
              value={timezoneSearch}
              onChange={(e) => setTimezoneSearch(e.target.value)}
              className="w-full px-4 py-3 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <CommandList>
            {timezoneSearch ? (
              <CommandGroup heading="Search Results">
                {ALL_TIMEZONES.filter(
                  (tz) =>
                    tz.label
                      .toLowerCase()
                      .includes(timezoneSearch.toLowerCase()) ||
                    tz.value
                      .toLowerCase()
                      .includes(timezoneSearch.toLowerCase())
                )
                  .slice(0, 20)
                  .map((tz) => (
                    <CommandItem
                      key={tz.value}
                      onSelect={() => {
                        updateSetting("timezone", tz.value);
                        setTimezoneSearch("");
                        goBack("time-region");
                      }}
                      className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
                    >
                      <Globe className="mr-3 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-foreground">{tz.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {tz.value}
                        </span>
                      </div>
                      {localSettings.timezone === tz.value && (
                        <Check className="ml-auto h-4 w-4 text-primary" />
                      )}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ) : (
              Object.entries(TIMEZONE_GROUPS).map(([groupName, timezones]) => (
                <CommandGroup key={groupName} heading={groupName}>
                  {timezones.map((tz) => (
                    <CommandItem
                      key={tz.value}
                      onSelect={() => {
                        updateSetting("timezone", tz.value);
                        goBack("time-region");
                      }}
                      className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
                    >
                      <Globe className="mr-3 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-foreground">{tz.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {tz.value}
                        </span>
                      </div>
                      {localSettings.timezone === tz.value && (
                        <Check className="ml-auto h-4 w-4 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  if (currentView === "calendar-defaults") {
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
              Calendar Defaults
            </h2>
          </div>
          <CommandList>
            <CommandGroup heading="Week Settings">
              {WORKING_DAYS.map((day) => (
                <CommandItem
                  key={day.value}
                  onSelect={() => updateSetting("weekStartDay", day.value)}
                  className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
                >
                  <Calendar className="mr-3 h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">
                    Week starts on {day.label}
                  </span>
                  {localSettings.weekStartDay === day.value && (
                    <Check className="ml-auto h-4 w-4 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="Working Days">
              {WORKING_DAYS.map((day) => (
                <CommandItem
                  key={day.value}
                  onSelect={() => {
                    const currentWorkingDays = [...workingDaysList];
                    const dayIndex = currentWorkingDays.indexOf(day.value);
                    if (dayIndex > -1) {
                      currentWorkingDays.splice(dayIndex, 1);
                    } else {
                      currentWorkingDays.push(day.value);
                    }
                    updateSetting(
                      "workingDays",
                      JSON.stringify(currentWorkingDays.sort())
                    );
                  }}
                  className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
                >
                  <Calendar className="mr-3 h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">{day.label}</span>
                  {workingDaysList.includes(day.value) && (
                    <Check className="ml-auto h-4 w-4 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  if (currentView === "account") {
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
            <h2 className="text-lg font-semibold text-foreground">Account</h2>
          </div>
          <CommandList>
            {!showResetConfirm ? (
              <CommandGroup heading="Danger Zone">
                <CommandItem
                  onSelect={() => setShowResetConfirm(true)}
                  disabled={saving}
                  className="px-4 py-3 hover:bg-destructive/10 data-[selected=true]:bg-destructive/15 text-destructive"
                >
                  <RotateCcw className="mr-3 h-4 w-4" />
                  <span>Reset to Defaults</span>
                </CommandItem>
              </CommandGroup>
            ) : (
              <CommandGroup heading="Confirm Reset">
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  This will reset all your settings to their default values.
                  This action cannot be undone.
                </div>
                <CommandItem
                  onSelect={() => {
                    handleReset();
                    setShowResetConfirm(false);
                  }}
                  disabled={saving}
                  className="px-4 py-3 hover:bg-destructive/20 data-[selected=true]:bg-destructive/25 text-destructive"
                >
                  <Check className="mr-3 h-4 w-4" />
                  <span>Yes, Reset Everything</span>
                </CommandItem>
                <CommandItem
                  onSelect={() => setShowResetConfirm(false)}
                  className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
                >
                  <X className="mr-3 h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">Cancel</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  if (currentView === "security") {
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
            <h2 className="text-lg font-semibold text-foreground">Security</h2>
          </div>
          <CommandList>
            <CommandGroup heading="Authentication">
              <CommandItem
                onSelect={() => goForward("passkeys")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Key className="mr-3 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-foreground">Passkeys</span>
                  <span className="text-xs text-muted-foreground">
                    Manage passwordless authentication
                  </span>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
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

  if (currentView === "calendars") {
    const PRESET_COLORS = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#8b5cf6",
      "#f43f5e",
      "#ef4444",
      "#06b6d4",
      "#84cc16",
      "#f97316",
      "#6366f1",
      "#ec4899",
      "#14b8a6",
    ];

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
                  resetCalendarForm();
                  goForward("calendar-create");
                }}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Plus className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">Create New Calendar</span>
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
    const PRESET_COLORS = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#8b5cf6",
      "#f43f5e",
      "#ef4444",
      "#06b6d4",
      "#84cc16",
      "#f97316",
      "#6366f1",
      "#ec4899",
      "#14b8a6",
    ];

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
                onClick={handleCalendarCreate}
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
    const PRESET_COLORS = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#8b5cf6",
      "#f43f5e",
      "#ef4444",
      "#06b6d4",
      "#84cc16",
      "#f97316",
      "#6366f1",
      "#ec4899",
      "#14b8a6",
    ];

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
                  onClick={() => handleCalendarDelete(editingCalendar)}
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
                  onClick={handleCalendarUpdate}
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
                  resetEventForm();
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

  // Generate all time options for the dropdown (full day)
  const generateAllTimeOptions = () => {
    const options = [];
    
    for (let hour = 0; hour <= 23; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const formattedHour = hour.toString().padStart(2, "0");
        const formattedMinute = minute.toString().padStart(2, "0");
        const value = `${formattedHour}:${formattedMinute}`;
        const date = new Date(2000, 0, 1, hour, minute);
        const label =
          localSettings?.timeFormat === "24h"
            ? `${formattedHour}:${formattedMinute}`
            : format(date, "h:mm a");
        options.push({ value, label });
      }
    }
    return options;
  };
  
  // Generate all time options once
  const allTimeOptions = generateAllTimeOptions();
  
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
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {selectedEvent?.id ? "Edit Event" : "Create New Event"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedEvent?.id ? "Make changes to your event" : "Add an event to your calendar"}
              </p>
            </div>
          </div>

          <div className="max-h-[80vh] overflow-y-auto">
            <div className="p-6 space-y-6">
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
                  autoFocus
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
                        ? "max-h-96 opacity-100 border-t border-border/50"
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
            </div>

            {/* Action Buttons */}
            <div className="border-t border-border bg-gradient-to-r from-background/80 to-muted/20 px-6 py-5 flex items-center justify-between backdrop-blur-sm">
              {selectedEvent?.id && (
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
                <Button
                  variant="outline"
                  onClick={() => goBack("events")}
                  disabled={eventSaving}
                  className="hover:bg-muted/50 transition-all duration-200"
                >
                  Cancel
                </Button>
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
            </div>
          </div>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  // Other views fallback
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
  );
}
