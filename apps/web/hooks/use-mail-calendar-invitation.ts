import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CalendarEvent } from "@workspace/calendar-core";
import {
  getErrorMessage,
  invitationByExternalIdQueryKey,
  isUserDeclinedInvitationEvent,
} from "@workspace/calendar-core";
import { calendarApiService } from "@/lib/calendar-api-service";
import {
  extractMailCalendarInvite,
  hasCalendarInvitationMetadata,
  type MailCalendarInvite,
} from "@/lib/mail/calendar-invite";
import type { JmapEmailMessage, MailAttachment } from "@/lib/mail/types";

type InvitationResponseStatus = "accepted" | "declined" | "tentative";

type CalendarInviteEventState = {
  eventId: string;
  event: CalendarEvent | null;
  loading: boolean;
  error: string | null;
};

type UseMailCalendarInvitationInput = {
  message?: JmapEmailMessage | null;
  plaintext?: string | null;
  attachments?: MailAttachment[] | null;
  enabled?: boolean;
};

function eventHasRemoteSync(event: CalendarEvent | null | undefined): boolean {
  return Boolean(event?.stalwartEventId);
}

export function useMailCalendarInvitation({
  message,
  plaintext,
  attachments,
  enabled = true,
}: UseMailCalendarInvitationInput) {
  const queryClient = useQueryClient();
  const [calendarInviteEvent, setCalendarInviteEvent] =
    useState<CalendarInviteEventState | null>(null);
  const [inviteResponsePending, setInviteResponsePending] =
    useState<InvitationResponseStatus | null>(null);
  const [inviteDeclined, setInviteDeclined] = useState(false);
  const [inviteCancelled, setInviteCancelled] = useState(false);
  const [cancelProcessPending, setCancelProcessPending] = useState(false);

  const hasCalendarInvitationHint = useMemo(
    () => (message ? hasCalendarInvitationMetadata(message) : false),
    [message],
  );

  const mailCalendarInvite = useMemo(
    () =>
      extractMailCalendarInvite({
        message,
        plaintext,
        attachments,
      }),
    [attachments, message, plaintext],
  );

  const mailCalendarInviteUid = mailCalendarInvite?.uid ?? null;

  const {
    data: existingInvitation,
    isFetching: isInvitationFetching,
    refetch: refetchInvitation,
  } = useQuery({
    queryKey: mailCalendarInviteUid
      ? invitationByExternalIdQueryKey(mailCalendarInviteUid)
      : ["invitations", "by-external-id", "disabled"],
    queryFn: () =>
      calendarApiService.getInvitationByExternalId(mailCalendarInviteUid!, {
        syncRemote: false,
      }),
    enabled: Boolean(enabled && mailCalendarInviteUid),
  });

  useEffect(() => {
    setInviteDeclined(false);
    setInviteCancelled(false);
    setCancelProcessPending(false);
  }, [message?.id]);

  useEffect(() => {
    if (!enabled || !mailCalendarInviteUid || isInvitationFetching) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const existing = existingInvitation ?? null;
        if (cancelled) return;

        if (mailCalendarInvite?.method === "CANCEL") {
          const importSummary = mailCalendarInvite.icsContent
            ? await calendarApiService.importInvitationIcs(
                mailCalendarInvite.icsContent,
              )
            : null;
          if (cancelled) return;

          void queryClient.invalidateQueries({ queryKey: ["events"] });
          await refetchInvitation();
          const event = await calendarApiService.getInvitationByExternalId(
            mailCalendarInviteUid,
            { syncRemote: false },
          );
          if (cancelled) return;

          setInviteCancelled(false);
          setCalendarInviteEvent({
            eventId: mailCalendarInviteUid,
            event,
            loading: false,
            error:
              !event && importSummary && importSummary.errors.length > 0
                ? (importSummary.errors[0] ??
                  "Unable to process cancellation details.")
                : null,
          });
          return;
        }

        if (inviteDeclined) {
          setCalendarInviteEvent({
            eventId: mailCalendarInviteUid,
            event: null,
            loading: false,
            error: null,
          });
          return;
        }

        if (existing) {
          if (isUserDeclinedInvitationEvent(existing)) {
            setInviteDeclined(true);
            setCalendarInviteEvent({
              eventId: mailCalendarInviteUid,
              event: null,
              loading: false,
              error: null,
            });
            return;
          }

          const sealed = await calendarApiService.sealImportedInvitationIfNeeded(
            existing,
          );
          void queryClient.invalidateQueries({ queryKey: ["events"] });
          setInviteDeclined(false);
          setCalendarInviteEvent({
            eventId: mailCalendarInviteUid,
            event: sealed,
            loading: false,
            error: null,
          });
          return;
        }

        const importSummary = mailCalendarInvite?.icsContent
          ? await calendarApiService.importInvitationIcs(
              mailCalendarInvite.icsContent,
            )
          : null;
        if (cancelled) return;

        if (importSummary && importSummary.errors.length > 0) {
          setCalendarInviteEvent({
            eventId: mailCalendarInviteUid,
            event: null,
            loading: false,
            error:
              importSummary.errors[0] ??
              "Unable to add this invitation to your calendar.",
          });
          return;
        }

        await refetchInvitation();
        const event = await calendarApiService.getInvitationByExternalId(
          mailCalendarInviteUid,
          { syncRemote: false },
        );
        if (cancelled) return;

        void queryClient.invalidateQueries({ queryKey: ["events"] });

        const sealed = event
          ? await calendarApiService.sealImportedInvitationIfNeeded(event)
          : null;

        setInviteDeclined(false);
        setCalendarInviteEvent({
          eventId: mailCalendarInviteUid,
          event: sealed,
          loading: false,
          error: sealed
            ? null
            : "Invitation was staged but could not be loaded.",
        });
      } catch (error) {
        if (cancelled) return;
        setCalendarInviteEvent({
          eventId: mailCalendarInviteUid,
          event: null,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load invitation details.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    existingInvitation,
    inviteDeclined,
    isInvitationFetching,
    mailCalendarInvite?.icsContent,
    mailCalendarInvite?.method,
    mailCalendarInviteUid,
    message?.id,
    queryClient,
    refetchInvitation,
  ]);

  const currentCalendarInviteEvent = useMemo(() => {
    if (!mailCalendarInviteUid) return null;
    if (calendarInviteEvent?.eventId === mailCalendarInviteUid) {
      return calendarInviteEvent;
    }
    return {
      eventId: mailCalendarInviteUid,
      event: null,
      loading: true,
      error: null,
    };
  }, [calendarInviteEvent, mailCalendarInviteUid]);

  const invalidateInvitationLookup = useCallback(async () => {
    if (!mailCalendarInviteUid) {
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: invitationByExternalIdQueryKey(mailCalendarInviteUid),
    });
  }, [mailCalendarInviteUid, queryClient]);

  const handleInvitationResponse = useCallback(
    async (status: InvitationResponseStatus) => {
      if (!mailCalendarInviteUid) return;

      const calendarInviteResponseEventId =
        currentCalendarInviteEvent?.event?.id ?? null;
      const calendarInviteHasRemoteSync = eventHasRemoteSync(
        currentCalendarInviteEvent?.event,
      );

      setInviteResponsePending(status);
      try {
        const shouldRespondViaIcs =
          !calendarInviteResponseEventId || !calendarInviteHasRemoteSync;

        if (shouldRespondViaIcs) {
          if (!mailCalendarInvite?.icsContent) {
            throw new Error("Invitation details are unavailable.");
          }

          if (status === "declined") {
            await calendarApiService.declineInvitationIcs(
              mailCalendarInvite.icsContent,
            );
            if (calendarInviteResponseEventId) {
              await calendarApiService.deleteEvent(calendarInviteResponseEventId);
            }
            setInviteDeclined(true);
            setCalendarInviteEvent({
              eventId: mailCalendarInviteUid,
              event: null,
              loading: false,
              error: null,
            });
            void queryClient.invalidateQueries({ queryKey: ["events"] });
            await invalidateInvitationLookup();
            toast.success("Invitation declined.");
            return;
          }

          const importSummary = await calendarApiService.importInvitationIcs(
            mailCalendarInvite.icsContent,
            { status },
          );
          if (importSummary.errors.length > 0) {
            throw new Error(
              importSummary.errors[0] ??
                "Unable to add this invitation to your calendar.",
            );
          }

          const event = await calendarApiService.getInvitationByExternalId(
            mailCalendarInviteUid,
            { syncRemote: false },
          );
          if (!event) {
            throw new Error("Invitation was accepted but could not be loaded.");
          }

          const sealed =
            await calendarApiService.sealImportedInvitationIfNeeded(event);

          void queryClient.invalidateQueries({ queryKey: ["events"] });
          await invalidateInvitationLookup();
          setInviteDeclined(false);
          setCalendarInviteEvent({
            eventId: mailCalendarInviteUid,
            event: sealed,
            loading: false,
            error: null,
          });
          toast.success(
            status === "accepted"
              ? "Invitation accepted."
              : "Marked as tentative.",
          );
          return;
        }

        const result = await calendarApiService.respondToInvitation(
          calendarInviteResponseEventId,
          status,
        );
        void queryClient.invalidateQueries({ queryKey: ["events"] });
        await invalidateInvitationLookup();
        if ("deleted" in result && result.deleted) {
          setInviteDeclined(true);
          setCalendarInviteEvent({
            eventId: mailCalendarInviteUid,
            event: null,
            loading: false,
            error: null,
          });
          toast.success("Invitation declined and removed from your calendar.");
        } else {
          const sealed =
            await calendarApiService.sealImportedInvitationIfNeeded(
              result as CalendarEvent,
            );
          setInviteDeclined(false);
          setCalendarInviteEvent({
            eventId: mailCalendarInviteUid,
            event: sealed,
            loading: false,
            error: null,
          });
          toast.success(
            status === "accepted"
              ? "Invitation accepted."
              : "Marked as tentative.",
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update invitation response.",
        );
      } finally {
        setInviteResponsePending(null);
      }
    },
    [
      currentCalendarInviteEvent?.event,
      invalidateInvitationLookup,
      mailCalendarInvite,
      mailCalendarInviteUid,
      queryClient,
    ],
  );

  const handleCancelRemove = useCallback(async () => {
    const calendarCancellationEventId =
      currentCalendarInviteEvent?.event?.id ?? null;
    if (!calendarCancellationEventId || !mailCalendarInviteUid) return;

    setCancelProcessPending(true);
    try {
      await calendarApiService.deleteEvent(calendarCancellationEventId);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      await invalidateInvitationLookup();
      setInviteCancelled(true);
      setCalendarInviteEvent({
        eventId: mailCalendarInviteUid,
        event: null,
        loading: false,
        error: null,
      });
      toast.success("Cancelled event removed from your calendar.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to remove event."));
    } finally {
      setCancelProcessPending(false);
    }
  }, [
    currentCalendarInviteEvent?.event?.id,
    invalidateInvitationLookup,
    mailCalendarInviteUid,
    queryClient,
  ]);

  return {
    hasCalendarInvitationHint,
    mailCalendarInvite,
    currentCalendarInviteEvent,
    inviteDeclined,
    inviteCancelled,
    inviteResponsePending,
    cancelProcessPending,
    handleInvitationResponse,
    handleCancelRemove,
  };
}

export type { MailCalendarInvite, InvitationResponseStatus };
