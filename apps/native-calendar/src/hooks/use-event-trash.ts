import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteTrashedEventMutationOptions,
  emptyEventTrashMutationOptions,
  eventTrashQueryOptions,
  restoreTrashedEventMutationOptions,
} from "@workspace/calendar-client/event-trash-query-options";
import { getErrorMessage, getTrashRestoreNotice, type Calendar } from "@workspace/calendar-core";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { invalidateEventRanges } from "../lib/optimistic-events";

/** A trash entry to restore and the calendar it was deleted from, to tell whether the restore landed elsewhere. */
export type TrashRestoreTarget = { trashId: string; calendarId: string };

/** Mutation-level callbacks, so an Undo from a closed event sheet still refreshes and reports. */
export function useRestoreTrashedEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const options = restoreTrashedEventMutationOptions(calendarApiService, queryClient, (restored) =>
    invalidateEventRanges(queryClient, restored),
  );
  return useMutation({
    ...options,
    mutationFn: ({ trashId }: TrashRestoreTarget) => options.mutationFn(trashId),
    onMutate: ({ trashId }) => options.onMutate(trashId),
    onError: (error, { trashId }, context) => {
      options.onError(error, trashId, context);
      toast(getErrorMessage(error, "Failed to restore the event"), "error");
    },
    onSuccess: (restored, { calendarId }) => {
      toast(
        getTrashRestoreNotice(
          restored.calendarId,
          calendarId,
          queryClient.getQueryData<Calendar[]>(QUERY_KEYS.calendars()),
        ),
      );
      return invalidateEventRanges(queryClient, restored);
    },
  });
}

export function useEventTrash() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const trash = useQuery(eventTrashQueryOptions(calendarApiService));
  const restore = useRestoreTrashedEvent();
  const deleteOptions = deleteTrashedEventMutationOptions(calendarApiService, queryClient);
  const deleteForever = useMutation({
    ...deleteOptions,
    onError: (error, trashId: string, context) => {
      deleteOptions.onError(error, trashId, context);
      toast(getErrorMessage(error, "Failed to delete the event"), "error");
    },
  });
  const emptyOptions = emptyEventTrashMutationOptions(calendarApiService, queryClient);
  const empty = useMutation({
    ...emptyOptions,
    onError: (error, variables: void, context) => {
      emptyOptions.onError(error, variables, context);
      toast(getErrorMessage(error, "Failed to empty the trash"), "error");
    },
  });
  return { trash, restore, deleteForever, empty };
}
