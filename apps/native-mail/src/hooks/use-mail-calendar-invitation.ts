import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CalendarEvent,
  InvitationResponseStatus,
} from "@workspace/calendar-core";
import { respondToMailInvitation } from "@workspace/calendar-client";
import { invitationByExternalIdQueryKey, isUserDeclinedInvitationEvent } from "@workspace/calendar-core";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import {
  extractMailCalendarInvite,
  hasCalendarInvitationMetadata,
  listCalendarAttachmentCandidates,
} from "../lib/mail/calendar-invite";
import type { JmapAttachment, JmapEmailMessage } from "../lib/mail/types";
import type { MailRuntime } from "../lib/mail/mail-runtime";


type CalendarInviteEventState = {
  eventId: string;
  event: CalendarEvent | null;
  loading: boolean;
  error: string | null;
};

type UseMailCalendarInvitationInput = {
  message: JmapEmailMessage | null;
  plaintext: string | null;
  attachments: JmapAttachment[];
  runtime: MailRuntime | null | undefined;
  userId: string | null | undefined;
  enabled?: boolean;
};

/** Fetches each candidate ICS blob the message did not already carry inline. */
async function loadCalendarAttachments(
  runtime: MailRuntime,
  candidates: ReturnType<typeof listCalendarAttachmentCandidates>,
  inlineAttachments: JmapAttachment[],
): Promise<JmapAttachment[]> {
  return Promise.all(
    candidates.map(async (candidate) => {
      const existing = inlineAttachments.find(
        (attachment) => attachment.blobId === candidate.blobId,
      );
      if (existing?.content) {
        return existing;
      }
      const content = await runtime.client.getBlobAsText(
        runtime.session,
        candidate.blobId,
      );
      return {
        blobId: candidate.blobId,
        name: candidate.name,
        type: candidate.type ?? "text/calendar",
        content,
      } satisfies JmapAttachment;
    }),
  );
}

