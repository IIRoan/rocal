import type { QueryClient } from "@tanstack/react-query";
import type {
  PushTapData,
  PushTapHandler,
} from "@workspace/native-core/lib/push-notifications";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";

export const MAIL_HOME_ROUTE = "/mail";
export const SETTINGS_MAIL_ROUTE = "/settings/mail";

export function mailMessageRoute(messageId: string): string {
  return `${MAIL_HOME_ROUTE}/message/${encodeURIComponent(messageId)}`;
}

/** Events live in the calendar app; its scheme follows the same dev/production split as this app. */
export function calendarEventDeepLink(
  eventId: string,
  appVariant: string | null | undefined,
): string {
  const scheme = appVariant === "development" ? "solace-dev" : "solace";
  return `${scheme}://event/${encodeURIComponent(eventId)}`;
}

function pushMessageId(data: PushTapData): string | null {
  if (data.t !== "mail") return null;
  const messageId = typeof data.mid === "string" ? data.mid.trim() : "";
  return messageId || null;
}

/** Only new-mail pushes open this app; event reminders belong to the calendar app. */
export const MAIL_PUSH_TAP_HANDLER: PushTapHandler = {
  route(data: PushTapData) {
    if (data.t !== "mail") return null;
    const messageId = pushMessageId(data);
    return messageId ? mailMessageRoute(messageId) : MAIL_HOME_ROUTE;
  },
  invalidate(queryClient: QueryClient, data: PushTapData) {
    if (data.t !== "mail") return;
    const messageId = pushMessageId(data);
    if (messageId) {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.mailMessage(messageId),
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["mail", "messages"] });
  },
};
