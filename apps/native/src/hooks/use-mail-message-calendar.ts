import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildEventReminderMailView,
  isDecryptedEventReminderContent,
} from "@workspace/calendar-core";
import { QUERY_KEYS } from "../lib/query-keys";
import { calendarApiService } from "../lib/api";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import type { JmapAttachment, JmapEmailMessage } from "../lib/mail/types";
import {
  extractLinkedCalendarEventId,
  extractReminderLeadMinutes,
  getCalendarEventLinkSource,
  isSolaceEventReminderEmail,
} from "../lib/mail/calendar-event-link";
import { useE2ee } from "../providers/E2eeProvider";
import { useMailCalendarInvitation } from "./use-mail-calendar-invitation";

export function useMailMessageCalendar({
  message,
  plainContent,
  attachments,
  runtime,
  userId,
  isDecrypting,
}: {
  message: JmapEmailMessage | null;
  plainContent: string | null;
  attachments: JmapAttachment[];
  runtime: MailRuntime | undefined;
  userId: string | undefined;
  isDecrypting: boolean;
}) {
  const { isReady: isE2eeReady } = useE2ee();
  const calendarEventLinkSource = useMemo(
    () => (message ? getCalendarEventLinkSource(message, plainContent) : null),
    [message, plainContent],
  );
  const linkedCalendarEventId = useMemo(
    () => (message ? extractLinkedCalendarEventId(message, plainContent) : null),
    [message, plainContent],
  );

  const calendarInvitation = useMailCalendarInvitation({
    message,
    plaintext: plainContent,
    attachments,
    runtime,
    userId,
    enabled: Boolean(message) && !isDecrypting,
  });

  const inviteMethod = calendarInvitation.mailCalendarInvite?.method;
  const isEventReminderEmail =
    !calendarInvitation.hasCalendarInvitationHint &&
    inviteMethod !== "REQUEST" &&
    inviteMethod !== "CANCEL" &&
    Boolean(
      calendarEventLinkSource &&
        isSolaceEventReminderEmail(calendarEventLinkSource),
    );

  const {
    data: linkedEvent,
    isLoading: isLinkedEventLoading,
    isFetching: isLinkedEventFetching,
    isError: isLinkedEventError,
    isSuccess: isLinkedEventSuccess,
    error: linkedEventError,
  } = useQuery({
    queryKey: QUERY_KEYS.eventDetail(linkedCalendarEventId ?? ""),
    enabled:
      Boolean(linkedCalendarEventId) && isEventReminderEmail && isE2eeReady,
    // Non-null: enabled only when linkedCalendarEventId is set.
    queryFn: () => calendarApiService.getEvent(linkedCalendarEventId!),
  });
  const { data: userSettings } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    staleTime: 5 * 60_000,
  });
  const eventReminderView = useMemo(() => {
    if (!linkedEvent || !isDecryptedEventReminderContent(linkedEvent)) {
      return null;
    }

    return buildEventReminderMailView({
      event: linkedEvent,
      minutesBefore: calendarEventLinkSource
        ? extractReminderLeadMinutes(calendarEventLinkSource)
        : null,
      timezone: userSettings?.timezone,
      timeFormat: userSettings?.timeFormat,
    });
  }, [calendarEventLinkSource, linkedEvent, userSettings]);
  const isReminderEventLoading =
    isEventReminderEmail &&
    (!isE2eeReady || isLinkedEventLoading || isLinkedEventFetching);

  const formattedInviteStart = useMemo(() => {
    const start = calendarInvitation.mailCalendarInvite?.start;
    if (!start) return null;

    return start.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      hour12:
        userSettings?.timeFormat === "12h"
          ? true
          : userSettings?.timeFormat === "24h"
            ? false
            : undefined,
      timeZone: userSettings?.timezone ?? undefined,
    });
  }, [calendarInvitation.mailCalendarInvite?.start, userSettings]);

  return {
    calendarInvitation,
    formattedInviteStart,
    isEventReminderEmail,
    linkedCalendarEventId,
    eventReminderView,
    isReminderEventLoading,
    isLinkedEventSuccess,
    linkedEventError: isLinkedEventError ? linkedEventError : null,
    userSettings,
  };
}
