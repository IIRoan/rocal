"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
import { format, isBefore } from "date-fns";
import { toast } from "sonner";
import type { UserSettings, RecurrenceRule } from "@/lib/types/calendar";
import {
  TransitionContainer,
  PRESET_COLORS,
  formatTimeForInput,
  validateTime,
  timeToMinutes,
  minutesToTime,
  scrollToSelectedTime,
  generateAllTimeOptions,
  resetEventForm,
  loadEventNotifications,
  validateEventForm,
  type PaletteView,
} from "./command-palette/index";
import {
  NotificationManager,
  EventNotification,
} from "@workspace/ui/components/calendar/notification-manager";
import { calendarApiService } from "@/lib/calendar-api-service";
import { RecurringEventForm } from "./command-palette/recurring-event-form";
import { RecurringDeleteModal } from "./command-palette/recurring-delete-modal";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

interface EventEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventToEdit?: CalendarEvent | null;
  onEventSaved?: () => void;
  onBack: () => void;
  localSettings: UserSettings;
}

export function EventEditor({
  open,
  onOpenChange,
  eventToEdit,
  onEventSaved,
  onBack,
  localSettings,
}: EventEditorProps) {
  const calendarData = useSharedCalendarData();
  const { calendars } = calendarData;

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
  const startTimeDropdownRef = useRef<HTMLDivElement>(null);
  const endTimeDropdownRef = useRef<HTMLDivElement>(null);

  // Notification state
  const [eventNotifications, setEventNotifications] = useState<EventNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedEvent(null);
      setEventNotifications([]);
      setShowNotifications(false);
      setShowRecurringDeleteModal(false);
      setIsRecurring(false);
      setRecurrenceRule(null);
    }
  }, [open]);

  // Handle external event to edit
  useEffect(() => {
    if (eventToEdit && open) {
      const isNewEvent = !eventToEdit.id || eventToEdit.id === "" || eventToEdit.id === undefined;
      const isSynced = eventToEdit.isSynced || false;

      setSelectedEvent(eventToEdit);
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
      
      // Handle recurring event data
      const hasRecurrence = !!eventToEdit.recurrence;
      setIsRecurring(hasRecurrence);
      if (hasRecurrence && eventToEdit.recurrence) {
        try {
          const parsedRule = JSON.parse(eventToEdit.recurrence) as RecurrenceRule;
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
      if (!isNewEvent && eventToEdit.id) {
        loadEventNotifications(eventToEdit.id, setEventNotifications, setNotificationsLoading);
      } else {
        setEventNotifications([
          {
            notificationType: "email",
            minutesBefore: 15,
            isEnabled: true,
          },
        ]);
      }
    }
  }, [eventToEdit, open, calendars]);

  // Close time dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [startTimeOpen, endTimeOpen]);

  // Scroll to selected time when dropdowns open
  useEffect(() => {
    if (startTimeOpen) {
      setTimeout(() => scrollToSelectedTime(startTimeDropdownRef, eventStartTime), 50);
    }
  }, [startTimeOpen, eventStartTime]);

  useEffect(() => {
    if (endTimeOpen) {
      setTimeout(() => scrollToSelectedTime(endTimeDropdownRef, eventEndTime), 50);
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

        await calendarApiService.updateEventNotifications(eventId, notificationData);
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
    },
    []
  );

  // Handle start time change with validation
  const handleStartTimeChange = (newStartTime: string) => {
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
        setEventEndTime(newEndTime);
        setTimeErrors(prev => ({ ...prev, end: 'End time must be after start time' }));
      }
    } else {
      setEventEndTime(newEndTime);
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
        if (isRecurring && recurrenceRule) {
          await saveEventNotifications(savedEventId, finalNotifications);
        } else {
          await saveEventNotifications(savedEventId, finalNotifications);
        }
      }

      onEventSaved?.();

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
        setIsRecurring(false);
        setRecurrenceRule(null);
        setShowRecurringDeleteModal(false);
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
  };

  const handleEventDelete = async () => {
    if (!selectedEvent?.id) return;

    setEventSaving(true);
    try {
      await calendarData.deleteEvent(selectedEvent.id);
      toast.success(`Event "${eventTitle}" deleted`);
      onEventSaved?.();

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
        setIsRecurring(false);
        setRecurrenceRule(null);
        setShowRecurringDeleteModal(false);
      }, 100);
    } catch (error: any) {
      console.error("Failed to delete event:", error);
      toast.error("Failed to delete event");
    } finally {
      setEventSaving(false);
    }
  };

  const handleRecurringDeleteThis = async () => {
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
      const result = await calendarApiService.deleteRecurringEvent(parentEventId, 'this_only', occurrenceDate);
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
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to delete recurring event occurrence:", error);
      toast.error(`Failed to delete event occurrence: ${error.message || 'Unknown error'}`);
    } finally {
      setEventSaving(false);
    }
  };

  const handleRecurringDeleteAll = async () => {
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
      const result = await calendarApiService.deleteRecurringEvent(parentEventId, 'all');
      toast.success("Entire event series deleted");
      
      if (calendarData?.refetchEvents) {
        await calendarData.refetchEvents();
      } else {
        onEventSaved?.();
      }
      
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to delete recurring event series:", error);
      toast.error("Failed to delete event series");
    } finally {
      setEventSaving(false);
    }
  };

  // Generate all time options once
  const allTimeOptions = generateAllTimeOptions(localSettings?.timeFormat);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <TransitionContainer direction="forward">
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 border-b border-border/50 px-6 py-5 flex items-center gap-4">
          <button
            onClick={onBack}
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
              <>
                {/* VIEW MODE - Read-only display */}
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

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Description</Label>
                  <div className="p-3 bg-muted/50 rounded-md border min-h-[60px]">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {eventDescription || "No description provided"}
                    </p>
                  </div>
                </div>

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

                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: calendars.find(c => c.id === eventCalendarId)?.color || '#3b82f6' }}></div>
                    Calendar
                  </Label>
                  <div className="p-3 bg-muted/50 rounded-md border">
                    <p className="text-sm">{calendars.find(c => c.id === eventCalendarId)?.name || "Unknown Calendar"}</p>
                  </div>
                </div>

                {isRecurring && recurrenceRule && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <RotateCcw className="h-4 w-4 text-muted-foreground" />
                      Recurrence
                    </Label>
                    <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-md border border-blue-200/50 dark:border-blue-800/50">
                      <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                        {(() => {
                          const { frequency, interval, count, until, byWeekDay } = recurrenceRule;
                          let description = "";
                          
                          if (interval === 1) {
                            description = frequency.charAt(0).toUpperCase() + frequency.slice(1);
                          } else {
                            description = `Every ${interval} ${frequency === "daily" ? "days" : frequency === "weekly" ? "weeks" : frequency === "monthly" ? "months" : "years"}`;
                          }
                          
                          if (frequency === "weekly" && byWeekDay && byWeekDay.length > 0) {
                            const dayNames = byWeekDay.map(d => WEEKDAY_SHORT[d]).join(", ");
                            description += ` on ${dayNames}`;
                          }
                          
                          if (count) {
                            description += `, ${count} times`;
                          } else if (until) {
                            description += `, until ${format(new Date(until), "MMM d, yyyy")}`;
                          }
                          
                          return description;
                        })()}
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* EDIT MODE - Editable form */}
                <div className="space-y-2">
                  <Label htmlFor="event-title" className="flex items-center gap-2 text-sm font-medium">
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

                <div className="space-y-2">
                  <Label htmlFor="event-description" className="text-sm font-medium">
                    Description <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Textarea
                    id="event-description"
                    value={eventDescription}
                    onChange={(e) => setEventDescription(e.target.value)}
                    rows={2}
                    placeholder="Add more details about your event..."
                    className="border-2 hover:border-primary/50 focus:border-primary transition-colors resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-calendar" className="text-sm font-medium flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: calendars.find(c => c.id === eventCalendarId)?.color || '#3b82f6' }}></div>
                    Calendar
                  </Label>
                  <Select value={eventCalendarId} onValueChange={setEventCalendarId}>
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

                {/* Date and Time */}
                <div className="space-y-6">
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
                              {eventStartDate ? format(eventStartDate, "EEE, MMM d") : "Pick a date"}
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
                              {eventEndDate ? format(eventEndDate, "EEE, MMM d") : "Pick a date"}
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

                  {!eventAllDay && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2 relative" data-time-input="start">
                        <Label className="text-sm font-medium text-foreground">Start Time</Label>
                        <div className="relative">
                          <Input
                            value={eventStartTime}
                            onChange={(e) => setEventStartTime(e.target.value)}
                            onFocus={() => setStartTimeOpen(true)}
                            onBlur={(e) => {
                              setTimeout(() => {
                                handleStartTimeChange(e.target.value);
                                setStartTimeOpen(false);
                              }, 150);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleStartTimeChange(e.currentTarget.value);
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

                      <div className="space-y-2 relative" data-time-input="end">
                        <Label className="text-sm font-medium text-foreground">End Time</Label>
                        <div className="relative">
                          <Input
                            value={eventEndTime}
                            onChange={(e) => setEventEndTime(e.target.value)}
                            onFocus={() => setEndTimeOpen(true)}
                            onBlur={(e) => {
                              setTimeout(() => {
                                handleEndTimeChange(e.target.value);
                                setEndTimeOpen(false);
                              }, 150);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleEndTimeChange(e.currentTarget.value);
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

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="all-day"
                        checked={eventAllDay}
                        onCheckedChange={(checked) => {
                          setEventAllDay(checked === true);
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

                <div className="space-y-2">
                  <Label htmlFor="event-location" className="flex items-center gap-2 text-sm font-medium">
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

                <RecurringEventForm
                  isRecurring={isRecurring}
                  onIsRecurringChange={setIsRecurring}
                  recurrenceRule={recurrenceRule}
                  onRecurrenceRuleChange={setRecurrenceRule}
                  eventStartDate={eventStartDate}
                  eventEndDate={eventEndDate}
                />

                <div className="space-y-2">
                  <div className="border rounded-lg overflow-hidden transition-all duration-200 hover:shadow-sm bg-gradient-to-br from-card/50 to-card/30">
                    <button
                      type="button"
                      onClick={() => setShowNotifications(!showNotifications)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors duration-150"
                    >
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">Email Notifications</span>
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
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="border-t border-border bg-gradient-to-r from-background/80 to-muted/20 px-6 py-5 flex items-center justify-between backdrop-blur-sm">
            {eventViewMode === 'view' ? (
              <>
                <div></div>
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
              <>
                {selectedEvent?.id && !selectedEvent.isSynced && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const isRecurringEvent = !!(
                        selectedEvent.recurrence || 
                        selectedEvent.isRecurringInstance || 
                        selectedEvent.parentEventId ||
                        (selectedEvent.id && selectedEvent.id.includes('_'))
                      );
                      
                      if (isRecurringEvent) {
                        setShowRecurringDeleteModal(true);
                      } else {
                        handleEventDelete();
                      }
                    }}
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
                      onClick={onBack}
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
      
      {selectedEvent && (
        <RecurringDeleteModal
          open={showRecurringDeleteModal}
          onOpenChange={setShowRecurringDeleteModal}
          eventTitle={selectedEvent.title}
          onDeleteThis={handleRecurringDeleteThis}
          onDeleteAll={handleRecurringDeleteAll}
          loading={eventSaving}
        />
      )}
    </CommandDialog>
  );
}