"use client";

import {
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import { MailNotificationBanner } from "../mail-notification-banner";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";

export function MessageReaderCalendarCards({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const {
    mailCalendarInvite,
    currentCalendarInviteEvent,
    inviteDeclined,
    inviteCancelled,
    inviteResponsePending,
    cancelProcessPending,
    handleInvitationResponse,
    handleCancelRemove,
  } = controller;
  const { mailCalendarInviteMeta } = view;

  const invitationStatus =
    currentCalendarInviteEvent?.event?.participants?.find(
      (participant) =>
        participant.userId === currentCalendarInviteEvent.event?.userId &&
        participant.role !== "organizer",
    )?.status;
  const invitationRemovedFromCalendar = inviteDeclined;
  const shouldShowCalendarInviteCard = mailCalendarInvite?.method === "REQUEST";
  const isPending = !invitationStatus || invitationStatus === "pending";

  const calendarInviteCard = shouldShowCalendarInviteCard &&
    mailCalendarInvite && (

      <MailNotificationBanner
        inactive={invitationRemovedFromCalendar}
        title={mailCalendarInvite.title}
        meta={mailCalendarInviteMeta}
        headerAction={
            <div className="flex items-center gap-2">
              {currentCalendarInviteEvent?.loading ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Adding…
                </span>
              ) : currentCalendarInviteEvent?.error ? (
                <span className="text-xs text-destructive">
                  {currentCalendarInviteEvent.error}
                </span>
              ) : inviteDeclined ? (
                <span className="text-xs text-muted-foreground">
                  Declined, removed
                </span>
              ) : isPending ? (
                <>
                  <Button
                    size="xs"
                    disabled={inviteResponsePending !== null}
                    onClick={() => void handleInvitationResponse("accepted")}
                    className="gap-1"
                  >
                    {inviteResponsePending === "accepted" ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Check className="size-3" />
                    )}
                    Accept
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={inviteResponsePending !== null}
                    onClick={() => void handleInvitationResponse("tentative")}
                  >
                    {inviteResponsePending === "tentative" && (
                      <Loader2 className="size-3 animate-spin" />
                    )}
                    Maybe
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={inviteResponsePending !== null}
                    onClick={() => void handleInvitationResponse("declined")}
                    className="text-muted-foreground"
                  >
                    {inviteResponsePending === "declined" && (
                      <Loader2 className="size-3 animate-spin" />
                    )}
                    Decline
                  </Button>
                </>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={inviteResponsePending !== null}
                      className="gap-1.5"
                    >
                      {inviteResponsePending !== null && (
                        <Loader2 className="size-3 animate-spin" />
                      )}
                      {invitationStatus === "tentative" ? "Maybe" : "Accepted"}
                      <ChevronDown className="size-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-28">
                    <DropdownMenuItem
                      onClick={() => void handleInvitationResponse("accepted")}
                      className={cn(
                        invitationStatus === "accepted" && "font-medium",
                      )}
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
                      onClick={() => void handleInvitationResponse("tentative")}
                      className={cn(
                        invitationStatus === "tentative" && "font-medium",
                      )}
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
                      onClick={() => void handleInvitationResponse("declined")}
                    >
                      <Check className="size-4 opacity-0" />
                      Decline
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {currentCalendarInviteEvent?.event &&
                !invitationRemovedFromCalendar && (
                  <Button
                    asChild
                    variant="secondary"
                    size="xs"
                    className="gap-1.5"
                  >
                    <a
                      href={`/calendar?eventId=${encodeURIComponent(currentCalendarInviteEvent.event.id)}`}
                    >
                      Open
                      <ExternalLink className="size-3" />
                    </a>
                  </Button>
                )}
            </div>
        }
      />
    
    );

  const shouldShowCalendarCancellationCard =
    mailCalendarInvite?.method === "CANCEL";
  const calendarCancellationCard = shouldShowCalendarCancellationCard &&
    mailCalendarInvite && (

      <MailNotificationBanner
        variant="invitationCancelled"
        title={mailCalendarInvite.title}
        description="The organiser cancelled this event. Solace keeps it visible until you remove it yourself."
        meta={mailCalendarInviteMeta}
        actions={
          currentCalendarInviteEvent?.loading ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Checking calendar…
            </span>
          ) : inviteCancelled ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-success">
              <Check className="size-3" />
              Removed from your calendar
            </span>
          ) : currentCalendarInviteEvent?.event ? (
            <>
              <span className="text-xs text-muted-foreground">
                This cancelled copy is still on your calendar.
              </span>
              <Button
                size="xs"
                variant="outline"
                disabled={cancelProcessPending}
                onClick={() => void handleCancelRemove()}
                className="ml-auto gap-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {cancelProcessPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
                Remove from calendar
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              This cancellation was already applied in your calendar.
            </span>
          )
        }
      />
    
    );

  return (
    <>
      {calendarInviteCard}
      {calendarCancellationCard}
    </>
  );
}
