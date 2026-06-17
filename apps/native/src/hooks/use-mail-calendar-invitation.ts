import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CalendarEvent } from "@workspace/calendar-core";
import { invitationByExternalIdQueryKey, isUserDeclinedInvitationEvent } from "@workspace/calendar-core";
import { calendarApiService } from "../lib/api";
import {
  extractMailCalendarInvite,
  hasCalendarInvitationMetadata,
  listCalendarAttachmentCandidates,
  type MailCalendarInvite,
} from "../lib/mail/calendar-invite";
import type { JmapAttachment, JmapEmailMessage } from "../lib/mail/types";
import type { MailRuntime } from "../lib/mail/mail-runtime";

type InvitationResponseStatus = "accepted" | "declined" | "tentative";

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

function eventHasRemoteSync(event: CalendarEvent | null | undefined): boolean {
  return Boolean(event?.stalwartEventId);
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
  const [loadedCalendarAttachments, setLoadedCalendarAttachments] = useState<
    JmapAttachment[] | null
  >(null);

  const hasCalendarInvitationHint = useMemo(
    () => (message ? hasCalendarInvitationMetadata(message) : false),
    [message],
  );

  useEffect(() => {
    if (!enabled || !message || !runtime) {
      setLoadedCalendarAttachments(null);
      return;
    }

    const candidates = listCalendarAttachmentCandidates(message);
    const inlineAttachments = attachments.filter((attachment) =>
      Boolean(attachment.content),
    );
    if (candidates.length === 0) {
      setLoadedCalendarAttachments(inlineAttachments);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const loaded = await Promise.all(
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
        if (!cancelled) {
          setLoadedCalendarAttachments(loaded);
        }
      } catch {
        if (!cancelled) {
          setLoadedCalendarAttachments(inlineAttachments);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachments, enabled, message, runtime]);

  const mailCalendarInvite = useMemo(
    () =>
      extractMailCalendarInvite({
        message,
        plaintext,
        attachments: loadedCalendarAttachments ?? attachments,
      }),
    [attachments, loadedCalendarAttachments, message, plaintext],
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

        const sealed = event
          ? await calendarApiService.sealImportedInvitationIfNeeded(event)
          : null;

        void queryClient.invalidateQueries({ queryKey: ["events"] });
        setInviteDeclined(false);
        setCalendarInviteEvent({
          eventId: mailCalendarInviteUid,
          event: sealed,
          loading: false,
          error: null,
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

  const invitationStatus = useMemo(() => {
    if (!currentCalendarInviteEvent?.event || !userId) {
      return null;
    }

    return currentCalendarInviteEvent.event.participants?.find(
      (participant) =>
        participant.userId === userId && participant.role !== "organizer",
    )?.status;
  }, [currentCalendarInviteEvent?.event, userId]);

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
      if (!mailCalendarInviteUid) {
        return { ok: false as const, error: "Invitation not found." };
      }

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
            return { ok: true as const, message: "Invitation declined." };
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
          return {
            ok: true as const,
            message:
              status === "accepted"
                ? "Invitation accepted."
                : "Marked as tentative.",
          };
        }

        const result = await calendarApiService.respondToInvitation(
          calendarInviteResponseEventId!,
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
          return {
            ok: true as const,
            message: "Invitation declined and removed from your calendar.",
          };
        }

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
        return {
          ok: true as const,
          message:
            status === "accepted"
              ? "Invitation accepted."
              : "Marked as tentative.",
        };
      } catch (error) {
        return {
          ok: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Failed to update invitation response.",
        };
      } finally {
        setInviteResponsePending(null);
      }
    },
    [
      currentCalendarInviteEvent?.event,
      invalidateInvitationLookup,
      mailCalendarInvite?.icsContent,
      mailCalendarInviteUid,
      queryClient,
    ],
  );

  const handleCancelRemove = useCallback(async () => {
    const eventId = currentCalendarInviteEvent?.event?.id;
    if (!eventId || !mailCalendarInviteUid) {
      return { ok: false as const, error: "Event not found." };
    }

    try {
      await calendarApiService.deleteEvent(eventId);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
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
