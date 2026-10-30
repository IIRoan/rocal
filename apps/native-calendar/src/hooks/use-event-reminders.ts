import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReminderMinutes, storedEventId } from "@workspace/calendar-core";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";

/** Reminder minutes for a saved event, falling back to its legacy single reminder when the list is unavailable. */
export function useEventReminders(
  eventId: string | undefined,
  fallbackReminder: number | null | undefined,
  enabled = true,
): { reminders: number[]; isLoading: boolean } {
  const select = useCallback(
    (response: Awaited<ReturnType<typeof calendarApiService.getEventNotifications>>) =>
      getReminderMinutes(response.data?.notifications ?? [], fallbackReminder),
    [fallbackReminder],
  );
  const { data, isLoading } = useQuery({
    // Occurrences share their series' reminders, so a save through one occurrence refreshes them all.
    queryKey: QUERY_KEYS.eventNotifications(storedEventId(eventId ?? "")),
    // Why: `enabled` below guarantees eventId is set whenever this runs.
    queryFn: () => calendarApiService.getEventNotifications(eventId!),
    enabled: enabled && !!eventId,
    staleTime: 5 * 60 * 1000,
    select,
  });
  return {
    reminders: data ?? getReminderMinutes([], fallbackReminder),
    isLoading: enabled && !!eventId && isLoading,
  };
}
