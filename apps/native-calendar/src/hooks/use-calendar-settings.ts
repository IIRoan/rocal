import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getErrorMessage, type Calendar } from "@workspace/calendar-core";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useToast } from "@workspace/native-core/providers/ToastProvider";

/** Calendars for the settings list; the longer stale time keeps the list stable while editing. */
export function useSettingsCalendars() {
  return useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetDefaultCalendar(
  onPendingChange: (calendarId: string | null) => void,
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (calendarId: string) =>
      calendarApiService.updateCalendar(calendarId, { isDefault: true }),
    onMutate: async (calendarId) => {
      onPendingChange(calendarId);
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.calendars() });
      const previous = queryClient.getQueryData<Calendar[]>(
        QUERY_KEYS.calendars(),
      );
      if (previous) {
        queryClient.setQueryData<Calendar[]>(
          QUERY_KEYS.calendars(),
          previous.map((calendar) => ({
            ...calendar,
            isDefault: calendar.id === calendarId,
          })),
        );
      }
      return { previous };
    },
    onError: (error, _calendarId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.calendars(), context.previous);
      }
      toast(
        getErrorMessage(error, "Failed to update default calendar"),
        "error",
      );
    },
    onSettled: () => {
      onPendingChange(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
    },
  });
}
