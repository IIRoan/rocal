"use client";

import React, { useEffect } from "react";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
import { format } from "date-fns";
import type { UserSettings } from "@/lib/types/calendar";
import { TransitionContainer, type PaletteView } from "./command-palette/index";
import {
  NotificationManager,
  EventNotification,
} from "@workspace/ui/components/calendar/notification-manager";
import { RecurringEventForm } from "./command-palette/recurring-event-form";
import { RecurringDeleteModal } from "./command-palette/recurring-delete-modal";
import { useEventForm } from "@/hooks/use-event-form";
import { PairedTimeInputs } from "@/components/ui/time-input";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

import {
  CommandDialog,
} from "@workspace/ui/components/navigation/command";
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
  ArrowLeft,
  CalendarIcon,
  FileText,
  MapPin,
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

  // Use the event form hook for all form logic
  const eventForm = useEventForm({
    calendars,
    localSettings,
    onEventSaved,
    onClose: () => onOpenChange(false),
  });

  // Reset form when dialog is closed
  useEffect(() => {
    if (!open) {
      eventForm.resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load event data when eventToEdit changes
  useEffect(() => {
    if (eventToEdit && open) {
      eventForm.loadEventData(eventToEdit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventToEdit, open]);

  // Use hook handlers
  const handleEventSave = () => eventForm.handleEventSave(calendarData);
  const handleEventDelete = () => eventForm.handleEventDelete(calendarData);
  const handleRecurringDeleteThis = () => eventForm.handleRecurringDeleteThis(calendarData);
  const handleRecurringDeleteAll = () => eventForm.handleRecurringDeleteAll(calendarData);

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
              {!eventForm.selectedEvent?.id ? "Create New Event" :
               eventForm.eventViewMode === 'view' ? eventForm.selectedEvent.title : "Edit Event"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {!eventForm.selectedEvent?.id ? "Add an event to your calendar" :
               eventForm.selectedEvent.isSynced && eventForm.eventViewMode === 'view' ? "Synced from external calendar" :
               eventForm.eventViewMode === 'view' ? "Event details" :
               "Make changes to your event"}
            </p>
          </div>

        </div>

        <div className="max-h-[80vh] overflow-y-auto">
          <div className="p-6 space-y-6">
            {eventForm.eventViewMode === 'view' ? (
              <>
                {/* VIEW MODE - Read-only display */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Event Title
                    {eventForm.selectedEvent?.isSynced && (
                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                        Synced
                      </span>
                    )}
                  </Label>
                  <div className="p-3 bg-muted/50 rounded-md border">
                    <p className="text-base">{eventForm.eventTitle || "Untitled Event"}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Description</Label>
                  <div className="p-3 bg-muted/50 rounded-md border min-h-[60px]">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {eventForm.eventDescription || "No description provided"}
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
                          {format(eventForm.eventStartDate, "EEEE, MMMM d, yyyy")}
                        </p>
                        {!eventForm.eventAllDay && (
                          <p className="text-sm text-muted-foreground">
                            {eventForm.eventStartTime} - {eventForm.eventEndTime}
                          </p>
                        )}
                        {eventForm.eventAllDay && (
                          <p className="text-sm text-muted-foreground">All day</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {eventForm.eventLocation && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      Location
                    </Label>
                    <div className="p-3 bg-muted/50 rounded-md border">
                      <p className="text-sm">{eventForm.eventLocation}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: calendars.find(c => c.id === eventForm.eventCalendarId)?.color || '#3b82f6' }}></div>
                    Calendar
                  </Label>
                  <div className="p-3 bg-muted/50 rounded-md border">
                    <p className="text-sm">{calendars.find(c => c.id === eventForm.eventCalendarId)?.name || "Unknown Calendar"}</p>
                  </div>
                </div>

                {eventForm.isRecurring && eventForm.recurrenceRule && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <RotateCcw className="h-4 w-4 text-muted-foreground" />
                      Recurrence
                    </Label>
                    <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-md border border-blue-200/50 dark:border-blue-800/50">
                      <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                        {(() => {
                          const { frequency, interval, count, until, byWeekDay } = eventForm.recurrenceRule;
                          let description = "";
                          
                          if (interval === 1) {
                            description = frequency.charAt(0).toUpperCase() + frequency.slice(1);
                          } else {
                            description = `Every ${interval} ${frequency === "daily" ? "days" : frequency === "weekly" ? "weeks" : frequency === "monthly" ? "months" : "years"}`;
                          }
                          
                          if (frequency === "weekly" && byWeekDay && byWeekDay.length > 0) {
                            const dayNames = byWeekDay.map((d: number) => WEEKDAY_SHORT[d]).join(", ");
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
                    value={eventForm.eventTitle}
                    onChange={(e) => eventForm.setEventTitle(e.target.value)}
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
                    value={eventForm.eventDescription}
                    onChange={(e) => eventForm.setEventDescription(e.target.value)}
                    rows={2}
                    placeholder="Add more details about your event..."
                    className="border-2 hover:border-primary/50 focus:border-primary transition-colors resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-calendar" className="text-sm font-medium flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: calendars.find(c => c.id === eventForm.eventCalendarId)?.color || '#3b82f6' }}></div>
                    Calendar
                  </Label>
                  <Select value={eventForm.eventCalendarId} onValueChange={eventForm.setEventCalendarId}>
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
                      <Popover open={eventForm.startDateOpen} onOpenChange={eventForm.setStartDateOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between px-3 py-2.5 font-normal border-2 hover:border-primary/50 focus:border-primary transition-colors"
                          >
                            <span className="text-sm">
                              {eventForm.eventStartDate ? format(eventForm.eventStartDate, "EEE, MMM d") : "Pick a date"}
                            </span>
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarUI
                            mode="single"
                            selected={eventForm.eventStartDate}
                            onSelect={(date) => {
                              if (date) {
                                eventForm.setEventStartDate(date);
                                if (date > eventForm.eventEndDate) {
                                  eventForm.setEventEndDate(date);
                                }
                                eventForm.setStartDateOpen(false);
                              }
                            }}
                            className="rounded-md border shadow-md"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">End Date</Label>
                      <Popover open={eventForm.endDateOpen} onOpenChange={eventForm.setEndDateOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between px-3 py-2.5 font-normal border-2 hover:border-primary/50 focus:border-primary transition-colors"
                          >
                            <span className="text-sm">
                              {eventForm.eventEndDate ? format(eventForm.eventEndDate, "EEE, MMM d") : "Pick a date"}
                            </span>
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarUI
                            mode="single"
                            selected={eventForm.eventEndDate}
                            disabled={{ before: eventForm.eventStartDate }}
                            onSelect={(date) => {
                              if (date) {
                                eventForm.setEventEndDate(date);
                                eventForm.setEndDateOpen(false);
                              }
                            }}
                            className="rounded-md border shadow-md"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {!eventForm.eventAllDay && (
                    <PairedTimeInputs
                      startTime={eventForm.eventStartTime}
                      endTime={eventForm.eventEndTime}
                      onStartTimeChange={eventForm.handleStartTimeChange}
                      onEndTimeChange={eventForm.handleEndTimeChange}
                      timeFormat={localSettings?.timeFormat}
                      startError={eventForm.timeErrors.start}
                      endError={eventForm.timeErrors.end}
                    />
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="all-day"
                        checked={eventForm.eventAllDay}
                        onCheckedChange={(checked) => {
                          eventForm.setEventAllDay(checked === true);
                        }}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <Label htmlFor="all-day" className="text-sm font-medium cursor-pointer">
                        All day event
                      </Label>
                    </div>
                    {eventForm.eventAllDay && (
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
                    value={eventForm.eventLocation}
                    onChange={(e) => eventForm.setEventLocation(e.target.value)}
                    placeholder="Where is this happening?"
                    className="border-2 hover:border-primary/50 focus:border-primary transition-colors"
                  />
                </div>

                <RecurringEventForm
                  isRecurring={eventForm.isRecurring}
                  onIsRecurringChange={eventForm.setIsRecurring}
                  recurrenceRule={eventForm.recurrenceRule}
                  onRecurrenceRuleChange={eventForm.setRecurrenceRule}
                  eventStartDate={eventForm.eventStartDate}
                  eventEndDate={eventForm.eventEndDate}
                />

                <div className="space-y-2">
                  <div className="border rounded-lg overflow-hidden transition-all duration-200 hover:shadow-sm bg-gradient-to-br from-card/50 to-card/30">
                    <button
                      type="button"
                      onClick={() => eventForm.setShowNotifications(!eventForm.showNotifications)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/20 transition-colors duration-150"
                    >
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">Email Notifications</span>
                        {eventForm.eventNotifications.length > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                            {eventForm.eventNotifications.length}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {eventForm.notificationsLoading && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                        {eventForm.showNotifications ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                        )}
                      </div>
                    </button>

                    <div
                      className={`transition-all duration-300 ease-in-out overflow-hidden ${
                        eventForm.showNotifications
                          ? "max-h-96 opacity-100 border-t border-border/50"
                          : "max-h-0 opacity-0"
                      }`}
                    >
                      <div className="p-4 pt-3">
                        <NotificationManager
                          eventId={eventForm.selectedEvent?.id}
                          notifications={eventForm.eventNotifications}
                          onChange={eventForm.handleNotificationChange}
                          loading={eventForm.notificationsLoading}
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
            {eventForm.eventViewMode === 'view' ? (
              <>
                <div></div>
                <div className="flex items-center gap-3">
                  {eventForm.selectedEvent?.id && !eventForm.selectedEvent.isSynced && (
                    <Button
                      onClick={() => eventForm.setEventViewMode('edit')}
                      className="bg-primary hover:bg-primary/90 px-6 shadow-sm transition-all duration-200"
                    >
                      <Edit3 className="h-4 w-4 mr-2" />
                      Edit Event
                    </Button>
                  )}
                  {eventForm.selectedEvent?.isSynced && (
                    <div className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-md">
                      <span className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        This event is synced from an external calendar and cannot be edited
                      </span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {eventForm.selectedEvent?.id && !eventForm.selectedEvent.isSynced && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const isRecurringEvent = !!(
                        eventForm.selectedEvent?.recurrence || 
                        eventForm.selectedEvent?.isRecurringInstance || 
                        eventForm.selectedEvent?.parentEventId ||
                        (eventForm.selectedEvent?.id && eventForm.selectedEvent.id.includes('_'))
                      );
                      
                      if (isRecurringEvent) {
                        eventForm.setShowRecurringDeleteModal(true);
                      } else {
                        handleEventDelete();
                      }
                    }}
                    disabled={eventForm.eventSaving}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 transition-all duration-200"
                  >
                    {eventForm.eventSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete Event
                  </Button>
                )}
                <div className="flex gap-3 ml-auto">
                  {eventForm.selectedEvent?.id ? (
                    <Button
                      variant="outline"
                      onClick={() => eventForm.setEventViewMode('view')}
                      disabled={eventForm.eventSaving}
                      className="hover:bg-muted/50 transition-all duration-200"
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={onBack}
                      disabled={eventForm.eventSaving}
                      className="hover:bg-muted/50 transition-all duration-200"
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    onClick={handleEventSave}
                    disabled={eventForm.eventSaving || !eventForm.eventCalendarId || !eventForm.eventTitle.trim()}
                    className="bg-primary hover:bg-primary/90 px-6 shadow-sm transition-all duration-200"
                  >
                    {eventForm.eventSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {eventForm.selectedEvent?.id ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        {eventForm.selectedEvent?.id ? 'Update Event' : 'Create Event'}
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </TransitionContainer>
      
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
    </CommandDialog>
  );
}