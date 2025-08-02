"use client";

import { useEffect, useMemo, useState } from "react";
import { RiCalendarLine, RiDeleteBinLine } from "@remixicon/react";
import { format, isBefore } from "date-fns";
import type { CalendarEvent } from "./types";
import { useCalendarContext } from "./calendar-context";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import {
  Loader2,
  Bell,
  CalendarIcon,
  Clock,
  User,
  FileText,
  MapPin,
  Palette,
} from "lucide-react";
import {
  StartHour,
  EndHour,
  DefaultStartHour,
  DefaultEndHour,
} from "./constants";
import {
  NotificationManager,
  type EventNotification,
} from "./notification-manager";

const REMINDER_OPTIONS = [
  { value: null, label: "No reminder" },
  { value: 5, label: "5 minutes before" },
  { value: 10, label: "10 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 1440, label: "1 day before" },
  { value: 10080, label: "1 week before" },
];

export interface ValidationError {
  field: string;
  message: string;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: ValidationError[];
}

interface EventDialogProps {
  event: CalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: CalendarEvent) => Promise<CalendarEvent>;
  onDelete: (eventId: string) => void;
  loading?: boolean;
  error?: ApiError | null;
  timeFormat?: "12h" | "24h";
  defaultReminder?: number | null;
  defaultEventDuration?: number;
  defaultCalendarId?: string | null;
  // Notification handlers
  onLoadNotifications?: (eventId: string) => Promise<EventNotification[]>;
  onUpdateNotifications?: (
    eventId: string,
    notifications: EventNotification[]
  ) => Promise<void>;
}

