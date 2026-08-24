import { NotificationManager } from "@workspace/ui/components/calendar";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Textarea } from "@workspace/ui/components/ui/textarea";
import { Mail, UserPlus, Users, X } from "lucide-react";
import type { EventParticipantInput, RecentContactEntry } from "@workspace/calendar-core";

import { RecurringEventForm } from "../command-palette/recurring-event-form";
import { RecipientSuggestInput } from "../mail/recipient-suggest-input";
import { SolaceAvatar } from "../solace-avatar";
import { ParticipantsInviteInfo } from "./participants-invite-info";
import type { EventEditorFormState } from "./types";

const OPTIONAL_SECTION_ENTER = "animate-fade-in";

export function EventEditorOptionalFields({
  desktop,
  eventForm,
  onAddParticipant,
  onAddParticipantFromSuggestion,
  onParticipantDraftChange,
  onRemoveParticipant,
  participantDraft,
  participantError,
  participantItems,
  showDescription,
  showLocation,
  showParticipants,
}: {
  desktop?: boolean;
  eventForm: EventEditorFormState;
  onAddParticipant: () => void;
  onAddParticipantFromSuggestion: (entry: RecentContactEntry) => void;
  onParticipantDraftChange: (value: string) => void;
  onRemoveParticipant: (email: string) => void;
  participantDraft: string;
  participantError: string | null;
  participantItems: Array<EventParticipantInput & { image?: string | null }>;
  showDescription: boolean;
  showLocation: boolean;
  showParticipants: boolean;
}) {
  if (
    !showLocation &&
    !showDescription &&
    !eventForm.isRecurring &&
    !eventForm.showNotifications &&
    !showParticipants
  ) {
    return null;
  }

  return (
    <div className="space-y-3 pt-3 mt-3 border-t border-border/50">
      {showLocation && (
        <div className={OPTIONAL_SECTION_ENTER}>
          <Input
            value={eventForm.eventLocation}
            onChange={(event) => eventForm.setEventLocation(event.target.value)}
            placeholder="Location"
            className={`${desktop ? "h-9 text-sm" : "h-10"}`}
          />
        </div>
      )}

      {showDescription && (
        <div className={OPTIONAL_SECTION_ENTER}>
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
        <div className={OPTIONAL_SECTION_ENTER}>
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
        <div className={OPTIONAL_SECTION_ENTER}>
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
        <div className={`${OPTIONAL_SECTION_ENTER} space-y-2`}>
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
              onChange={onParticipantDraftChange}
              onSelectSuggestion={onAddParticipantFromSuggestion}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAddParticipant();
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
              onClick={onAddParticipant}
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
                  <SolaceAvatar
                    email={participant.email}
                    name={participant.displayName}
                    src={participant.image}
                    className="size-9 border border-border/60"
                    title={participant.displayName || participant.email}
                  />
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
                      onClick={() => onRemoveParticipant(participant.email)}
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
  );
}
