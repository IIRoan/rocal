import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildEventReminderMailView,
  formatDateTimeLabel,
  isDecryptedEventReminderContent,
  resolveTimezone,
} from "@workspace/calendar-core";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { calendarApiService } from "@workspace/native-core/lib/api";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import type { JmapAttachment, JmapEmailMessage } from "../lib/mail/types";
import {
  extractLinkedCalendarEventId,
  extractReminderLeadMinutes,
  getCalendarEventLinkSource,
  isSolaceEventReminderEmail,
} from "../lib/mail/calendar-event-link";
import { useE2ee } from "@workspace/native-core/providers/E2eeProvider";
import { useMailCalendarInvitation } from "./use-mail-calendar-invitation";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";

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
  const timeFormat = useUserTimeFormat();
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
      timeFormat,
    });
  }, [calendarEventLinkSource, linkedEvent, timeFormat, userSettings?.timezone]);
  const isReminderEventLoading =
    isEventReminderEmail &&
    (!isE2eeReady || isLinkedEventLoading || isLinkedEventFetching);

  const formattedInviteStart = useMemo(() => {
    const start = calendarInvitation.mailCalendarInvite?.start;
    if (!start) return null;

    return formatDateTimeLabel(
      start,
      resolveTimezone(userSettings?.timezone),
      timeFormat,
    );
  }, [calendarInvitation.mailCalendarInvite?.start, timeFormat, userSettings?.timezone]);

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
