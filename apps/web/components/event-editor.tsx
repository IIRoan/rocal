"use client";

import React, { useEffect, useState } from "react";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
import { format } from "date-fns";
import type { UserSettings } from "@/lib/types/calendar";
import { NotificationManager } from "@workspace/ui/components/calendar/notification-manager";
import { formatEventDescription } from "@workspace/ui/components/calendar";
import { RecurringEventForm } from "./command-palette/recurring-event-form";
import { RecurringDeleteModal } from "./command-palette/recurring-delete-modal";
import { useEventForm } from "@/hooks/use-event-form";
import { ShadcnAutocomleteTimePicker } from "@workspace/ui/components/ui/autocompletetimepicker";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
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
  Bell,
  RotateCcw,
  CalendarIcon,
  FileText,
  MapPin,
  Edit3,
  Save,
  Trash2,
  Loader2,
  Clock,
  X,
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

  // Use the event form hook for all form logic
  const eventForm = useEventForm({
    calendars,
    localSettings,
    onEventSaved,
    onClose: () => onOpenChange(false),
  });

  // Local UI state for progressive disclosure
  const [showDescription, setShowDescription] = useState(false);
  const [showLocation, setShowLocation] = useState(false);

  // Reset form when dialog is closed
  useEffect(() => {
    if (!open) {
      eventForm.resetForm();
      setShowDescription(false);
      setShowLocation(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load event data when eventToEdit changes
  useEffect(() => {
    if (eventToEdit && open) {
      eventForm.loadEventData(eventToEdit);
      // Auto-expand fields if they have data
      if (eventToEdit.description) setShowDescription(true);
      if (eventToEdit.location) setShowLocation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventToEdit, open]);

  // Use hook handlers
  const handleEventSave = () => eventForm.handleEventSave(calendarData);
  const handleEventDelete = () => eventForm.handleEventDelete(calendarData);
  const handleRecurringDeleteThis = () =>
    eventForm.handleRecurringDeleteThis(calendarData);
  const handleRecurringDeleteAll = () =>
    eventForm.handleRecurringDeleteAll(calendarData);

  const isViewMode = eventForm.eventViewMode === "view";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[580px] p-0 gap-0 overflow-hidden border-none shadow-2xl bg-card/95 backdrop-blur-xl">
        <DialogHeader className="px-5 py-3 border-b border-border/40 flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base font-semibold">
            {!eventForm.selectedEvent?.id
              ? "Create Event"
              : isViewMode
                ? "Event Details"
                : "Edit Event"}
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {isViewMode ? (
            /* VIEW MODE */
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">
                  {eventForm.eventTitle || "Untitled Event"}
                </h2>
                {eventForm.selectedEvent?.isSynced && (
                  <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500 ring-1 ring-inset ring-blue-500/20">
                    Synced
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-2.5 text-sm">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      {format(eventForm.eventStartDate, "EEEE, MMMM d, yyyy")}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {!eventForm.eventAllDay
                        ? `${eventForm.eventStartTime} - ${eventForm.eventEndTime}`
                        : "All day"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 text-sm">
                  <div
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor:
                        calendars.find(
                          (c) => c.id === eventForm.eventCalendarId
                        )?.color || "#3b82f6",
                    }}
                  />
                  <span className="text-foreground text-xs">
                    {calendars.find((c) => c.id === eventForm.eventCalendarId)
                      ?.name || "Unknown Calendar"}
                  </span>
                </div>

                {eventForm.eventLocation && (
                  <div className="flex items-start gap-2.5 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                    <span className="text-foreground text-xs flex-1 min-w-0">
                      {eventForm.eventLocation}
                    </span>
                  </div>
                )}

                {eventForm.eventDescription && (
                  <div className="flex items-start gap-2.5 text-sm">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                    <div className="text-foreground text-xs whitespace-pre-wrap flex-1 min-w-0">
                      {formatEventDescription(eventForm.eventDescription)}
                    </div>
                  </div>
                )}

                {eventForm.isRecurring && eventForm.recurrenceRule && (
                  <div className="flex items-start gap-2.5 text-sm">
                    <RotateCcw className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                    <span className="text-foreground text-xs flex-1 min-w-0">
                      {(() => {
                        const { frequency, interval, count, until, byWeekDay } =
                          eventForm.recurrenceRule!;
                        let description = "";
                        if (interval === 1) {
                          description =
                            frequency.charAt(0).toUpperCase() +
                            frequency.slice(1);
                        } else {
                          description = `Every ${interval} ${frequency === "daily" ? "days" : frequency === "weekly" ? "weeks" : frequency === "monthly" ? "months" : "years"}`;
                        }
                        if (
                          frequency === "weekly" &&
                          byWeekDay &&
                          byWeekDay.length > 0
                        ) {
                          const dayNames = byWeekDay
                            .map((d: number) => WEEKDAY_SHORT[d])
                            .join(", ");
                          description += ` on ${dayNames}`;
                        }
                        if (count) description += `, ${count} times`;
                        else if (until)
                          description += `, until ${format(new Date(until), "MMM d, yyyy")}`;
                        return description;
                      })()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* EDIT MODE */
            <div className="space-y-3.5">
              {/* Title Input - More Compact */}
              <div>
                <Input
                  value={eventForm.eventTitle}
                  onChange={(e) => eventForm.setEventTitle(e.target.value)}
                  placeholder="Event Title"
                  className="text-lg font-semibold border-none shadow-none px-3 focus-visible:ring-0 focus-visible:border-none focus-visible:shadow-none h-[34px] placeholder:text-muted-foreground/50"
                  autoFocus
                />
                <div className="h-px w-full bg-border/50 mt-1 mx-2" />
              </div>

              {/* Primary Controls - Clean Grid Layout */}
              <div className="space-y-3">
                {/* Calendar Select */}
                <div>
                  <Label className="text-xs font-medium text-foreground/70 mb-1.5 block">
                    Calendar
                  </Label>
                  <Select
                    value={eventForm.eventCalendarId}
                    onValueChange={eventForm.setEventCalendarId}
                  >
                    <SelectTrigger className="h-9 text-sm bg-background border-border hover:border-primary/50 transition-all text-foreground font-medium">
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className="size-2.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor:
                              calendars.find(
                                (c) => c.id === eventForm.eventCalendarId
                              )?.color || "#3b82f6",
                          }}
                        />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {calendars.map((calendar) => (
                        <SelectItem key={calendar.id} value={calendar.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: calendar.color }}
                            />
                            <span>{calendar.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date & Time */}
                <div>
                  <Label className="text-xs font-medium text-foreground/70 mb-1.5 block">
                    Date & Time
                  </Label>
                  <div className="space-y-2">
                    {/* Date picker */}
                    <Popover
                      open={eventForm.startDateOpen}
                      onOpenChange={eventForm.setStartDateOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-9 text-sm bg-background border-border hover:border-primary/50 transition-all font-medium justify-start text-foreground"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                          <span className="truncate">
                            {eventForm.eventStartDate
                              ? format(
                                  eventForm.eventStartDate,
                                  "EEEE, MMMM d, yyyy"
                                )
                              : "Select date"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarUI
                          mode="single"
                          selected={eventForm.eventStartDate}
                          weekStartsOn={1}
                          onSelect={(date) => {
                            if (date) {
                              eventForm.setEventStartDate(date);
                              if (date > eventForm.eventEndDate)
                                eventForm.setEventEndDate(date);
                              eventForm.setStartDateOpen(false);
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>

                    {/* Time & All-day */}
                    {!eventForm.eventAllDay ? (
                      <div className="flex items-center gap-3 bg-background border border-border rounded-md px-4 h-9 hover:border-primary/50 transition-all">
                        <Clock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="flex items-center gap-2 flex-1">
                          <ShadcnAutocomleteTimePicker
                            value={(() => {
                              const [hours, minutes] = eventForm.eventStartTime
                                .split(":")
                                .map(Number);
                              const date = new Date();
                              date.setHours(hours || 0, minutes || 0, 0, 0);
                              return date;
                            })()}
                            onChange={(date) => {
                              const timeString = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
                              eventForm.handleStartTimeChange(timeString);
                            }}
                            is24Hour={localSettings?.timeFormat === "24h"}
                            inline
                            className="text-sm py-1 min-w-[60px] text-center"
                          />
                          <span className="text-muted-foreground text-sm">
                            →
                          </span>
                          <ShadcnAutocomleteTimePicker
                            value={(() => {
                              const [hours, minutes] = eventForm.eventEndTime
                                .split(":")
                                .map(Number);
                              const date = new Date();
                              date.setHours(hours || 0, minutes || 0, 0, 0);
                              return date;
                            })()}
                            onChange={(date) => {
                              const timeString = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
                              eventForm.handleEndTimeChange(timeString);
                            }}
                            is24Hour={localSettings?.timeFormat === "24h"}
                            inline
                            className="text-sm py-1 min-w-[60px] text-center"
                          />
                        </div>
                        <div className="flex items-center space-x-2 pl-3 border-l border-border">
                          <Checkbox
                            id="all-day"
                            checked={eventForm.eventAllDay}
                            onCheckedChange={(checked) =>
                              eventForm.setEventAllDay(checked === true)
                            }
                            className="h-4 w-4"
                          />
                          <Label
                            htmlFor="all-day"
                            className="text-xs font-medium cursor-pointer text-foreground/80 whitespace-nowrap"
                          >
                            All day
                          </Label>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-background border border-border rounded-md px-4 h-9 hover:border-primary/50 transition-all">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-foreground font-medium">
                            All Day Event
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="all-day"
                            checked={eventForm.eventAllDay}
                            onCheckedChange={(checked) =>
                              eventForm.setEventAllDay(checked === true)
                            }
                            className="h-4 w-4"
                          />
                          <Label
                            htmlFor="all-day"
                            className="text-xs font-medium cursor-pointer text-foreground/80"
                          >
                            All day
                          </Label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Add More Options - Clean Pills */}
              <div className="flex flex-wrap gap-2">
                {!showLocation && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLocation(true)}
                    className="h-8 text-xs px-3 font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <MapPin className="mr-1.5 h-3.5 w-3.5" /> Location
                  </Button>
                )}
                {!showDescription && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDescription(true)}
                    className="h-8 text-xs px-3 font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5" /> Description
                  </Button>
                )}
                {!eventForm.isRecurring && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => eventForm.setIsRecurring(true)}
                    className="h-8 text-xs px-3 font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Repeat
                  </Button>
                )}
                {!eventForm.showNotifications && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => eventForm.setShowNotifications(true)}
                    className="h-8 text-xs px-3 font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <Bell className="mr-1.5 h-3.5 w-3.5" /> Reminders
                  </Button>
                )}
              </div>

              {/* Expanded Fields - Clean Styling */}
              <div className="space-y-3">
                {showLocation && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <Label className="text-xs font-medium text-foreground/70 mb-1.5 block">
                      Location
                    </Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={eventForm.eventLocation}
                        onChange={(e) =>
                          eventForm.setEventLocation(e.target.value)
                        }
                        placeholder="Add location"
                        className="pl-10 pr-10 h-9 text-sm bg-background border-border hover:border-primary/50 transition-all font-medium"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md"
                        onClick={() => {
                          setShowLocation(false);
                          eventForm.setEventLocation("");
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {showDescription && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <Label className="text-xs font-medium text-foreground/70 mb-1.5 block">
                      Description
                    </Label>
                    <div className="relative">
                      <Textarea
                        value={eventForm.eventDescription}
                        onChange={(e) =>
                          eventForm.setEventDescription(e.target.value)
                        }
                        placeholder="Add description..."
                        className="min-h-[80px] text-sm bg-background border-border hover:border-primary/50 transition-all resize-none pr-10 font-medium"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md"
                        onClick={() => {
                          setShowDescription(false);
                          eventForm.setEventDescription("");
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {eventForm.isRecurring && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs font-medium text-foreground/70 flex items-center gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5" /> Recurrence
                      </Label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md"
                        onClick={() => {
                          eventForm.setIsRecurring(false);
                          eventForm.setRecurrenceRule(null);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <RecurringEventForm
                      isRecurring={eventForm.isRecurring}
                      onIsRecurringChange={eventForm.setIsRecurring}
                      recurrenceRule={eventForm.recurrenceRule}
                      onRecurrenceRuleChange={eventForm.setRecurrenceRule}
                      eventStartDate={eventForm.eventStartDate}
                      eventEndDate={eventForm.eventEndDate}
                    />
                  </div>
                )}

                {eventForm.showNotifications && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs font-medium text-foreground/70 flex items-center gap-1.5">
                        <Bell className="h-3.5 w-3.5" /> Notifications
                      </Label>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md"
                        onClick={() => eventForm.setShowNotifications(false)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="p-3 rounded-lg border border-border bg-card/30 hover:border-primary/30 transition-all">
                      <NotificationManager
                        eventId={eventForm.selectedEvent?.id}
                        notifications={eventForm.eventNotifications}
                        onChange={eventForm.handleNotificationChange}
                        loading={eventForm.notificationsLoading}
                        defaultReminder={localSettings?.defaultReminder}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border/40 bg-muted/10 flex justify-between items-center">
          {isViewMode ? (
            <>
              <div className="flex gap-2">
                {eventForm.selectedEvent?.id &&
                  !eventForm.selectedEvent.isSynced && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const isRecurringEvent = !!(
                          eventForm.selectedEvent?.recurrence ||
                          eventForm.selectedEvent?.isRecurringInstance ||
                          eventForm.selectedEvent?.parentEventId ||
                          (eventForm.selectedEvent?.id &&
                            eventForm.selectedEvent.id.includes("_"))
                        );
                        if (isRecurringEvent) {
                          eventForm.setShowRecurringDeleteModal(true);
                        } else {
                          handleEventDelete();
                        }
                      }}
                      className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                    </Button>
                  )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onBack}
                  className="h-8 text-xs"
                >
                  Close
                </Button>
                {eventForm.selectedEvent?.id &&
                  !eventForm.selectedEvent.isSynced && (
                    <Button
                      size="sm"
                      onClick={() => eventForm.setEventViewMode("edit")}
                      className="h-8 text-xs"
                    >
                      <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                  )}
              </div>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={
                  eventForm.selectedEvent?.id
                    ? () => eventForm.setEventViewMode("view")
                    : onBack
                }
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleEventSave}
                disabled={
                  eventForm.eventSaving ||
                  !eventForm.eventCalendarId ||
                  !eventForm.eventTitle.trim()
                }
                className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              >
                {eventForm.eventSaving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-3 w-3 mr-1.5" />
                    Save
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>

      {eventForm.selectedEvent && (
        <RecurringDeleteModal
          open={eventForm.showRecurringDeleteModal}
          onOpenChange={eventForm.setShowRecurringDeleteModal}
          eventTitle={eventForm.selectedEvent.title}
          onDeleteThis={handleRecurringDeleteThis}
          onDeleteAll={handleRecurringDeleteAll}
          loading={eventForm.eventSaving}
        />
      )}
    </Dialog>
  );
}
