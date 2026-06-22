import React, { useCallback, useMemo, useState } from "react";
import {
  isCancelledCalendarEvent,
  isMailInvitationStagingCalendar,
} from "@workspace/calendar-core";
import {
  NotificationManager,
  formatEventDescription,
} from "@workspace/ui/components/calendar";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/ui/alert";
import { getColorSwatchValue } from "@workspace/ui/components/calendar";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/ui/avatar";
import { Calendar as CalendarUI } from "@workspace/ui/components/ui/calendar";
import { Button } from "@workspace/ui/components/ui/button";
import { Checkbox } from "@workspace/ui/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/ui/drawer";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import { Switch } from "@workspace/ui/components/ui/switch";
import { Textarea } from "@workspace/ui/components/ui/textarea";
import { format } from "date-fns";
import {
  Bell,
  CalendarIcon,
  Clock,
  CloudDownload,
  FileText,
  Mail,
  MapPin,
  AlertTriangle,
  PenOff,
  RefreshCw,
  RotateCcw,
  Server,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { EventParticipantInput, RecentContactEntry } from "@workspace/calendar-core";
import { normalizeParticipantEmail } from "@workspace/calendar-core";

import { RecurringEventForm } from "../command-palette/recurring-event-form";
import { RecipientSuggestInput } from "../mail/recipient-suggest-input";
import { stopEventPropagation } from "@/lib/event-propagation";
import {
  formatReminderMinutes,
  getEnabledEmailReminderMinutes,
  getEventDateDisplay,
  getRecurringRuleSummary,
} from "@/lib/event-editor-view-model";
import { ShadcnAutocomleteTimePicker } from "@workspace/ui/components/ui/autocompletetimepicker";
import { EventEditorFieldToggles } from "./event-editor-field-toggles";
import { ParticipantsInviteInfo } from "./participants-invite-info";
import type { EventEditorBodyProps } from "./types";

function SyncedEventInfoBadge() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Synced from external calendar"
          className="tap-target inline-flex items-center justify-center size-5 rounded-md text-foreground/60 hover:text-foreground hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 transition-colors"
          onClick={stopEventPropagation}
        >
          <RefreshCw className="size-3" strokeWidth={2.25} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-72 p-0 overflow-hidden"
        onClick={stopEventPropagation}
      >
        <div className="flex items-start gap-3 px-3.5 py-3 border-b border-border/60">
          <div className="flex items-center justify-center size-8 shrink-0 rounded-md bg-foreground/5 text-foreground/70">
            <RefreshCw className="size-4" strokeWidth={2.25} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium leading-tight">
              Synced event
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              This event is mirrored from an external calendar provider.
            </p>
          </div>
        </div>
        <div className="px-3.5 py-3 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <CloudDownload
              className="size-3.5 mt-0.5 text-foreground/70 shrink-0"
              aria-hidden
            />
            <div className="min-w-0">
              <div className="text-xs font-medium leading-tight">
                Source of truth lives elsewhere
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                Changes made on the original provider flow back into Solace on
                the next sync.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Server
              className="size-3.5 mt-0.5 text-foreground/70 shrink-0"
              aria-hidden
            />
            <div className="min-w-0">
              <div className="text-xs font-medium leading-tight">
                Stored on Solace during sync
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                Title, time, location and description are pulled in so we can
                render the event and trigger reminders.
              </p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatParticipantStatus(status?: string) {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "tentative":
      return "Tentative";
    default:
      return "Invited";
  }
}

function getParticipantInitials(
  participant: Pick<EventParticipantInput, "displayName" | "email"> & {
    image?: string | null;
  },
) {
  const label = participant.displayName?.trim() || participant.email.trim();
  const segments = label
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2);

  return (
    segments.map((segment) => segment[0]?.toUpperCase() ?? "").join("") || "P"
  );
}

