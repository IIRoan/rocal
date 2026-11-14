"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteTrashedEventMutationOptions,
  emptyEventTrashMutationOptions,
  eventTrashQueryOptions,
  restoreTrashedEventMutationOptions,
} from "@workspace/calendar-client/event-trash-query-options";
import {
  CALENDARS_QUERY_KEY,
  getErrorMessage,
  getTrashRestoreNotice,
  type Calendar,
  type CalendarEvent,
} from "@workspace/calendar-core";
import { toast } from "@workspace/ui/lib/toast";

import { calendarApiService } from "@/lib/calendar-api-service";
import { EVENTS_QUERY_KEY } from "./use-calendar-events-loader";
import { invalidateEventRanges } from "./use-calendar-data";
import { useSettings } from "./use-settings";

/** A trash entry to restore and the calendar it was deleted from, to tell whether the restore landed elsewhere. */
export type TrashRestoreTarget = { trashId: string; calendarId: string };

/** Mutation-level callbacks, so an Undo from a closed editor still refreshes and reports. */
export function useRestoreTrashedEvent() {
  const queryClient = useQueryClient();
  const timezone = useSettings().settings?.timezone;
  const invalidateRestoredEvent = (restored: CalendarEvent) =>
    restored.recurrence
      ? queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY })
      : invalidateEventRanges(queryClient, restored.start, restored.end, timezone);
  const options = restoreTrashedEventMutationOptions(
    calendarApiService,
    queryClient,
    invalidateRestoredEvent,
  );
  return useMutation({
    ...options,
    mutationFn: ({ trashId }: TrashRestoreTarget) => options.mutationFn(trashId),
    onMutate: ({ trashId }) => options.onMutate(trashId),
    onError: (error, { trashId }, context) => {
      options.onError(error, trashId, context);
      toast.error(getErrorMessage(error, "Failed to restore the event"));
    },
    onSuccess: (restored, { calendarId }) => {
      toast.success(
        getTrashRestoreNotice(
          restored.calendarId,
          calendarId,
          queryClient.getQueryData<Calendar[]>(CALENDARS_QUERY_KEY),
        ),
      );
      return invalidateRestoredEvent(restored);
    },
  });
}

/** Shows the Undo toast for a delete that left a trash entry; action toasts stay until dismissed. */
export function useEventTrashUndo() {
  const { mutate: restore } = useRestoreTrashedEvent();
  return (target: TrashRestoreTarget) =>
    toast.success("Event moved to Trash", {
      action: { label: "Undo", onClick: () => restore(target) },
    });
}

export function useEventTrash() {
  const queryClient = useQueryClient();
  const trash = useQuery(eventTrashQueryOptions(calendarApiService));
  const restore = useRestoreTrashedEvent();
  const deleteOptions = deleteTrashedEventMutationOptions(calendarApiService, queryClient);
  const deleteForever = useMutation({
    ...deleteOptions,
    onError: (error, trashId: string, context) => {
      deleteOptions.onError(error, trashId, context);
      toast.error(getErrorMessage(error, "Failed to delete the event"));
    },
  });
  const emptyOptions = emptyEventTrashMutationOptions(calendarApiService, queryClient);
  const empty = useMutation({
    ...emptyOptions,
    onError: (error, variables: void, context) => {
      emptyOptions.onError(error, variables, context);
      toast.error(getErrorMessage(error, "Failed to empty the trash"));
    },
  });
  return { trash, restore, deleteForever, empty };
}
