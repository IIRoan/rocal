"use client";

import { useState, useEffect } from "react";
import { useSettings } from "@/hooks/use-settings";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
import { format, isBefore } from "date-fns";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import type { UserSettings, UpdateSettingsRequest } from "@/lib/types/calendar";
import { PasskeySettings } from "./passkey-settings";
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
  | "events"
  | "event-editor";

export function CommandPalette({
  open,
  onOpenChange,
  eventToEdit,
  onEventSaved,
}: CommandPaletteProps) {
  const calendarData = useSharedCalendarData();
  const { calendars } = calendarData;
  const { settings, loading, updateSettings, resetSettings } = useSettings();

  const [currentView, setCurrentView] = useState<PaletteView>("main");
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

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!open) {
      setCurrentView("main");
      setShowResetConfirm(false);
      // Reset event editor state when dialog closes
      setSelectedEvent(null);
    }
  }, [open]);

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
      setCurrentView("event-editor");
    }
  }, [eventToEdit, open, calendars]);

  useEffect(() => {
    setShowResetConfirm(false);
    setTimezoneSearch("");
  }, [currentView]);

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
    {
      id: "events",
      label: "Events",
      icon: CalendarIcon,
      description: "Create and manage events",
    },
  ];

  if (loading || !localSettings) {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </CommandDialog>
    );
  }

  const workingDaysList = JSON.parse(localSettings.workingDays) as number[];

  // Helper functions for event editing
  const formatTimeForInput = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = Math.floor(date.getMinutes() / 15) * 15;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
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
    console.log("Event form reset for new event creation");
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
      reminder: eventReminder,
    };

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
          reminder: eventData.reminder ?? undefined,
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
          reminder: eventData.reminder ?? undefined,
        });
        console.log("Event created successfully:", newEvent.id);
        toast.success(`Event "${eventTitle}" created`);
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

  if (currentView === "main") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        </div>
        <div className="bg-muted/30 border-b border-border focus-within:ring-0">
          <CommandInput
            placeholder="Search settings..."
            className="border-none bg-transparent focus:ring-0 focus:outline-none"
          />
        </div>
        <CommandList>
          <CommandGroup heading="Categories">
            {navigationItems.map((item) => (
              <CommandItem
                key={item.id}
                onSelect={() => setCurrentView(item.id as PaletteView)}
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
      </CommandDialog>
    );
  }

  if (currentView === "appearance") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setCurrentView("main")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
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
              <Switch checked={localSettings.compactView} className="ml-auto" />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    );
  }

  if (currentView === "notifications") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setCurrentView("main")}
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
      </CommandDialog>
    );
  }

  if (currentView === "time-region") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setCurrentView("main")}
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
              onSelect={() => setCurrentView("timezone")}
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
      </CommandDialog>
    );
  }

  if (currentView === "timezone") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setCurrentView("time-region")}
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
                  tz.value.toLowerCase().includes(timezoneSearch.toLowerCase())
              )
                .slice(0, 20)
                .map((tz) => (
                  <CommandItem
                    key={tz.value}
                    onSelect={() => {
                      updateSetting("timezone", tz.value);
                      setTimezoneSearch("");
                      setCurrentView("time-region");
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
                      setCurrentView("time-region");
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
      </CommandDialog>
    );
  }

  if (currentView === "calendar-defaults") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setCurrentView("main")}
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
      </CommandDialog>
    );
  }

  if (currentView === "account") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setCurrentView("main")}
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
                This will reset all your settings to their default values. This
                action cannot be undone.
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
      </CommandDialog>
    );
  }

  if (currentView === "security") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setCurrentView("main")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">Security</h2>
        </div>
        <CommandList>
          <CommandGroup heading="Authentication">
            <CommandItem
              onSelect={() => setCurrentView("passkeys")}
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
      </CommandDialog>
    );
  }

  if (currentView === "passkeys") {
    return (
      <PasskeySettings
        open={open}
        onOpenChange={onOpenChange}
        onBack={() => setCurrentView("security")}
      />
    );
  }

  if (currentView === "events") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setCurrentView("main")}
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
                setCurrentView("event-editor");
              }}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Plus className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Create New Event</span>
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    );
  }

  if (currentView === "event-editor") {
    const timeOptions = [];
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
        timeOptions.push({ value, label });
      }
    }

    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setCurrentView("events")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">
            {selectedEvent?.id ? "Edit Event" : "Create Event"}
          </h2>
        </div>

        <div className="max-h-[80vh] overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="event-title" className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Title
              </Label>
              <Input
                id="event-title"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="Enter event title"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="event-description">Description</Label>
              <Textarea
                id="event-description"
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                rows={3}
                placeholder="Enter event description"
              />
            </div>

            {/* Calendar Selection */}
            <div className="space-y-2">
              <Label htmlFor="event-calendar">Calendar</Label>
              <Select
                value={eventCalendarId}
                onValueChange={setEventCalendarId}
              >
                <SelectTrigger id="event-calendar">
                  <SelectValue placeholder="Select a calendar" />
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((calendar) => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="size-3 rounded-full"
                          style={{ backgroundColor: calendar.color }}
                        />
                        {calendar.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              {/* Start Date */}
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between px-3 font-normal"
                    >
                      <span>
                        {eventStartDate
                          ? format(eventStartDate, "PPP")
                          : "Pick a date"}
                      </span>
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
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
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Start Time */}
              {!eventAllDay && (
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Select
                    value={eventStartTime}
                    onValueChange={setEventStartTime}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {timeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* End Date */}
              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between px-3 font-normal"
                    >
                      <span>
                        {eventEndDate
                          ? format(eventEndDate, "PPP")
                          : "Pick a date"}
                      </span>
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
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
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Time */}
              {!eventAllDay && (
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Select value={eventEndTime} onValueChange={setEventEndTime}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {timeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* All Day Toggle */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="all-day"
                checked={eventAllDay}
                onCheckedChange={(checked) => setEventAllDay(checked === true)}
              />
              <Label htmlFor="all-day">All day event</Label>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label
                htmlFor="event-location"
                className="flex items-center gap-2"
              >
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Location
              </Label>
              <Input
                id="event-location"
                value={eventLocation}
                onChange={(e) => setEventLocation(e.target.value)}
                placeholder="Enter event location"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t border-border bg-card/20 px-6 py-4 flex items-center justify-between">
            {selectedEvent?.id && (
              <Button
                variant="outline"
                onClick={handleEventDelete}
                disabled={eventSaving}
                className="text-destructive hover:text-destructive"
              >
                {eventSaving ? (
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
                onClick={() => setCurrentView("events")}
                disabled={eventSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleEventSave}
                disabled={eventSaving || !eventCalendarId}
              >
                {eventSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </CommandDialog>
    );
  }

  // Other views fallback
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => setCurrentView("main")}
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
            <span className="text-foreground">This section is coming soon</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