export function EventEditorBody({
  calendars,
  desktop,
  eventForm,
  isViewMode,
  localSettings,
  setShowDescription,
  setShowLocation,
  setShowParticipants,
  showDescription,
  showLocation,
  showParticipants,
}: EventEditorBodyProps) {
  const [participantDraft, setParticipantDraft] = useState("");
  const [participantError, setParticipantError] = useState<string | null>(null);
  const selectedCalendar = useMemo(
    () =>
      calendars.find((calendar) => calendar.id === eventForm.eventCalendarId),
    [calendars, eventForm.eventCalendarId],
  );
  const selectableCalendars = useMemo(
    () =>
      calendars.filter(
        (calendar) =>
          !calendar.isSyncOnly && !isMailInvitationStagingCalendar(calendar),
      ),
    [calendars],
  );
  const reminderMinutes = useMemo(
    () => getEnabledEmailReminderMinutes(eventForm.eventNotifications ?? []),
    [eventForm.eventNotifications],
  );
  const eventDateDisplay = useMemo(
    () =>
      getEventDateDisplay(eventForm.eventStartDate, eventForm.eventEndDate, {
        allDay: eventForm.eventAllDay,
      }),
    [eventForm.eventEndDate, eventForm.eventStartDate, eventForm.eventAllDay],
  );
  const recurrenceSummary = useMemo(
    () =>
      eventForm.recurrenceRule
        ? getRecurringRuleSummary(eventForm.recurrenceRule)
        : "",
    [eventForm.recurrenceRule],
  );
  const bodyClass = desktop
    ? "px-3 py-2 space-y-3 flex-1 overflow-y-auto min-h-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0"
    : "p-4 space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar";
  const participantProfileByEmail = useMemo(
    () =>
      new Map(
        (eventForm.selectedEvent?.participants ?? []).map((participant) => [
          participant.email,
          participant,
        ]),
      ),
    [eventForm.selectedEvent?.participants],
  );

  const participantItems = useMemo(
    () =>
      [...(eventForm.eventParticipants ?? [])]
        .map((participant) => ({
          ...participant,
          image:
            participantProfileByEmail.get(participant.email)?.image ?? null,
        }))
        .sort((left, right) => {
          const roleDiff =
            (left.role === "organizer" ? 0 : 1) -
            (right.role === "organizer" ? 0 : 1);
          if (roleDiff !== 0) {
            return roleDiff;
          }

          return (left.displayName || left.email).localeCompare(
            right.displayName || right.email,
            undefined,
            { sensitivity: "base" },
          );
        }),
    [eventForm.eventParticipants, participantProfileByEmail],
  );
  const isCancelledEvent = eventForm.selectedEvent
    ? isCancelledCalendarEvent(eventForm.selectedEvent)
    : false;

  const addParticipant = useCallback(() => {
    const email = normalizeParticipantEmail(participantDraft);
    if (!email) {
      setParticipantError("Enter an email address first.");
      return;
    }

    if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) {
      setParticipantError("Enter a valid email address.");
      return;
    }

    if (participantItems.some((participant) => participant.email === email)) {
      setParticipantError("That participant is already invited.");
      return;
    }

    setParticipantError(null);
    setParticipantDraft("");
    eventForm.setEventParticipants([
      ...participantItems,
      {
        email,
        role: "attendee",
        status: "pending",
      },
    ]);
  }, [participantDraft, participantItems, eventForm]);

  const addParticipantFromSuggestion = useCallback(
    (entry: RecentContactEntry) => {
      const email = normalizeParticipantEmail(entry.email);
      if (!email) {
        return;
      }

      if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) {
        setParticipantError("Enter a valid email address.");
        return;
      }

      if (participantItems.some((participant) => participant.email === email)) {
        setParticipantError("That participant is already invited.");
        return;
      }

      setParticipantError(null);
      setParticipantDraft("");
      eventForm.setEventParticipants([
        ...participantItems,
        {
          email,
          displayName: entry.displayName?.trim() || undefined,
          role: "attendee",
          status: "pending",
        },
      ]);
    },
    [participantItems, eventForm],
  );

  const removeParticipant = useCallback(
    (email: string) => {
      eventForm.setEventParticipants(
        participantItems.filter((participant) => participant.email !== email),
      );
    },
    [participantItems, eventForm],
  );

  return (
    <div className={bodyClass}>
      {isViewMode ? (
        <div className="py-1.5">
          {isCancelledEvent && (
            <div className="px-2 pb-2">
              <Alert className="border-destructive/25 bg-destructive/[0.05]">
                <AlertTriangle className="text-destructive" />
                <AlertTitle className="text-destructive">
                  Cancelled event
                </AlertTitle>
                <AlertDescription>
                  <p>
                    The organiser cancelled this event. It stays on your
                    calendar until you remove it.
                  </p>
                  <p className="text-xs">
                    You can still review the original details below.
                  </p>
                </AlertDescription>
              </Alert>
            </div>
          )}
          <div className="px-2">
            <div className="flex items-center gap-3 p-2.5">
              <div className="flex items-center justify-center size-6 shrink-0">
                <CalendarIcon className="size-4 text-muted-foreground" />
              </div>
              <span
                className={
                  isCancelledEvent
                    ? "text-sm font-medium truncate flex-1 min-w-0 line-through text-muted-foreground"
                    : "text-sm font-medium truncate flex-1 min-w-0"
                }
              >
                {eventForm.eventTitle || "Untitled Event"}
              </span>
              {eventForm.selectedEvent?.id &&
                eventForm.selectedEvent.isSynced && (
                  <div className="flex items-center gap-1 shrink-0">
                    <SyncedEventInfoBadge />
                  </div>
                )}
            </div>
          </div>

          <div className="border-t border-border/50 mx-4 my-0.5" />

          <div className="px-2 py-1 space-y-0.5">
            <div className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/30 transition-colors">
              <div className="flex items-center justify-center size-6 shrink-0">
                <Clock className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <div className="text-sm">
                  {eventDateDisplay.isSameDay ? (
                    eventDateDisplay.label
                  ) : (
                    <>
                      {eventDateDisplay.startLabel}
                      <span className="text-muted-foreground mx-1">→</span>
                      {eventDateDisplay.endLabel}
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {!eventForm.eventAllDay
                    ? `${eventForm.eventStartTime} – ${eventForm.eventEndTime}`
                    : "All day"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/30 transition-colors">
              <div className="flex items-center justify-center size-6 shrink-0">
                <span
                  className="size-3 rounded-full ring-1 ring-border/60"
                  style={{
                    backgroundColor: getColorSwatchValue(
                      selectedCalendar?.color || "blue",
                    ),
                  }}
                  aria-hidden
                />
              </div>
              <span className="text-sm truncate flex-1 min-w-0">
                {selectedCalendar?.name || "Unknown Calendar"}
              </span>
            </div>

            {(eventForm.notificationsLoading || reminderMinutes.length > 0) && (
              <div className="flex items-start gap-3 p-2 rounded-md hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-center size-6 shrink-0 mt-0.5">
                  <Bell className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  {reminderMinutes.map((minutes) => (
                    <div
                      key={`email-reminder-${minutes}`}
                      className="flex items-baseline gap-2 text-sm leading-tight"
                    >
                      <span>{formatReminderMinutes(minutes)} before</span>
                      <span className="text-xs text-muted-foreground">
                        email
                      </span>
                    </div>
                  ))}
                  {eventForm.notificationsLoading &&
                    reminderMinutes.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        Loading reminders…
                      </span>
                    )}
                </div>
              </div>
            )}

            {eventForm.eventLocation && (
              <div className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-center size-6 shrink-0">
                  <MapPin className="size-4 text-muted-foreground" />
                </div>
                <span className="text-sm truncate">
                  {eventForm.eventLocation}
                </span>
              </div>
            )}

            {eventForm.eventDescription && (
              <div className="flex items-start gap-3 p-2 rounded-md hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-center size-6 shrink-0 mt-0.5">
                  <FileText className="size-4 text-muted-foreground" />
                </div>
                <span className="text-sm whitespace-pre-wrap flex-1 min-w-0">
                  {formatEventDescription(eventForm.eventDescription)}
                </span>
              </div>
            )}

            {eventForm.isRecurring && eventForm.recurrenceRule && (
              <div className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-center size-6 shrink-0">
                  <RotateCcw className="size-4 text-muted-foreground" />
                </div>
                <span className="text-sm">{recurrenceSummary}</span>
              </div>
            )}

            {participantItems.length > 0 && (
              <div className="flex items-start gap-3 p-2 rounded-md hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-center size-6 shrink-0 mt-0.5">
                  <Users className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  {participantItems.map((participant) => (
                    <div
                      key={participant.email}
                      className="flex items-center gap-3 min-w-0"
                    >
                      <Avatar className="size-8 border border-border/60">
                        <AvatarImage src={participant.image ?? undefined} alt={participant.email} />
                        <AvatarFallback className="text-[11px]">
                          {getParticipantInitials(participant)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">
                          {participant.displayName || participant.email}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {participant.role === "organizer"
                            ? "Organizer"
                            : formatParticipantStatus(participant.status)}
                          {participant.displayName ? ` · ${participant.email}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Input
            value={eventForm.eventTitle}
            onChange={(event) => eventForm.setEventTitle(event.target.value)}
            placeholder="Event title"
            className={`${desktop ? "h-9 text-sm" : "text-lg font-semibold h-10"}`}
          />

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Calendar</Label>
              <Select
                value={eventForm.eventCalendarId}
                onValueChange={eventForm.setEventCalendarId}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="Select calendar" />
                </SelectTrigger>
                <SelectContent>
                  {selectableCalendars.map((calendar) => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="size-2.5 rounded-full"
                          style={{
                            backgroundColor: getColorSwatchValue(
                              calendar.color,
                            ),
                          }}
                        />
                        <span>{calendar.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Date & Time</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {desktop ? (
                    <Popover
                      open={eventForm.startDateOpen}
                      onOpenChange={eventForm.setStartDateOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="flex-1 h-9 justify-start font-normal cursor-pointer bg-input border-0 shadow-none hover:bg-input/80 text-input-foreground"
                        >
                          <CalendarIcon className="mr-2 size-4 flex-shrink-0" />
                          {format(eventForm.eventStartDate, "EEE, MMM d")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarUI
                          mode="single"
                          selected={eventForm.eventStartDate}
                          weekStartsOn={1}
                          onSelect={(date) => {
                            if (!date) {
                              return;
                            }

                            eventForm.setEventStartDate(date);
                            if (date > eventForm.eventEndDate) {
                              eventForm.setEventEndDate(date);
                            }
                            eventForm.setStartDateOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <Drawer
                      open={eventForm.startDateOpen}
                      onOpenChange={(nextOpen) => {
                        if (nextOpen) {
                          eventForm.setEndDateOpen(false);
                        }
                        eventForm.setStartDateOpen(nextOpen);
                      }}
                    >
                      <DrawerTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-9 text-sm font-medium justify-start text-foreground cursor-pointer"
                        >
                          <CalendarIcon className="mr-2 size-4 flex-shrink-0" />
                          <span className="truncate">
                            {format(eventForm.eventStartDate, "EEE, MMM d")}
                          </span>
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent
                        responsive
                        responsiveHeight="80dvh"
                        className="pb-safe"
                      >
                        <DrawerTitle className="sr-only">
                          Select start date
                        </DrawerTitle>
                        <div className="flex justify-center p-4 pb-8">
                          <CalendarUI
                            mode="single"
                            selected={eventForm.eventStartDate}
                            weekStartsOn={1}
                            onSelect={(date) => {
                              if (!date) {
                                return;
                              }

                              eventForm.setEventStartDate(date);
                              if (date > eventForm.eventEndDate) {
                                eventForm.setEventEndDate(date);
                              }
                              eventForm.setStartDateOpen(false);
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

                  {desktop ? (
                    <Popover
                      open={eventForm.endDateOpen}
                      onOpenChange={eventForm.setEndDateOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="flex-1 h-9 justify-start font-normal cursor-pointer bg-input border-0 shadow-none hover:bg-input/80 text-input-foreground"
                        >
                          <CalendarIcon className="mr-2 size-4 flex-shrink-0" />
                          {format(eventForm.eventEndDate, "EEE, MMM d")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <CalendarUI
                          mode="single"
                          selected={eventForm.eventEndDate}
                          weekStartsOn={1}
                          disabled={(date) => date < eventForm.eventStartDate}
                          onSelect={(date) => {
                            if (!date) {
                              return;
                            }

                            eventForm.setEventEndDate(date);
                            eventForm.setEndDateOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <Drawer
                      open={eventForm.endDateOpen}
                      onOpenChange={(nextOpen) => {
                        if (nextOpen) {
                          eventForm.setStartDateOpen(false);
                        }
                        eventForm.setEndDateOpen(nextOpen);
                      }}
                    >
                      <DrawerTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-9 text-sm font-medium justify-start text-foreground cursor-pointer"
                        >
                          <CalendarIcon className="mr-2 size-4 flex-shrink-0" />
                          <span className="truncate">
                            {format(eventForm.eventEndDate, "EEE, MMM d")}
                          </span>
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent
                        responsive
                        responsiveHeight="80dvh"
                        className="pb-safe"
                      >
                        <DrawerTitle className="sr-only">
                          Select end date
                        </DrawerTitle>
                        <div className="flex justify-center p-4 pb-8">
                          <CalendarUI
                            mode="single"
                            selected={eventForm.eventEndDate}
                            weekStartsOn={1}
                            disabled={(date) => date < eventForm.eventStartDate}
                            onSelect={(date) => {
                              if (!date) {
                                return;
                              }

                              eventForm.setEventEndDate(date);
                              eventForm.setEndDateOpen(false);
                            }}
                            initialFocus
                          />
                        </div>
                      </DrawerContent>
                    </Drawer>
                  )}
                </div>

                {!eventForm.eventAllDay && (
                  <div className="flex items-center gap-2">
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
                      className={`flex-1 h-9 cursor-pointer ${desktop ? "bg-input border-0 shadow-none hover:bg-input/80 text-input-foreground" : ""}`}
                    />
                    <span className="text-muted-foreground text-sm font-medium">
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
                      className={`flex-1 h-9 cursor-pointer ${desktop ? "bg-input border-0 shadow-none hover:bg-input/80 text-input-foreground" : ""}`}
                    />
                  </div>
                )}

                {desktop ? (
                  <div className="flex items-center gap-2 py-1">
                    <Checkbox
                      id="event-all-day-checkbox"
                      checked={eventForm.eventAllDay}
                      onCheckedChange={(checked) =>
                        eventForm.setEventAllDay(checked === true)
                      }
                    />
                    <Label
                      htmlFor="event-all-day-checkbox"
                      className="text-sm cursor-pointer"
                    >
                      All day
                    </Label>
                  </div>
                ) : (
                  <div className="flex items-center justify-between w-full py-3 px-1">
                    <span className="text-sm font-medium text-foreground">
                      All day
                    </span>
                    <Switch
                      checked={eventForm.eventAllDay}
                      onCheckedChange={(checked) =>
                        eventForm.setEventAllDay(checked)
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {!desktop && (
            <div className="space-y-1.5">
              <Label className="text-sm">Options</Label>
              <EventEditorFieldToggles
                className="flex flex-wrap items-center gap-2"
                isRecurring={eventForm.isRecurring}
                onToggleDescription={() => setShowDescription(!showDescription)}
                onToggleLocation={() => setShowLocation(!showLocation)}
                onToggleNotifications={() =>
                  eventForm.setShowNotifications(!eventForm.showNotifications)
                }
                onToggleParticipants={() =>
                  setShowParticipants(!showParticipants)
                }
                onToggleRecurring={() =>
                  eventForm.setIsRecurring(!eventForm.isRecurring)
                }
                showDescription={showDescription}
                showLocation={showLocation}
                showNotifications={eventForm.showNotifications}
                showParticipants={showParticipants}
              />
            </div>
          )}

          {(showLocation ||
            showDescription ||
            eventForm.isRecurring ||
            eventForm.showNotifications ||
            showParticipants) && (
            <div className="space-y-3 pt-3 mt-3 border-t border-border/50">
              {showLocation && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <Input
                    value={eventForm.eventLocation}
                    onChange={(event) =>
                      eventForm.setEventLocation(event.target.value)
                    }
                    placeholder="Location"
                    className={`${desktop ? "h-9 text-sm" : "h-10"}`}
                  />
                </div>
              )}

              {showDescription && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <Textarea
                    value={eventForm.eventDescription}
                    onChange={(event) =>
                      eventForm.setEventDescription(event.target.value)
                    }
                    placeholder="Description..."
                    className={`min-h-[60px] text-sm resize-none ${desktop ? "h-9" : ""}`}
                  />
                </div>
              )}

              {eventForm.isRecurring && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
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
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <NotificationManager
                      eventId={eventForm.selectedEvent?.id}
                      notifications={eventForm.eventNotifications}
                      onChange={eventForm.handleNotificationChange}
                      loading={eventForm.notificationsLoading}
                    />
                  </div>
                </div>
              )}

              {showParticipants && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    <Label className="text-sm">Participants</Label>
                    <ParticipantsInviteInfo />
                  </div>

                  <div className="flex gap-2">
                    <RecipientSuggestInput
                      appearance="field"
                      mode="calendar"
                      value={participantDraft}
                      onChange={(value) => {
                        setParticipantDraft(value);
                        if (participantError) {
                          setParticipantError(null);
                        }
                      }}
                      onSelectSuggestion={addParticipantFromSuggestion}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addParticipant();
                        }
                      }}
                      placeholder="Add attendee by email"
                      className="flex-1"
                      inputClassName={desktop ? "h-9 text-sm" : "h-10"}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={addParticipant}
                    >
                      <UserPlus className="size-4" />
                    </Button>
                  </div>

                  {participantError && (
                    <p className="text-xs text-destructive">{participantError}</p>
                  )}

                  {participantItems.length > 0 ? (
                    <div className="rounded-lg border divide-y">
                      {participantItems.map((participant) => (
                        <div
                          key={participant.email}
                          className="flex items-center gap-3 px-3 py-2.5"
                        >
                          <Avatar className="size-9 border border-border/60">
                            <AvatarImage src={participant.image ?? undefined} alt={participant.email} />
                            <AvatarFallback className="text-[11px]">
                              {getParticipantInitials(participant)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm truncate">
                              {participant.displayName || participant.email}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {participant.role === "organizer" ? (
                                "Organizer"
                              ) : (
                                <>
                                  <Mail className="inline size-3 mr-1" />
                                  {participant.email}
                                </>
                              )}
                            </div>
                          </div>
                          {participant.role !== "organizer" && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0"
                              onClick={() => removeParticipant(participant.email)}
                            >
                              <X className="size-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
