import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getErrorMessage,
  type EventsResponse,
} from "@workspace/calendar-core";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import type { KitEventMove } from "../components/calendar/calendar-kit-adapter";
import {
  optimisticallyPatchEvent,
  rollbackFromSnapshot,
} from "../lib/optimistic-events";

/** Settings query; the placeholder serves the cached value the other settings surfaces share. */
export function useCalendarScreenSettings() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    placeholderData: () =>
      queryClient.getQueryData<
        Awaited<ReturnType<typeof calendarApiService.getUserSettings>>
      >(QUERY_KEYS.settings()),
  });
}

export function useCalendarScreenCalendars() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    placeholderData: () =>
      queryClient.getQueryData<
        Awaited<ReturnType<typeof calendarApiService.getCalendars>>
      >(QUERY_KEYS.calendars()),
  });
}

/** Range query seeded from the prefetched months so optimistic writes land in real cache data. */
export function useCalendarScreenEvents(input: {
  start: Date;
  end: Date;
  enabled: boolean;
  seed: { data: EventsResponse; updatedAt: number } | undefined;
}) {
  return useQuery({
    queryKey: QUERY_KEYS.events(
      input.start.toISOString(),
      input.end.toISOString(),
    ),
    queryFn: () => calendarApiService.getEvents(input.start, input.end),
    enabled: input.enabled,
    initialData: input.seed?.data,
    initialDataUpdatedAt: input.seed?.updatedAt,
    placeholderData: keepPreviousData,
  });
}

export function useMoveCalendarEvent(timezone: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ eventId, start, end, recurrenceEdit }: KitEventMove) => {
      if (recurrenceEdit) {
        return calendarApiService.editRecurringEvent(
          recurrenceEdit.parentEventId,
          {
            editScope: "this_only",
            occurrenceDate: recurrenceEdit.occurrenceDate,
            updates: { start, end },
          },
        );
      }

      return calendarApiService.updateEvent(eventId, {
        start,
        end,
        timezone,
      });
    },
    onMutate: async ({ eventId, start, end }) => {
      const snapshot = await optimisticallyPatchEvent(queryClient, eventId, {
        start: new Date(start),
        end: new Date(end),
      });
      return { snapshot };
    },
    onError: (err: unknown, _vars, context) => {
      if (context?.snapshot) {
        rollbackFromSnapshot(queryClient, context.snapshot);
      }
      toast(getErrorMessage(err, "Failed to move event"), "error");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
    },
  });
}
