"use client";

import React, { useEffect, useState } from "react";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import type { CalendarEvent, Calendar } from "@workspace/ui/components/calendar/types";
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
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/ui/drawer";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Textarea } from "@workspace/ui/components/ui/textarea";
import { Button } from "@workspace/ui/components/ui/button";
import { Checkbox } from "@workspace/ui/components/ui/checkbox";
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
  const isMobile = useIsMobile();
  const dialogTitle = !eventForm.selectedEvent?.id
    ? "Create Event"
    : isViewMode
      ? "Event Details"
      : "Edit Event";

  const recurringModal = eventForm.selectedEvent && (
    <RecurringDeleteModal
      open={eventForm.showRecurringDeleteModal}
      onOpenChange={eventForm.setShowRecurringDeleteModal}
      eventTitle={eventForm.selectedEvent.title}
      onDeleteThis={handleRecurringDeleteThis}
      onDeleteAll={handleRecurringDeleteAll}
      loading={eventForm.eventSaving}
    />
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
          <DrawerContent className="max-h-[92dvh] rounded-t-2xl bg-card/95 backdrop-blur-xl border-none flex flex-col gap-0 overflow-hidden pb-0">
            <DrawerTitle className="sr-only">{dialogTitle}</DrawerTitle>
            <div className="px-5 py-3 border-b border-border/40 flex flex-row items-center justify-between shrink-0">
              <h2 className="text-base font-semibold">{dialogTitle}</h2>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <MobileEventEditorBody
              eventForm={eventForm}
              isViewMode={isViewMode}
              showLocation={showLocation}
              showDescription={showDescription}
              setShowLocation={setShowLocation}
              setShowDescription={setShowDescription}
              localSettings={localSettings}
              calendars={calendars}
            />
            <EventEditorFooter
              isViewMode={isViewMode}
              eventForm={eventForm}
              onBack={onBack}
              handleEventSave={handleEventSave}
              handleEventDelete={handleEventDelete}
            />
          </DrawerContent>
        </Drawer>
        {recurringModal}
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-[420px] max-w-[580px] max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] p-0 gap-0 overflow-hidden border-none shadow-2xl bg-card/95 backdrop-blur-xl flex flex-col">
        <DialogHeader className="px-5 py-3 border-b border-border/40 flex flex-row items-center justify-between space-y-0 shrink-0">
          <DialogTitle className="text-base font-semibold">{dialogTitle}</DialogTitle>
        </DialogHeader>
        <MobileEventEditorBody
          eventForm={eventForm}
          isViewMode={isViewMode}
          showLocation={showLocation}
          showDescription={showDescription}
          setShowLocation={setShowLocation}
          setShowDescription={setShowDescription}
          localSettings={localSettings}
          calendars={calendars}
          desktop
        />
        <EventEditorFooter
          isViewMode={isViewMode}
          eventForm={eventForm}
          onBack={onBack}
          handleEventSave={handleEventSave}
          handleEventDelete={handleEventDelete}
        />
      </DialogContent>
      {recurringModal}
    </Dialog>
  );

}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface BodyProps {
  eventForm: ReturnType<typeof useEventForm>;
  isViewMode: boolean;
  showLocation: boolean;
  showDescription: boolean;
  setShowLocation: (v: boolean) => void;
  setShowDescription: (v: boolean) => void;
  localSettings: UserSettings | null | undefined;
  calendars: Calendar[];
  desktop?: boolean;
}

