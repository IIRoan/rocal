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
import { formatEventDescription } from "@workspace/ui/components/calendar";
import { RecurringEventForm } from "./command-palette/recurring-event-form";
import { RecurringDeleteModal } from "./command-palette/recurring-delete-modal";
import { useEventForm } from "@/hooks/use-event-form";
import { ShadcnAutocomleteTimePicker } from "@workspace/ui/components/ui/autocompletetimepicker";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

import {
  CommandDialog,
  CommandList,
  CommandGroup,
  CommandItem,
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
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">
            {!eventForm.selectedEvent?.id ? "Create New Event" :
             eventForm.eventViewMode === 'view' ? eventForm.selectedEvent.title : "Edit Event"}
          </h2>
        </div>

        <CommandList>
          {eventForm.eventViewMode === 'view' ? (
            <>
              {/* VIEW MODE - Read-only display */}
              <CommandGroup heading="Event Details">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium">{eventForm.eventTitle || "Untitled Event"}</span>
                        {eventForm.selectedEvent?.isSynced && (
                          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                            Synced
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">Event title</span>
                    </div>
                  </div>
                </div>

                {eventForm.eventDescription && (
                  <div className="px-4 py-3 border-t border-border/50">
                    <div className="flex items-start gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <div className="text-foreground text-sm">{formatEventDescription(eventForm.eventDescription)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Description</div>
                      </div>
                    </div>
                  </div>
                )}
              </CommandGroup>

              <CommandGroup heading="Date & Time">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <span className="text-foreground font-medium">
                        {format(eventForm.eventStartDate, "EEEE, MMMM d, yyyy")}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {!eventForm.eventAllDay ? (
                          `${eventForm.eventStartTime} - ${eventForm.eventEndTime}`
                        ) : (
                          "All day"
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CommandGroup>

              {eventForm.eventLocation && (
                <CommandGroup heading="Location">
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <span className="text-foreground">{eventForm.eventLocation}</span>
                        <div className="text-xs text-muted-foreground">Event location</div>
                      </div>
                    </div>
                  </div>
                </CommandGroup>
              )}

              <CommandGroup heading="Calendar">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: calendars.find(c => c.id === eventForm.eventCalendarId)?.color || '#3b82f6' }}></div>
                    <div className="flex-1">
                      <span className="text-foreground">{calendars.find(c => c.id === eventForm.eventCalendarId)?.name || "Unknown Calendar"}</span>
                      <div className="text-xs text-muted-foreground">Calendar</div>
                    </div>
                  </div>
                </div>
              </CommandGroup>

              {eventForm.isRecurring && eventForm.recurrenceRule && (
                <CommandGroup heading="Recurrence">
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <RotateCcw className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <span className="text-foreground font-medium">
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
                        </span>
                        <div className="text-xs text-muted-foreground">Repeating pattern</div>
                      </div>
                    </div>
                  </div>
                </CommandGroup>
              )}
            </>
          ) : (
            <>
              {/* EDIT MODE - Settings-style form */}
              <CommandGroup heading="Event Details">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="text-foreground text-sm font-medium mb-2">Event Title</div>
                      <Input
                        value={eventForm.eventTitle}
                        onChange={(e) => eventForm.setEventTitle(e.target.value)}
                        placeholder="What's the event about?"
                        className="w-full"
                        autoFocus
                      />
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-border/50">
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground mt-2" />
                    <div className="flex-1">
                      <div className="text-foreground text-sm font-medium mb-2">
                        Description <span className="text-muted-foreground font-normal">(optional)</span>
                      </div>
                      <Textarea
                        value={eventForm.eventDescription}
                        onChange={(e) => eventForm.setEventDescription(e.target.value)}
                        rows={3}
                        placeholder="Add more details about your event..."
                        className="w-full resize-none"
                      />
                    </div>
                  </div>
                </div>
              </CommandGroup>

              <CommandGroup heading="Calendar">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: calendars.find(c => c.id === eventForm.eventCalendarId)?.color || '#3b82f6' }}></div>
                    <div className="flex-1">
                      <div className="text-foreground text-sm font-medium mb-2">Choose Calendar</div>
                      <Select value={eventForm.eventCalendarId} onValueChange={eventForm.setEventCalendarId}>
                        <SelectTrigger className="w-full">
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
                  </div>
                </div>
              </CommandGroup>

              <CommandGroup heading="Date & Time">
                <div className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground mt-2" />
                    <div className="flex-1 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-foreground text-sm font-medium mb-2">Start Date</div>
                          <Popover open={eventForm.startDateOpen} onOpenChange={eventForm.setStartDateOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-between font-normal"
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
                                weekStartsOn={1}
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

                        <div>
                          <div className="text-foreground text-sm font-medium mb-2">End Date</div>
                          <Popover open={eventForm.endDateOpen} onOpenChange={eventForm.setEndDateOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-between font-normal"
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
                                weekStartsOn={1}
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

                      {!eventForm.eventAllDay && (
                        <div>
                          <div className="text-foreground text-sm font-medium mb-2">Time</div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm text-muted-foreground mb-1">Start Time</div>
                              <ShadcnAutocomleteTimePicker
                                value={(() => {
                                  const [hours, minutes] = eventForm.eventStartTime.split(':').map(Number);
                                  const date = new Date();
                                  date.setHours(hours || 0, minutes || 0, 0, 0);
                                  return date;
                                })()}
                                onChange={(date) => {
                                  const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                                  eventForm.handleStartTimeChange(timeString);
                                }}
                                is24Hour={localSettings?.timeFormat === '24h'}
                                placeholder="Start time..."
                              />
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground mb-1">End Time</div>
                              <ShadcnAutocomleteTimePicker
                                value={(() => {
                                  const [hours, minutes] = eventForm.eventEndTime.split(':').map(Number);
                                  const date = new Date();
                                  date.setHours(hours || 0, minutes || 0, 0, 0);
                                  return date;
                                })()}
                                onChange={(date) => {
                                  const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                                  eventForm.handleEndTimeChange(timeString);
                                }}
                                is24Hour={localSettings?.timeFormat === '24h'}
                                placeholder="End time..."
                              />
                            </div>
                          </div>
                          {(eventForm.timeErrors.start || eventForm.timeErrors.end) && (
                            <div className="mt-2 space-y-1">
                              {eventForm.timeErrors.start && (
                                <p className="text-xs text-destructive">{eventForm.timeErrors.start}</p>
                              )}
                              {eventForm.timeErrors.end && (
                                <p className="text-xs text-destructive">{eventForm.timeErrors.end}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CommandGroup>

              <CommandGroup heading="Location">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="text-foreground text-sm font-medium mb-2">
                        Location <span className="text-muted-foreground font-normal">(optional)</span>
                      </div>
                      <Input
                        value={eventForm.eventLocation}
                        onChange={(e) => eventForm.setEventLocation(e.target.value)}
                        placeholder="Where is this happening?"
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </CommandGroup>

              <CommandGroup heading="Recurrence">
                <div className="px-4 py-3">
                  <RecurringEventForm
                    isRecurring={eventForm.isRecurring}
                    onIsRecurringChange={eventForm.setIsRecurring}
                    recurrenceRule={eventForm.recurrenceRule}
                    onRecurrenceRuleChange={eventForm.setRecurrenceRule}
                    eventStartDate={eventForm.eventStartDate}
                    eventEndDate={eventForm.eventEndDate}
                  />
                </div>
              </CommandGroup>

              <CommandGroup heading="Notifications">
                <CommandItem
                  onSelect={() => eventForm.setShowNotifications(!eventForm.showNotifications)}
                  className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
                >
                  <Bell className="mr-3 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col flex-1">
                    <span className="text-foreground">Email Notifications</span>
                    <span className="text-xs text-muted-foreground">
                      {eventForm.eventNotifications.length > 0 
                        ? `${eventForm.eventNotifications.length} reminder${eventForm.eventNotifications.length > 1 ? 's' : ''} set`
                        : "Set up email reminders"}
                    </span>
                  </div>
                  {eventForm.notificationsLoading && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground mr-2" />
                  )}
                  {eventForm.showNotifications ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </CommandItem>

                {eventForm.showNotifications && (
                  <div className="px-4 pb-3 border-t border-border/50">
                    <div className="pt-3">
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
              </CommandGroup>
            </>
          )}
        </CommandList>

        {/* Action Buttons */}
        <div className="border-t border-border px-6 py-4 bg-card/50">
          {eventForm.eventViewMode === 'view' ? (
            <div className="flex items-center justify-end gap-3">
              {eventForm.selectedEvent?.id && !eventForm.selectedEvent.isSynced && (
                <Button
                  onClick={() => eventForm.setEventViewMode('edit')}
                  className="bg-primary hover:bg-primary/90"
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
          ) : (
            <div className="flex items-center justify-between">
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
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 hover:border-destructive/50"
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
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={onBack}
                    disabled={eventForm.eventSaving}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  onClick={handleEventSave}
                  disabled={eventForm.eventSaving || !eventForm.eventCalendarId || !eventForm.eventTitle.trim()}
                  className="bg-primary hover:bg-primary/90"
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
            </div>
          )}
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