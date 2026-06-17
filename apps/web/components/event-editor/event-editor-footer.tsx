import {
  canCurrentUserDeleteEvent,
  isCancelledCalendarEvent,
} from "@workspace/calendar-core";
import { Button } from "@workspace/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import { Check, ChevronDown, Download, Edit3, Loader2, Save, Trash2 } from "lucide-react";

import {
  canSaveEventEditor,
  isRecurringEventDeleteCandidate,
} from "@/lib/event-editor-view-model";
import type { EventEditorFooterProps } from "./types";

export function EventEditorFooter({
  canEditEvent,
  desktop,
  eventForm,
  handleEventDelete,
  handleEventDownloadIcs,
  handleEventSave,
  invitationResponsePending,
  invitationStatus,
  isViewMode,
  onInvitationResponse,
  onBack,
  onClose,
}: EventEditorFooterProps) {
  const isCancelledEvent = eventForm.selectedEvent
    ? isCancelledCalendarEvent(eventForm.selectedEvent)
    : false;
  const canDeleteEvent =
    Boolean(eventForm.selectedEvent?.id) &&
    canCurrentUserDeleteEvent(eventForm.selectedEvent);
  const deleteLabel =
    !canEditEvent && isCancelledEvent ? "Remove from calendar" : "Delete";

  const handleDelete = () => {
    if (isCancelledEvent) {
      handleEventDelete();
      return;
    }

    if (isRecurringEventDeleteCandidate(eventForm.selectedEvent)) {
      eventForm.setShowRecurringDeleteModal(true);
      return;
    }

    handleEventDelete();
  };

  const canSave = canSaveEventEditor({
    eventCalendarId: eventForm.eventCalendarId,
    eventSaving: eventForm.eventSaving,
    eventTitle: eventForm.eventTitle,
  });
  const showInvitationActions =
    Boolean(eventForm.selectedEvent?.id) && !canEditEvent && !isCancelledEvent;
  const invitationActions = showInvitationActions ? (
    <div className="flex items-center gap-2">
      {invitationStatus === null ? (
        <>
          <Button
            size="sm"
            disabled={invitationResponsePending !== null}
            onClick={() => void onInvitationResponse("accepted")}
            className="gap-1"
          >
            {invitationResponsePending === "accepted" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={invitationResponsePending !== null}
            onClick={() => void onInvitationResponse("tentative")}
          >
            {invitationResponsePending === "tentative" && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Maybe
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={invitationResponsePending !== null}
            onClick={() => void onInvitationResponse("declined")}
            className="text-muted-foreground"
          >
            {invitationResponsePending === "declined" && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Decline
          </Button>
        </>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="secondary"
              disabled={invitationResponsePending !== null}
              className="gap-1.5"
            >
              {invitationResponsePending !== null && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {invitationStatus === "declined"
                ? "Declined"
                : invitationStatus === "tentative"
                  ? "Maybe"
                  : "Accepted"}
              <ChevronDown className="size-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-28">
            <DropdownMenuItem
              onClick={() => void onInvitationResponse("accepted")}
              className={cn(invitationStatus === "accepted" && "font-medium")}
            >
              <Check
                className={cn(
                  "size-4",
                  invitationStatus !== "accepted" && "opacity-0",
                )}
              />
              Accept
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void onInvitationResponse("tentative")}
              className={cn(invitationStatus === "tentative" && "font-medium")}
            >
              <Check
                className={cn(
                  "size-4",
                  invitationStatus !== "tentative" && "opacity-0",
                )}
              />
              Maybe
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void onInvitationResponse("declined")}
              className={cn(invitationStatus === "declined" && "font-medium")}
            >
              <Check
                className={cn(
                  "size-4",
                  invitationStatus !== "declined" && "opacity-0",
                )}
              />
              Decline
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  ) : null;

  if (desktop) {
    return (
      <div className="px-3 py-2 border-t border-border/50 flex flex-row items-center gap-2 shrink-0">
        {isViewMode ? (
          <>
            {eventForm.selectedEvent?.id &&
              canDeleteEvent && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" /> {deleteLabel}
                </Button>
              )}
            {invitationActions}
            <div className="flex-1" />
            {eventForm.selectedEvent?.id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEventDownloadIcs}
              >
                <Download className="size-4" /> ICS
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            {eventForm.selectedEvent?.id &&
              !eventForm.selectedEvent.isSynced &&
              canEditEvent &&
              !isCancelledEvent && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => eventForm.setEventViewMode("edit")}
                  className="text-primary hover:bg-primary/10"
                >
                  <Edit3 className="size-4" /> Edit
                </Button>
              )}
          </>
        ) : (
          <>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleEventSave}
              disabled={!canEditEvent || !canSave}
            >
              {eventForm.eventSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Save
                </>
              )}
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-border/50 bg-muted/30 flex shrink-0 flex-row gap-3">
      {isViewMode ? (
        <>
          {eventForm.selectedEvent?.id &&
          canDeleteEvent && (
            <Button
              variant="outline"
              onClick={handleDelete}
              className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4 mr-2" /> {deleteLabel}
            </Button>
          )}
          {invitationActions}
          <div className="flex-1" />
          {eventForm.selectedEvent?.id && (
            <Button variant="outline" onClick={handleEventDownloadIcs}>
              <Download className="size-4 mr-2" /> ICS
            </Button>
          )}
          <Button variant="outline" onClick={onBack}>
            Close
          </Button>
          {eventForm.selectedEvent?.id &&
            !eventForm.selectedEvent.isSynced &&
            canEditEvent &&
            !isCancelledEvent && (
              <Button onClick={() => eventForm.setEventViewMode("edit")}>
                <Edit3 className="size-4 mr-2" /> Edit
              </Button>
            )}
        </>
      ) : (
        <>
          <Button
            variant="outline"
            onClick={
              eventForm.selectedEvent?.id
                ? () => eventForm.setEventViewMode("view")
                : onBack
            }
          >
            Cancel
          </Button>
          <div className="flex-1" />
          <Button
            onClick={handleEventSave}
            disabled={!canEditEvent || !canSave}
          >
            {eventForm.eventSaving ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Saving…
              </>
            ) : (
              <>
                <Save className="size-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
