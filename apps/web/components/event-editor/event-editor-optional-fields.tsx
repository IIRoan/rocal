import { NotificationManager } from "@workspace/ui/components/calendar";
import { Input } from "@workspace/ui/components/ui/input";
import { Textarea } from "@workspace/ui/components/ui/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { AlignLeft, Bell, MapPin, Users, X } from "lucide-react";
import type { EventParticipantInput, RecentContactEntry } from "@workspace/calendar-core";

import { RecipientSuggestInput } from "../mail/recipient-suggest-input";
import { SolaceAvatar } from "../solace-avatar";
import { formatParticipantStatus } from "./event-editor-participant-utils";
import { EventEditorRow } from "./event-editor-row";
import { fieldClass } from "./event-editor-styles";
import { ParticipantsInviteInfo } from "./participants-invite-info";
import type { EventEditorFormState } from "./types";

type ParticipantItem = EventParticipantInput & { image?: string | null };

function ParticipantList({
  desktop,
  onRemove,
  participants,
}: {
  desktop?: boolean;
  onRemove: (email: string) => void;
  participants: ParticipantItem[];
}) {
  return (
    <ul className="mt-1.5 space-y-0.5">
      {participants.map((participant) => {
        const name = participant.displayName || participant.email;
        return (
          <li
            key={participant.email}
            className="group/participant flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-accent/40"
          >
            <SolaceAvatar
              email={participant.email}
              name={participant.displayName}
              src={participant.image}
              className="size-7"
              title={name}
            />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm text-foreground">{name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {participant.role === "organizer"
                  ? "Organizer"
                  : participant.displayName
                    ? participant.email
                    : formatParticipantStatus(participant.status)}
              </div>
            </div>
            {participant.role !== "organizer" && (
              <button
                type="button"
                aria-label={`Remove ${name}`}
                title={`Remove ${name}`}
                onClick={() => onRemove(participant.email)}
                className={cn(
                  "tap-target flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,opacity] cursor-pointer outline-none hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50",
                  desktop && "opacity-0 group-hover/participant:opacity-100",
                )}
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

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
}: {
  desktop?: boolean;
  eventForm: EventEditorFormState;
  onAddParticipant: () => void;
  onAddParticipantFromSuggestion: (entry: RecentContactEntry) => void;
  onParticipantDraftChange: (value: string) => void;
  onRemoveParticipant: (email: string) => void;
  participantDraft: string;
  participantError: string | null;
  participantItems: ParticipantItem[];
}) {
  return (
    <>
      <EventEditorRow desktop={desktop} icon={Users} label="Participants">
        <div className="flex items-center gap-1">
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
            placeholder="Add participants"
            className="flex-1"
            inputClassName={fieldClass(desktop)}
          />
          <ParticipantsInviteInfo />
        </div>
        {participantError && (
          <p role="alert" className="px-1 pt-1 text-xs text-destructive">
            {participantError}
          </p>
        )}
        {participantItems.length > 0 && (
          <ParticipantList
            desktop={desktop}
            onRemove={onRemoveParticipant}
            participants={participantItems}
          />
        )}
      </EventEditorRow>

      <EventEditorRow desktop={desktop} icon={MapPin} label="Location">
        <Input
          value={eventForm.eventLocation}
          onChange={(event) => eventForm.setEventLocation(event.target.value)}
          placeholder="Add location"
          aria-label="Location"
          className={fieldClass(desktop)}
        />
      </EventEditorRow>

      <EventEditorRow desktop={desktop} icon={Bell} label="Reminders">
        <NotificationManager
          eventId={eventForm.selectedEvent?.id}
          notifications={eventForm.eventNotifications}
          onChange={(notifications) => {
            eventForm.handleNotificationChange(notifications);
            eventForm.setShowNotifications(notifications.length > 0);
          }}
          loading={eventForm.notificationsLoading}
          size={desktop ? "sm" : "md"}
        />
      </EventEditorRow>

      <EventEditorRow desktop={desktop} icon={AlignLeft} label="Description">
        <Textarea
          value={eventForm.eventDescription}
          onChange={(event) =>
            eventForm.setEventDescription(event.target.value)
          }
          placeholder="Add description"
          aria-label="Description"
          rows={3}
          className={cn(fieldClass(desktop), "h-auto min-h-20 resize-y py-2")}
        />
      </EventEditorRow>
    </>
  );
}