function MobileEventEditorBody({
  eventForm,
  isViewMode,
  showLocation,
  showDescription,
  setShowLocation,
  setShowDescription,
  localSettings,
  calendars,
  desktop,
}: BodyProps) {
  const bodyClass = desktop
    ? "p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto custom-scrollbar max-h-[calc(70dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))]"
    : "p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar";

  return (
    <div className={bodyClass}>
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
                      {(() => {
                        const startStr = format(
                          eventForm.eventStartDate,
                          "EEEE, MMMM d, yyyy"
                        );
                        const endStr = format(
                          eventForm.eventEndDate,
                          "EEEE, MMMM d, yyyy"
                        );
                        const isSameDay = startStr === endStr;

                        if (isSameDay) {
                          return startStr;
                        }
                        // Multi-day event - show date range
                        return (
                          <>
                            {format(eventForm.eventStartDate, "EEE, MMM d")}
                            <span className="text-muted-foreground mx-1.5">
                              →
                            </span>
                            {format(eventForm.eventEndDate, "EEE, MMM d, yyyy")}
                          </>
                        );
                      })()}
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
              {/* Title Input */}
              <Input
                value={eventForm.eventTitle}
                onChange={(e) => eventForm.setEventTitle(e.target.value)}
                placeholder="Event Title"
                className="text-lg font-semibold h-10"
                autoFocus
              />

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
                    <SelectTrigger className="h-9 text-sm text-foreground font-medium">
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
                    {/* Date pickers - Start and End */}
                    <div className="flex items-center gap-2">
                      {/* Start Date */}
                      {desktop ? (
                        <Popover
                          open={eventForm.startDateOpen}
                          onOpenChange={eventForm.setStartDateOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-9 text-sm font-medium justify-start text-foreground"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                              <span className="truncate">
                                {format(eventForm.eventStartDate, "EEE, MMM d")}
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
                      ) : (
                        <Drawer
                          open={eventForm.startDateOpen}
                          onOpenChange={eventForm.setStartDateOpen}
                        >
                          <DrawerTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-9 text-sm font-medium justify-start text-foreground"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                              <span className="truncate">
                                {format(eventForm.eventStartDate, "EEE, MMM d")}
                              </span>
                            </Button>
                          </DrawerTrigger>
                          <DrawerContent className="pb-safe">
                            <DrawerTitle className="sr-only">Select start date</DrawerTitle>
                            <div className="flex justify-center p-4 pb-8">
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
                            </div>
                          </DrawerContent>
                        </Drawer>
                      )}

                      <span className="text-muted-foreground text-sm font-medium">
                        →
                      </span>

                      {/* End Date */}
                      {desktop ? (
                        <Popover
                          open={eventForm.endDateOpen}
                          onOpenChange={eventForm.setEndDateOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-9 text-sm font-medium justify-start text-foreground"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                              <span className="truncate">
                                {format(eventForm.eventEndDate, "EEE, MMM d")}
                              </span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="end">
                            <CalendarUI
                              mode="single"
                              selected={eventForm.eventEndDate}
                              weekStartsOn={1}
                              disabled={(date) => date < eventForm.eventStartDate}
                              onSelect={(date) => {
                                if (date) {
                                  eventForm.setEventEndDate(date);
                                  eventForm.setEndDateOpen(false);
                                }
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <Drawer
                          open={eventForm.endDateOpen}
                          onOpenChange={eventForm.setEndDateOpen}
                        >
                          <DrawerTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-9 text-sm font-medium justify-start text-foreground"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                              <span className="truncate">
                                {format(eventForm.eventEndDate, "EEE, MMM d")}
                              </span>
                            </Button>
                          </DrawerTrigger>
                          <DrawerContent className="pb-safe">
                            <DrawerTitle className="sr-only">Select end date</DrawerTitle>
                            <div className="flex justify-center p-4 pb-8">
                              <CalendarUI
                                mode="single"
                                selected={eventForm.eventEndDate}
                                weekStartsOn={1}
                                disabled={(date) => date < eventForm.eventStartDate}
                                onSelect={(date) => {
                                  if (date) {
                                    eventForm.setEventEndDate(date);
                                    eventForm.setEndDateOpen(false);
                                  }
                                }}
                                initialFocus
                              />
                            </div>
                          </DrawerContent>
                        </Drawer>
                      )}
                    </div>

                    {desktop ? (
                      <div className="bg-input rounded-md px-3 h-9 flex items-center">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="event-all-day-checkbox"
                            checked={eventForm.eventAllDay}
                            onCheckedChange={(checked) =>
                              eventForm.setEventAllDay(checked === true)
                            }
                            className="h-4 w-4"
                          />
                          <Label
                            htmlFor="event-all-day-checkbox"
                            className="text-xs font-medium cursor-pointer text-foreground/80"
                          >
                            All day
                          </Label>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={eventForm.eventAllDay}
                        onClick={() => eventForm.setEventAllDay(!eventForm.eventAllDay)}
                        className="flex items-center justify-between w-full py-3 px-1 active:opacity-80 transition-opacity"
                      >
                        <span className="text-sm font-medium text-foreground">
                          All day
                        </span>
                        <span
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${
                            eventForm.eventAllDay
                              ? "bg-primary"
                              : "bg-input dark:bg-input/80"
                          }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-background shadow-sm ring-1 ring-black/5 dark:ring-white/10 transition-transform duration-200 ${
                              eventForm.eventAllDay ? "translate-x-5.5" : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      </button>
                    )}

                    {/* Time */}
                    {!eventForm.eventAllDay ? (
                      <div className="flex items-center gap-3 bg-input rounded-md px-4 h-9">
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
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Add More Options - Clean Pills */}
              <div className="flex flex-wrap gap-2">
                {!showLocation && (
                  <button
                    type="button"
                    onClick={() => setShowLocation(true)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground rounded-lg transition-colors"
                  >
                    <MapPin className="h-4 w-4" /> Location
                  </button>
                )}
                {!showDescription && (
                  <button
                    type="button"
                    onClick={() => setShowDescription(true)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground rounded-lg transition-colors"
                  >
                    <FileText className="h-4 w-4" /> Description
                  </button>
                )}
                {!eventForm.isRecurring && (
                  <button
                    type="button"
                    onClick={() => eventForm.setIsRecurring(true)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground rounded-lg transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" /> Repeat
                  </button>
                )}
                {!eventForm.showNotifications && (
                  <button
                    type="button"
                    onClick={() => eventForm.setShowNotifications(true)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground rounded-lg transition-colors"
                  >
                    <Bell className="h-4 w-4" /> Reminders
                  </button>
                )}
              </div>

              {/* Expanded Fields */}
              <div className="space-y-3">
                {showLocation && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs font-medium text-foreground/70">
                        Location
                      </Label>
                      <button
                        type="button"
                        onClick={() => {
                          setShowLocation(false);
                          eventForm.setEventLocation("");
                        }}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        value={eventForm.eventLocation}
                        onChange={(e) =>
                          eventForm.setEventLocation(e.target.value)
                        }
                        placeholder="Add location"
                        className="pl-10 h-10"
                      />
                    </div>
                  </div>
                )}

                {showDescription && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs font-medium text-foreground/70">
                        Description
                      </Label>
                      <button
                        type="button"
                        onClick={() => {
                          setShowDescription(false);
                          eventForm.setEventDescription("");
                        }}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <Textarea
                      value={eventForm.eventDescription}
                      onChange={(e) =>
                        eventForm.setEventDescription(e.target.value)
                      }
                      placeholder="Add description..."
                      className="min-h-[80px] text-sm resize-none"
                    />
                  </div>
                )}

                {eventForm.isRecurring && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs font-medium text-foreground/70 flex items-center gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5" /> Recurrence
                      </Label>
                      <button
                        type="button"
                        onClick={() => {
                          eventForm.setIsRecurring(false);
                          eventForm.setRecurrenceRule(null);
                        }}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
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
                      <button
                        type="button"
                        onClick={() => eventForm.setShowNotifications(false)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="p-3 rounded-lg border border-border bg-muted/30">
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
  );
}

interface FooterProps {
  isViewMode: boolean;
  eventForm: BodyProps["eventForm"];
  onBack?: () => void;
  handleEventSave: () => void;
  handleEventDelete: () => void;
}

function EventEditorFooter({
  isViewMode,
  eventForm,
  onBack,
  handleEventSave,
  handleEventDelete,
}: FooterProps) {
  return (
    <div className="px-4 py-3 border-t border-border/40 bg-muted/30 flex flex-row gap-3 shrink-0">
      {isViewMode ? (
        <>
          {eventForm.selectedEvent?.id &&
            !eventForm.selectedEvent.isSynced && (
              <button
                type="button"
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
                className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium text-destructive border border-destructive/30 bg-transparent hover:bg-destructive/10 rounded-lg transition-colors"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </button>
            )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium text-foreground border border-border bg-background hover:bg-muted rounded-lg transition-colors"
          >
            Close
          </button>
          {eventForm.selectedEvent?.id &&
            !eventForm.selectedEvent.isSynced && (
              <button
                type="button"
                onClick={() => eventForm.setEventViewMode("edit")}
                className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                <Edit3 className="h-4 w-4 mr-2" /> Edit
              </button>
            )}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={
              eventForm.selectedEvent?.id
                ? () => eventForm.setEventViewMode("view")
                : onBack
            }
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium text-foreground border border-border bg-background hover:bg-muted rounded-lg transition-colors"
          >
            Cancel
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleEventSave}
            disabled={
              eventForm.eventSaving ||
              !eventForm.eventCalendarId ||
              !eventForm.eventTitle.trim()
            }
            className="inline-flex items-center justify-center h-10 px-6 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none rounded-lg transition-colors"
          >
            {eventForm.eventSaving ? (
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
          </button>
        </>
      )}
    </div>
  );
}
