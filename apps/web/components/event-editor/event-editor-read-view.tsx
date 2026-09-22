import {
  hasOptionalEventParticipants,
  isCancelledCalendarEvent,
} from "@workspace/calendar-core";
import { formatEventDescription } from "@workspace/ui/components/calendar";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/ui/alert";
import { getColorSwatchValue } from "@workspace/ui/components/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import {
  AlertTriangle,
  AlignLeft,
  Bell,
  CalendarDays,
  Clock,
  CloudDownload,
  MapPin,
  RefreshCw,
  Server,
  Users,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

import { SolaceAvatar } from "../solace-avatar";
import { stopEventPropagation } from "@/lib/event-propagation";
import { formatReminderMinutes } from "@/lib/event-editor-view-model";
import type { EventEditorFormState } from "./types";
import { formatParticipantStatus } from "./event-editor-participant-utils";
import { EventEditorRow } from "./event-editor-row";
import type { EventParticipantInput } from "@workspace/calendar-core";
import type { PickerDateRangeDisplay } from "@workspace/calendar-core";

function SyncedEventInfoBadge() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Synced from external calendar"
          className="tap-target inline-flex items-center justify-center size-5 rounded-md text-foreground/60 hover:text-foreground hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
                Title, time, location and description are pulled in so Solace can
                render the event and trigger reminders.
              </p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function EventEditorReadView({
  eventDateDisplay,
  eventForm,
  participantItems,
  recurrenceSummary,
  reminderMinutes,
  selectedCalendar,
}: {
  eventDateDisplay: PickerDateRangeDisplay;
  eventForm: EventEditorFormState;
  participantItems: Array<
    EventParticipantInput & { image?: string | null }
  >;
  recurrenceSummary: string;
  reminderMinutes: number[];
  selectedCalendar?: { color?: string; name?: string } | null;
}) {
  const isCancelledEvent = eventForm.selectedEvent
    ? isCancelledCalendarEvent(eventForm.selectedEvent)
    : false;

  const swatch = getColorSwatchValue(selectedCalendar?.color || "blue");

  return (
    <div className="space-y-3 py-1">
      {isCancelledEvent && (
        <Alert className="border-destructive/25 bg-destructive/[0.05]">
          <AlertTriangle className="text-destructive" />
          <AlertTitle className="text-destructive">Cancelled event</AlertTitle>
          <AlertDescription>
            <p>
              The organiser cancelled this event. It stays on your calendar
              until you remove it.
            </p>
            <p className="text-xs">
              You can still review the original details below.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-1.5 h-5 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: swatch }}
        />
        <h3
          className={cn(
            "min-w-0 flex-1 break-words text-xl font-semibold leading-snug text-foreground",
            isCancelledEvent && "line-through text-muted-foreground",
          )}
        >
          {eventForm.eventTitle || "Untitled event"}
        </h3>
        {eventForm.selectedEvent?.id && eventForm.selectedEvent.isSynced && (
          <div className="flex h-8 items-center shrink-0">
            <SyncedEventInfoBadge />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <EventEditorRow desktop icon={Clock} label="Date and time">
          <div className="py-2 text-sm leading-snug">
            <div className="text-foreground">
              {eventDateDisplay.isSameDay ? (
                eventDateDisplay.label
              ) : (
                <>
                  {eventDateDisplay.startLabel}
                  <span className="mx-1 text-muted-foreground">–</span>
                  {eventDateDisplay.endLabel}
                </>
              )}
            </div>
            <div className="text-muted-foreground">
              {eventForm.eventAllDay
                ? "All day"
                : `${eventForm.eventStartTime} – ${eventForm.eventEndTime}`}
              {eventForm.isRecurring && eventForm.recurrenceRule && (
                <> · {recurrenceSummary}</>
              )}
            </div>
          </div>
        </EventEditorRow>

        <EventEditorRow desktop icon={CalendarDays} label="Calendar">
          <div className="flex min-h-9 items-center gap-2 text-sm text-foreground">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: swatch }}
            />
            <span className="truncate">
              {selectedCalendar?.name || "Unknown calendar"}
            </span>
          </div>
        </EventEditorRow>

        {hasOptionalEventParticipants(participantItems) && (
          <EventEditorRow desktop icon={Users} label="Participants">
            <div className="flex min-h-9 items-center text-sm text-muted-foreground">
              {participantItems.length}{" "}
              {participantItems.length === 1 ? "participant" : "participants"}
            </div>
            <ul className="space-y-1.5 pb-1">
              {participantItems.map((participant) => (
                <li
                  key={participant.email}
                  className="flex items-center gap-2.5 min-w-0"
                >
                  <SolaceAvatar
                    email={participant.email}
                    name={participant.displayName}
                    src={participant.image}
                    className="size-7"
                    title={participant.displayName || participant.email}
                  />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-sm text-foreground">
                      {participant.displayName || participant.email}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {participant.role === "organizer"
                        ? "Organizer"
                        : formatParticipantStatus(participant.status)}
                      {participant.displayName ? ` · ${participant.email}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </EventEditorRow>
        )}

        {eventForm.eventLocation && (
          <EventEditorRow desktop icon={MapPin} label="Location">
            <div className="py-2 text-sm leading-snug text-foreground break-words">
              {eventForm.eventLocation}
            </div>
          </EventEditorRow>
        )}

        {(eventForm.notificationsLoading || reminderMinutes.length > 0) && (
          <EventEditorRow desktop icon={Bell} label="Reminders">
            <div className="py-2 text-sm leading-snug text-foreground">
              {reminderMinutes.length > 0
                ? reminderMinutes
                    .map((minutes) => `${formatReminderMinutes(minutes)} before`)
                    .join(", ")
                : <span className="text-muted-foreground">Loading reminders…</span>}
            </div>
          </EventEditorRow>
        )}

        {eventForm.eventDescription && (
          <EventEditorRow desktop icon={AlignLeft} label="Description">
            <div className="py-2 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
              {formatEventDescription(eventForm.eventDescription)}
            </div>
          </EventEditorRow>
        )}
      </div>
    </div>
  );
}
