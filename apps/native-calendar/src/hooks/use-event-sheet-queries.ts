import { useQuery, useQueryClient } from "@tanstack/react-query";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { findCachedEvent } from "../lib/optimistic-events";

/** Event detail query; the cached event seeds the placeholder so a reopened sheet paints instantly. */
export function useEventSheetEvent(
  eventId: string | undefined,
  visible: boolean,
) {
  const queryClient = useQueryClient();
  const cachedEvent = eventId
    ? findCachedEvent(queryClient, eventId)
    : undefined;
  const detailId = eventId ?? "";
  return useQuery({
    queryKey: QUERY_KEYS.eventDetail(detailId),
    queryFn: () => calendarApiService.getEvent(detailId),
    enabled: !!eventId && visible,
    placeholderData: cachedEvent,
    // An occurrence id loads its series row; keep the tapped occurrence so its date shows and recurring edits target it.
    select: (event) =>
      event.id === detailId ? event : (cachedEvent ?? { ...event, id: detailId }),
  });
}

export function useEventSheetCalendars(visible: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    enabled: visible,
  });
}

export function useEventSheetSettings(visible: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    enabled: visible,
  });
}
