import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { isMailInvitationStagingCalendar } from "@workspace/calendar-core";
import { getColorSwatchValue } from "@workspace/ui/components/calendar";
import { Input } from "@workspace/ui/components/ui/input";
import { cn } from "@workspace/ui/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import type { RecentContactEntry } from "@workspace/calendar-core";
import { isReservedSystemEmail, normalizeParticipantEmail } from "@workspace/calendar-core";

import {
  getEnabledEmailReminderMinutes,
  getEventDateDisplay,
  getRecurringRuleSummary,
} from "@/lib/event-editor-view-model";
import { EventEditorDateTimeFields } from "./event-editor-datetime-fields";
import { EventEditorOptionalFields } from "./event-editor-optional-fields";
import { EventEditorReadView } from "./event-editor-read-view";
import { EventEditorRow } from "./event-editor-row";
import { chipClass } from "./event-editor-styles";
import type { EventEditorBodyProps } from "./types";

export function EventEditorBody({
  calendars,
  desktop,
  eventForm,
  isViewMode,
  localSettings,
  onSubmit,
}: EventEditorBodyProps) {
  const [participantDraft, setParticipantDraft] = useState("");
  const [participantError, setParticipantError] = useState<string | null>(null);
  const selectedCalendar = calendars.find(
    (calendar) => calendar.id === eventForm.eventCalendarId,
  );
  const selectableCalendars = calendars.filter(
    (calendar) =>
      !calendar.isSyncOnly && !isMailInvitationStagingCalendar(calendar),
  );
  const reminderMinutes = getEnabledEmailReminderMinutes(
    eventForm.eventNotifications ?? [],
  );
  const eventDateDisplay = getEventDateDisplay(
    eventForm.eventStartDate,
    eventForm.eventEndDate,
    {
      allDay: eventForm.eventAllDay,
    },
  );
  const recurrenceSummary = eventForm.recurrenceRule
    ? getRecurringRuleSummary(eventForm.recurrenceRule)
    : "";
  const bodyClass = desktop
    ? "px-4 pt-1 pb-3 flex-1 overflow-y-auto min-h-0 [scrollbar-width:thin]"
    : "px-4 py-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar";
  const participantProfileByEmail = new Map(
    (eventForm.selectedEvent?.participants ?? []).map((participant) => [
      participant.email,
      participant,
    ]),
  );

  const participantItems = [...(eventForm.eventParticipants ?? [])]
    .map((participant) => ({
      ...participant,
      image: participantProfileByEmail.get(participant.email)?.image ?? null,
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
    });

  function addParticipant() {
    const email = normalizeParticipantEmail(participantDraft);
    if (!email) {
      setParticipantError("Enter an email address first.");
      return;
    }

    if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) {
      setParticipantError("Enter a valid email address.");
      return;
    }

    if (isReservedSystemEmail(email)) {
      setParticipantError("Cannot invite system or administrative addresses.");
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
  }

  function addParticipantFromSuggestion(entry: RecentContactEntry) {
    const email = normalizeParticipantEmail(entry.email);
    if (!email || isReservedSystemEmail(email)) {
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
  }

  function removeParticipant(email: string) {
    eventForm.setEventParticipants(
      participantItems.filter((participant) => participant.email !== email),
    );
  }

  return (
    <div className={bodyClass}>
      {isViewMode ? (
        <EventEditorReadView
          eventDateDisplay={eventDateDisplay}
          eventForm={eventForm}
          participantItems={participantItems}
          recurrenceSummary={recurrenceSummary}
          reminderMinutes={reminderMinutes}
          selectedCalendar={selectedCalendar}
        />
      ) : (
        <div className="space-y-2.5">
          <Input
            value={eventForm.eventTitle}
            onChange={(event) => eventForm.setEventTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Add title"
            aria-label="Event title"
            autoFocus={desktop && !eventForm.selectedEvent?.id}
            className="-mx-2 h-11 w-[calc(100%+1rem)] rounded-md border-0 bg-transparent px-2 text-xl font-semibold text-foreground shadow-none placeholder:text-muted-foreground/70 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:ring-0"
          />

          <EventEditorDateTimeFields
            desktop={desktop}
            eventForm={eventForm}
            localSettings={localSettings}
          />

          <EventEditorRow desktop={desktop} icon={CalendarDays} label="Calendar">
            <Select
              value={eventForm.eventCalendarId}
              onValueChange={eventForm.setEventCalendarId}
            >
              <SelectTrigger
                aria-label="Calendar"
                className={cn(chipClass(desktop), "w-auto max-w-full gap-2 [&>svg]:opacity-60")}
              >
                <SelectValue placeholder="Select calendar" />
              </SelectTrigger>
              <SelectContent>
                {selectableCalendars.map((calendar) => (
                  <SelectItem key={calendar.id} value={calendar.id}>
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full"
                        style={{
                          backgroundColor: getColorSwatchValue(calendar.color),
                        }}
                      />
                      <span>{calendar.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </EventEditorRow>

          <EventEditorOptionalFields
            desktop={desktop}
            eventForm={eventForm}
            onAddParticipant={addParticipant}
            onAddParticipantFromSuggestion={addParticipantFromSuggestion}
            onParticipantDraftChange={(value) => {
              setParticipantDraft(value);
              if (participantError) {
                setParticipantError(null);
              }
            }}
            onRemoveParticipant={removeParticipant}
            participantDraft={participantDraft}
            participantError={participantError}
            participantItems={participantItems}
          />
        </div>
      )}
    </div>
  );
}
