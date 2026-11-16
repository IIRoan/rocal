import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import {
  CALENDARS_QUERY_KEY,
  EVENTS_QUERY_KEY,
  getErrorMessage,
  getTrashRestoreNotice,
  type Calendar,
  type CalendarEvent,
} from "@workspace/calendar-core";
import type { CalendarApiService } from "./calendar-api-service";
import {
  deleteTrashedEventMutationOptions,
  emptyEventTrashMutationOptions,
  eventTrashQueryOptions,
  restoreTrashedEventMutationOptions,
} from "./event-trash-query-options";

/** A trash entry to restore and the calendar it was deleted from, to tell whether the restore landed elsewhere. */
export type TrashRestoreTarget = { trashId: string; calendarId: string };

export type EventsQueryRange = { start: Date; end: Date };

/** What differs per app: its toasts and how its event range keys map to instants (null for other keys under the events root). */
export type EventTrashPlatform = {
  api: Pick<
    CalendarApiService,
    "listTrashedEvents" | "restoreTrashedEvent" | "deleteTrashedEvent" | "emptyEventTrash"
  >;
  notify: (message: string, kind: "success" | "error") => void;
  eventsQueryRange: (queryKey: QueryKey) => EventsQueryRange | null;
};

/** Refreshes only the loaded ranges the event touches; a series reaches every range after its start. */
export function invalidateEventRangesTouching(
  queryClient: QueryClient,
  event: Pick<CalendarEvent, "start" | "end" | "recurrence">,
  eventsQueryRange: EventTrashPlatform["eventsQueryRange"],
): Promise<void> {
  // Server payloads carry ISO strings despite the Date typing.
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  return queryClient.invalidateQueries({
    queryKey: EVENTS_QUERY_KEY,
    predicate: (query) => {
      const range = eventsQueryRange(query.queryKey);
      if (!range) return true;
      return event.recurrence
        ? range.end.getTime() > start
        : start < range.end.getTime() && end > range.start.getTime();
    },
  });
}

/** Mutation-level callbacks, so an Undo from a closed editor still refreshes and reports. */
export function useRestoreTrashedEvent(platform: EventTrashPlatform) {
  const queryClient = useQueryClient();
  const options = restoreTrashedEventMutationOptions(platform.api, queryClient);
  return useMutation({
    ...options,
    mutationFn: ({ trashId }: TrashRestoreTarget) => options.mutationFn(trashId),
    onMutate: ({ trashId }) => options.onMutate(trashId),
    onError: (error, { trashId }, context) => {
      options.onError(error, trashId, context);
      platform.notify(getErrorMessage(error, "Failed to restore the event"), "error");
    },
    onSuccess: (restored, { calendarId }) => {
      platform.notify(
        getTrashRestoreNotice(
          restored.calendarId,
          calendarId,
          queryClient.getQueryData<Calendar[]>(CALENDARS_QUERY_KEY),
        ),
        "success",
      );
      return invalidateEventRangesTouching(queryClient, restored, platform.eventsQueryRange);
    },
  });
}

export function useEventTrash(platform: EventTrashPlatform) {
  const queryClient = useQueryClient();
  const trash = useQuery(eventTrashQueryOptions(platform.api));
  const restore = useRestoreTrashedEvent(platform);
  const deleteOptions = deleteTrashedEventMutationOptions(platform.api, queryClient);
  const deleteForever = useMutation({
    ...deleteOptions,
    onError: (error, trashId: string, context) => {
      deleteOptions.onError(error, trashId, context);
      platform.notify(getErrorMessage(error, "Failed to delete the event"), "error");
    },
  });
  const emptyOptions = emptyEventTrashMutationOptions(platform.api, queryClient);
  const empty = useMutation({
    ...emptyOptions,
    onError: (error, variables: void, context) => {
      emptyOptions.onError(error, variables, context);
      platform.notify(getErrorMessage(error, "Failed to empty the trash"), "error");
    },
  });
  return { trash, restore, deleteForever, empty };
}
