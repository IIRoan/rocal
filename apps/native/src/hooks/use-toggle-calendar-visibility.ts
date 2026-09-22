import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Calendar } from "@workspace/calendar-core";
import { getErrorMessage } from "@workspace/calendar-core";
import { calendarApiService } from "../lib/api";
import { QUERY_KEYS } from "../lib/query-keys";
import { useToast } from "../providers/ToastProvider";

interface ToggleVisibilityVariables {
  calendarId: string;
  isVisible: boolean;
}

export function useToggleCalendarVisibility() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: ({ calendarId, isVisible }: ToggleVisibilityVariables) =>
      calendarApiService.updateCalendar(calendarId, { isVisible }),
    onMutate: async ({ calendarId, isVisible }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.calendars() });
      const previous = queryClient.getQueryData<Calendar[]>(QUERY_KEYS.calendars());
      queryClient.setQueryData<Calendar[]>(QUERY_KEYS.calendars(), (current) =>
        current?.map((calendar) =>
          calendar.id === calendarId ? { ...calendar, isVisible } : calendar,
        ),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.calendars(), context.previous);
      }
      toast(getErrorMessage(error, "Failed to update calendar visibility"), "error");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsRoot() });
    },
  });

  const { mutate } = mutation;
  const toggle = useCallback(
    (calendar: Calendar) =>
      mutate({ calendarId: calendar.id, isVisible: !calendar.isVisible }),
    [mutate],
  );

  const pendingCalendarId = mutation.isPending
    ? mutation.variables?.calendarId ?? null
    : null;

  return { toggle, pendingCalendarId };
}
