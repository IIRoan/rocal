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
  Bell,
  CalendarIcon,
  Clock,
  CloudDownload,
  FileText,
  MapPin,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Server,
  Users,
} from "lucide-react";

import { SolaceAvatar } from "../solace-avatar";
import { stopEventPropagation } from "@/lib/event-propagation";
import { formatReminderMinutes } from "@/lib/event-editor-view-model";
import type { EventEditorFormState } from "./types";
import { formatParticipantStatus } from "./event-editor-participant-utils";
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

  return (
    <div className="py-1.5">
      {isCancelledEvent && (
        <div className="px-2 pb-2">
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
          {eventForm.selectedEvent?.id && eventForm.selectedEvent.isSynced && (
            <div className="flex items-center gap-1 shrink-0">
              <SyncedEventInfoBadge />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border/50 mx-4 my-0.5" />

      <div className="px-2 py-1 space-y-0.5">
        <div className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/30">
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

        <div className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/30">
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
          <div className="flex items-start gap-3 p-2 rounded-md hover:bg-accent/30">
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
                  <span className="text-xs text-muted-foreground">email</span>
                </div>
              ))}
              {eventForm.notificationsLoading && reminderMinutes.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Loading reminders…
                </span>
              )}
            </div>
          </div>
        )}

        {eventForm.eventLocation && (
          <div className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/30">
            <div className="flex items-center justify-center size-6 shrink-0">
              <MapPin className="size-4 text-muted-foreground" />
            </div>
            <span className="text-sm truncate">{eventForm.eventLocation}</span>
          </div>
        )}

        {eventForm.eventDescription && (
          <div className="flex items-start gap-3 p-2 rounded-md hover:bg-accent/30">
            <div className="flex items-center justify-center size-6 shrink-0 mt-0.5">
              <FileText className="size-4 text-muted-foreground" />
            </div>
            <span className="text-sm whitespace-pre-wrap flex-1 min-w-0">
              {formatEventDescription(eventForm.eventDescription)}
            </span>
          </div>
        )}

        {eventForm.isRecurring && eventForm.recurrenceRule && (
          <div className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/30">
            <div className="flex items-center justify-center size-6 shrink-0">
              <RotateCcw className="size-4 text-muted-foreground" />
            </div>
            <span className="text-sm">{recurrenceSummary}</span>
          </div>
        )}

        {hasOptionalEventParticipants(participantItems) && (
          <div className="flex items-start gap-3 p-2 rounded-md hover:bg-accent/30">
            <div className="flex items-center justify-center size-6 shrink-0 mt-0.5">
              <Users className="size-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {participantItems.map((participant) => (
                <div
                  key={participant.email}
                  className="flex items-center gap-3 min-w-0"
                >
                  <SolaceAvatar
                    email={participant.email}
                    name={participant.displayName}
                    src={participant.image}
                    className="size-8 border border-border/60"
                    title={participant.displayName || participant.email}
                  />
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
  );
}