export function EventDialog({
  event,
  isOpen,
  onClose,
  onSave,
  onDelete,
  loading = false,
  error: apiError = null,
  timeFormat = "12h",
  defaultReminder = null,
  defaultEventDuration = 60,
  defaultCalendarId = null,
  onLoadNotifications,
  onUpdateNotifications,
}: EventDialogProps) {
  const { calendars } = useCalendarContext();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState(`${DefaultStartHour}:00`);
  const [endTime, setEndTime] = useState(`${DefaultEndHour}:00`);
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [calendarId, setCalendarId] = useState<string>("");
  const [reminder, setReminder] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<EventNotification[]>([]);

  // UI state
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Get default calendar
  const defaultCalendar = useMemo(() => {
    if (defaultCalendarId) {
      const specificCalendar = calendars.find(
        (cal) => cal.id === defaultCalendarId
      );
      if (specificCalendar) return specificCalendar;
    }
    return calendars.find((cal) => cal.isDefault) || calendars[0];
  }, [calendars, defaultCalendarId]);

  // Initialize form when dialog opens or event changes
  useEffect(() => {
    if (isOpen) {
      if (event) {
        setTitle(event.title || "");
        setDescription(event.description || "");
        setStartDate(new Date(event.start));
        setEndDate(new Date(event.end));
        setStartTime(formatTimeForInput(new Date(event.start)));
        setEndTime(formatTimeForInput(new Date(event.end)));
        setAllDay(event.allDay || false);
        setLocation(event.location || "");
        setCalendarId(event.calendarId || defaultCalendar?.id || "");
        setReminder(event.reminder ?? null);

        if (event.id && onLoadNotifications) {
          loadEventNotifications(event.id);
        } else {
          setNotifications([]);
        }
      } else {
        resetForm();
      }
      setValidationErrors([]);
      setLocalError(null);
    }
  }, [
    isOpen,
    event,
    defaultCalendar?.id,
    defaultReminder,
    defaultEventDuration,
  ]);

  const loadEventNotifications = async (eventId: string) => {
    if (!onLoadNotifications) return;
    try {
      const eventNotifications = await onLoadNotifications(eventId);
      setNotifications(eventNotifications);
    } catch (error) {
      console.error("Failed to load event notifications:", error);
      setNotifications([]);
    }
  };

  const resetForm = () => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMinutes(startDate.getMinutes() + defaultEventDuration);

    setTitle("");
    setDescription("");
    setStartDate(startDate);
    setEndDate(endDate);
    setStartTime(`${DefaultStartHour}:00`);

    const durationHours = Math.floor(defaultEventDuration / 60);
    const durationMinutes = defaultEventDuration % 60;
    const defaultEndHour = DefaultStartHour + durationHours;
    const defaultEndMinute = durationMinutes;

    setEndTime(
      `${defaultEndHour.toString().padStart(2, "0")}:${defaultEndMinute
        .toString()
        .padStart(2, "0")}`
    );
    setAllDay(false);
    setLocation("");
    setCalendarId(defaultCalendar?.id || "");
    setReminder(defaultReminder);
    setNotifications([]);
  };

  const formatTimeForInput = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = Math.floor(date.getMinutes() / 15) * 15;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  };

  const validateTimeInput = (timeString: string): string | null => {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    const match = timeString.match(timeRegex);
    if (!match) return null;

    const hours = Number.parseInt(match[1]!, 10);
    const minutes = Number.parseInt(match[2]!, 10);

    if (hours < StartHour || hours > EndHour) return null;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  };

  const handleTimeInputChange = (
    value: string,
    setter: (time: string) => void
  ) => {
    if (value === "" || /^([0-2]?[0-9]?:?[0-5]?[0-9]?)$/.test(value)) {
      setter(value);
    }
  };

  const handleTimeInputBlur = (
    value: string,
    setter: (time: string) => void
  ) => {
    const validatedTime = validateTimeInput(value);
    if (validatedTime) {
      setter(validatedTime);
    } else if (value !== "") {
      setter(setter === setStartTime ? startTime : endTime);
    }
  };

  const timeOptions = useMemo(() => {
    const options = [];
    for (let hour = StartHour; hour <= EndHour; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const formattedHour = hour.toString().padStart(2, "0");
        const formattedMinute = minute.toString().padStart(2, "0");
        const value = `${formattedHour}:${formattedMinute}`;
        const date = new Date(2000, 0, 1, hour, minute);
        const label =
          timeFormat === "24h"
            ? `${formattedHour}:${formattedMinute}`
            : format(date, "h:mm a");
        options.push({ value, label });
      }
    }
    return options;
  }, [timeFormat]);

  const validateForm = (): ValidationError[] => {
    const errors: ValidationError[] = [];

    if (!title.trim()) {
      errors.push({ field: "title", message: "Title is required" });
    }

    if (!calendarId) {
      errors.push({ field: "calendar", message: "Please select a calendar" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!allDay) {
      const [startHours = 0, startMinutes = 0] = startTime
        .split(":")
        .map(Number);
      const [endHours = 0, endMinutes = 0] = endTime.split(":").map(Number);

      if (
        startHours < StartHour ||
        startHours > EndHour ||
        endHours < StartHour ||
        endHours > EndHour
      ) {
        errors.push({
          field: "time",
          message: `Selected time must be between ${StartHour.toString().padStart(
            2,
            "0"
          )}:00 and ${EndHour.toString().padStart(2, "0")}:00`,
        });
      }

      start.setHours(startHours, startMinutes, 0);
      end.setHours(endHours, endMinutes, 0);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    if (isBefore(end, start)) {
      errors.push({
        field: "endDate",
        message: "End date cannot be before start date",
      });
    }

    return errors;
  };

  const handleSave = async () => {
    setValidationErrors([]);
    setLocalError(null);

    const errors = validateForm();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!allDay) {
      const [startHours = 0, startMinutes = 0] = startTime
        .split(":")
        .map(Number);
      const [endHours = 0, endMinutes = 0] = endTime.split(":").map(Number);

      start.setHours(startHours, startMinutes, 0);
      end.setHours(endHours, endMinutes, 0);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    const selectedCalendar = calendars.find((cal) => cal.id === calendarId);
    const calendarColor = selectedCalendar?.color || "blue";

    const eventData: CalendarEvent = {
      id: event?.id || "",
      title: title.trim(),
      description: description.trim() || undefined,
      start,
      end,
      allDay,
      location: location.trim() || undefined,
      color: calendarColor as any,
      calendarId,
      userId: event?.userId || "demo-user",
      createdAt: event?.createdAt || new Date(),
      updatedAt: new Date(),
      reminder: reminder,
    };

    setSaving(true);
    try {
      const savedEvent = await onSave(eventData);
      if (
        notifications.length > 0 &&
        (savedEvent?.id || eventData?.id) &&
        onUpdateNotifications
      ) {
        const eventId = savedEvent?.id || eventData?.id;
        try {
          await onUpdateNotifications(eventId, notifications);
        } catch (notificationError) {
          console.error("Failed to update notifications:", notificationError);
        }
      }
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (event?.id) {
      setDeleting(true);
      try {
        await onDelete(event.id);
      } catch (error) {
        console.error("Delete failed:", error);
      } finally {
        setDeleting(false);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col bg-popover text-popover-foreground border border-border">
        <DialogHeader className="pb-3 border-b border-border bg-card/20">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
            {event?.id ? "Edit Event" : "Create Event"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {event?.id
              ? "Edit the details of this event"
              : "Add a new event to your calendar"}
          </DialogDescription>
        </DialogHeader>

        {(apiError || localError || validationErrors.length > 0) && (
          <div className="mx-1 mt-3 rounded-md px-3 py-2 text-sm space-y-1 border border-destructive/30 bg-destructive/10 text-destructive">
            {apiError && <div>{apiError.message}</div>}
            {localError && <div>{localError}</div>}
            {validationErrors.map((error, index) => (
              <div key={index}>{error.message}</div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4">
            {/* Left Section */}
            <div className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Title
                  </Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter event title"
                    className="text-base"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="description"
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Enter event description"
                    className="resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="calendar" className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    Calendar
                  </Label>
                  <Select value={calendarId} onValueChange={setCalendarId}>
                    <SelectTrigger id="calendar">
                      <SelectValue placeholder="Select a calendar" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border border-border">
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

                <div className="space-y-1.5">
                  <Label htmlFor="location" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Location
                  </Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Enter event location"
                  />
                </div>
              </div>
            </div>

            {/* Right Section */}
            <div className="space-y-4">
              {/* Start Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    <RiCalendarLine className="h-4 w-4 text-muted-foreground" />
                    Start Date
                  </Label>
                  <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-between px-3 font-normal border-border bg-card/30 hover:bg-card/40",
                          !startDate && "text-muted-foreground"
                        )}
                      >
                        <span className="truncate">
                          {startDate ? format(startDate, "PPP") : "Pick a date"}
                        </span>
                        <RiCalendarLine
                          size={16}
                          className="text-muted-foreground/80 shrink-0"
                        />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-2 bg-card border border-border"
                      align="start"
                    >
                      <Calendar
                        mode="single"
                        selected={startDate}
                        defaultMonth={startDate}
                        onSelect={(date) => {
                          if (date) {
                            setStartDate(date);
                            if (isBefore(endDate, date)) setEndDate(date);
                            setStartDateOpen(false);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {!allDay && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Start Time
                    </Label>
                    <Select
                      value={startTime}
                      onValueChange={(value) => {
                        setStartTime(value);
                        const [hours, minutes] = value.split(":").map(Number);
                        if (hours !== undefined && minutes !== undefined) {
                          const endHour = hours + 1;
                          const endTimeValue = `${endHour.toString().padStart(2, "0")}:${minutes
                            .toString()
                            .padStart(2, "0")}`;
                          if (endHour <= EndHour) setEndTime(endTimeValue);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select time" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border border-border">
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

              {/* End Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    <RiCalendarLine className="h-4 w-4 text-muted-foreground" />
                    End Date
                  </Label>
                  <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-between px-3 font-normal border-border bg-card/30 hover:bg-card/40",
                          !endDate && "text-muted-foreground"
                        )}
                      >
                        <span className="truncate">
                          {endDate ? format(endDate, "PPP") : "Pick a date"}
                        </span>
                        <RiCalendarLine
                          size={16}
                          className="text-muted-foreground/80 shrink-0"
                        />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-2 bg-card border border-border"
                      align="start"
                    >
                      <Calendar
                        mode="single"
                        selected={endDate}
                        defaultMonth={endDate}
                        disabled={{ before: startDate }}
                        onSelect={(date) => {
                          if (date) {
                            setEndDate(date);
                            setEndDateOpen(false);
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {!allDay && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      End Time
                    </Label>
                    <Select value={endTime} onValueChange={setEndTime}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select time" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border border-border">
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
              <div className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/20">
                <Checkbox
                  id="all-day"
                  checked={allDay}
                  onCheckedChange={(checked) => setAllDay(checked === true)}
                />
                <Label
                  htmlFor="all-day"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  All day event
                </Label>
              </div>

              {/* Notifications Section */}
              {onLoadNotifications && onUpdateNotifications && (
                <div className="border-t border-border/60 pt-4">
                  <NotificationManager
                    eventId={event?.id}
                    notifications={notifications}
                    onChange={setNotifications}
                    loading={saving}
                    defaultReminder={defaultReminder}
                  />
                </div>
              )}

              {/* Fallback Reminder */}
              {(!onLoadNotifications || !onUpdateNotifications) && (
                <div className="space-y-1.5">
                  <Label htmlFor="reminder" className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    Reminder
                  </Label>
                  <Select
                    value={reminder?.toString() || "none"}
                    onValueChange={(value) =>
                      setReminder(
                        value === "none" ? null : Number.parseInt(value)
                      )
                    }
                  >
                    <SelectTrigger id="reminder">
                      <SelectValue placeholder="Select reminder" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border border-border">
                      {REMINDER_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value?.toString() || "none"}
                          value={option.value?.toString() || "none"}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row sm:justify-between border-t border-border bg-card/20">
          {event?.id && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive bg-transparent border-border"
              size="icon"
              onClick={handleDelete}
              disabled={deleting || saving}
              aria-label="Delete event"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RiDeleteBinLine size={16} />
              )}
            </Button>
          )}
          <div className="flex flex-1 justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saving || deleting}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || deleting || !calendarId}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
