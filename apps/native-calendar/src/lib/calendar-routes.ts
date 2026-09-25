import type { QueryClient } from "@tanstack/react-query";
import type {
  PushTapData,
  PushTapHandler,
} from "@workspace/native-core/lib/push-notifications";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";

export const CALENDAR_HOME_ROUTE = "/calendar";
export const SETTINGS_CALENDAR_ROUTE = "/settings/calendar";

export function eventDetailRoute(eventId: string): string {
  return `/event/${eventId}`;
}

function pushEventId(data: PushTapData): string | null {
  if (data.t !== "event") return null;
  const eventId = typeof data.eid === "string" ? data.eid.trim() : "";
  return eventId || null;
}

/** Only event reminders open this app; other push kinds belong to the mail app. */
export const CALENDAR_PUSH_TAP_HANDLER: PushTapHandler = {
  route(data: PushTapData) {
    if (data.t !== "event") return null;
    const eventId = pushEventId(data);
    return eventId ? eventDetailRoute(eventId) : CALENDAR_HOME_ROUTE;
  },
  invalidate(queryClient: QueryClient, data: PushTapData) {
    if (data.t !== "event") return;
    const eventId = pushEventId(data);
    if (eventId) {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.eventDetail(eventId),
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["events"] });
  },
};