export function useMailCalendarInvitation({
  message,
  plaintext,
  attachments,
  runtime,
  userId,
  enabled = true,
}: UseMailCalendarInvitationInput) {
  const queryClient = useQueryClient();
  const [calendarInviteEvent, setCalendarInviteEvent] =
    useState<CalendarInviteEventState | null>(null);
  const [inviteResponsePending, setInviteResponsePending] =
    useState<InvitationResponseStatus | null>(null);
  const [inviteDeclined, setInviteDeclined] = useState(false);

  // Reset during render when the message changes, so a declined invite never sticks to the next one.
  const [renderedMessageId, setRenderedMessageId] = useState(message?.id);
  if (renderedMessageId !== message?.id) {
    setRenderedMessageId(message?.id);
    setInviteDeclined(false);
  }

  const hasCalendarInvitationHint = (message ? hasCalendarInvitationMetadata(message) : false);

  const calendarCandidates =
    enabled && message && runtime ? listCalendarAttachmentCandidates(message) : [];
  const inlineAttachments = attachments.filter((attachment) =>
    Boolean(attachment.content),
  );
  const calendarAttachmentsQuery = useQuery({
    queryKey: QUERY_KEYS.mailCalendarAttachments(message?.id ?? ""),
    queryFn: () =>
      runtime
        ? loadCalendarAttachments(runtime, calendarCandidates, inlineAttachments)
        : inlineAttachments,
    enabled: calendarCandidates.length > 0,
    staleTime: Infinity,
  });
  // Attachments whose ICS could not be fetched fall back to the ones the message already carries.
  const loadedCalendarAttachments =
    !enabled || !message || !runtime
      ? null
      : calendarCandidates.length === 0 || calendarAttachmentsQuery.isError
        ? inlineAttachments
        : (calendarAttachmentsQuery.data ?? null);

  const mailCalendarInvite = extractMailCalendarInvite({
    message,
    plaintext,
    attachments: loadedCalendarAttachments ?? attachments,
  });

  const mailCalendarInviteUid = mailCalendarInvite?.uid ?? null;

  const {
    data: existingInvitation,
    isFetching: isInvitationFetching,
    refetch: refetchInvitation,
  } = useQuery({
    queryKey: mailCalendarInviteUid
      ? invitationByExternalIdQueryKey(mailCalendarInviteUid)
      : ["invitations", "by-external-id", "disabled"],
    queryFn: () => {
      if (!mailCalendarInviteUid) {
        throw new Error("Invitation not found.");
      }
      return calendarApiService.getInvitationByExternalId(
        mailCalendarInviteUid,
        {
          syncRemote: false,
        },
      );
    },
    enabled: Boolean(enabled && mailCalendarInviteUid),
  });

  useEffect(() => {
    if (!enabled || !mailCalendarInviteUid || isInvitationFetching) {
      return;
    }

    let cancelled = false;

    const resolveInviteEvent = async () => {
      const existing = existingInvitation ?? null;
      if (cancelled) return;

      if (mailCalendarInvite?.method === "CANCEL") {
        const importSummary = mailCalendarInvite.icsContent
          ? await calendarApiService.importInvitationIcs(
              mailCalendarInvite.icsContent,
            )
          : null;
        if (cancelled) return;

        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
        await refetchInvitation();

        const event = await calendarApiService.getInvitationByExternalId(
          mailCalendarInviteUid,
          { syncRemote: false },
        );
        if (cancelled) return;

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
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
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

      const sealed = event
        ? await calendarApiService.sealImportedInvitationIfNeeded(event)
        : null;

      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
      setInviteDeclined(false);
      setCalendarInviteEvent({
        eventId: mailCalendarInviteUid,
        event: sealed,
        loading: false,
        error: null,
      });
    };
    void resolveInviteEvent().catch((error: unknown) => {
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
    });

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

  const currentCalendarInviteEvent: CalendarInviteEventState | null =
    !mailCalendarInviteUid
      ? null
      : calendarInviteEvent?.eventId === mailCalendarInviteUid
        ? calendarInviteEvent
        : { eventId: mailCalendarInviteUid, event: null, loading: true, error: null };

  const invitationStatus =
    currentCalendarInviteEvent?.event && userId
      ? currentCalendarInviteEvent.event.participants?.find(
          (participant) =>
            participant.userId === userId && participant.role !== "organizer",
        )?.status
      : null;

  const invalidateInvitationLookup = async () => {
    if (!mailCalendarInviteUid) {
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: invitationByExternalIdQueryKey(mailCalendarInviteUid),
    });
  };

  const handleInvitationResponse = async (status: InvitationResponseStatus) => {
    if (!mailCalendarInviteUid) {
      return { ok: false as const, error: "Invitation not found." };
    }

    setInviteResponsePending(status);
    const response = await respondToMailInvitation(calendarApiService, {
      status,
      inviteUid: mailCalendarInviteUid,
      icsContent: mailCalendarInvite?.icsContent,
      event: currentCalendarInviteEvent?.event,
    })
      .then(async (outcome) => {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
        await invalidateInvitationLookup();
        setInviteDeclined(outcome.declined);
        setCalendarInviteEvent({
          eventId: mailCalendarInviteUid,
          event: outcome.event,
          loading: false,
          error: null,
        });
        return { ok: true as const, message: outcome.message };
      })
      .catch((error: unknown) => ({
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update invitation response.",
      }));
    setInviteResponsePending(null);
    return response;
  };

  const handleCancelRemove = async () => {
    const eventId = currentCalendarInviteEvent?.event?.id;
    if (!eventId || !mailCalendarInviteUid) {
      return { ok: false as const, error: "Event not found." };
    }

    try {
      await calendarApiService.deleteEvent(eventId);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
      await invalidateInvitationLookup();
      setCalendarInviteEvent({
        eventId: mailCalendarInviteUid,
        event: null,
        loading: false,
        error: null,
      });
      return { ok: true as const, message: "Cancelled event removed from your calendar." };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to remove event.",
      };
    }
  };

  return {
    hasCalendarInvitationHint,
    mailCalendarInvite,
    currentCalendarInviteEvent,
    invitationStatus,
    inviteDeclined,
    inviteResponsePending,
    handleInvitationResponse,
    handleCancelRemove,
  };
}

export type MailCalendarInvitationState = ReturnType<
  typeof useMailCalendarInvitation
>;
