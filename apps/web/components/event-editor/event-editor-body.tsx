import { useState } from "react";
import { isMailInvitationStagingCalendar } from "@workspace/calendar-core";
import { getColorSwatchValue } from "@workspace/ui/components/calendar";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import type { RecentContactEntry } from "@workspace/calendar-core";
import { normalizeParticipantEmail } from "@workspace/calendar-core";

import {
  getEnabledEmailReminderMinutes,
  getEventDateDisplay,
  getRecurringRuleSummary,
} from "@/lib/event-editor-view-model";
import { EventEditorDateTimeFields } from "./event-editor-datetime-fields";
import { EventEditorFieldToggles } from "./event-editor-field-toggles";
import { EventEditorOptionalFields } from "./event-editor-optional-fields";
import { EventEditorReadView } from "./event-editor-read-view";
import type { EventEditorBodyProps } from "./types";

export function EventEditorBody({
  calendars,
  desktop,
  eventForm,
  isViewMode,
  localSettings,
  setShowDescription,
  setShowLocation,
  setShowParticipants,
  visibleSections,
}: EventEditorBodyProps) {
  const [participantDraft, setParticipantDraft] = useState("");
  const [participantError, setParticipantError] = useState<string | null>(null);
  const showDescription = visibleSections.description;
  const showLocation = visibleSections.location;
  const showParticipants = visibleSections.participants;
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
    ? "px-3 py-2 space-y-3 flex-1 overflow-y-auto min-h-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0"
    : "p-4 space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar";
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

            <EventEditorDateTimeFields
              desktop={desktop}
              eventForm={eventForm}
              localSettings={localSettings}
            />
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
            showDescription={showDescription}
            showLocation={showLocation}
            showParticipants={showParticipants}
          />
        </div>
      )}
    </div>
  );
}
