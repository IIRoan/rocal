import type { QueryClient } from "@tanstack/react-query";
import {
  EVENT_TRASH_QUERY_KEY,
  type TrashedCalendarEvent,
} from "@workspace/calendar-core";
import type { CalendarApiService } from "./calendar-api-service";

type TrashApi = Pick<
  CalendarApiService,
  "listTrashedEvents" | "restoreTrashedEvent" | "deleteTrashedEvent" | "emptyEventTrash"
>;

/** The cached trash before an optimistic change, for the rollback. */
export type EventTrashSnapshot = { previous?: TrashedCalendarEvent[] };

export function eventTrashQueryOptions(api: Pick<TrashApi, "listTrashedEvents">) {
  return {
    queryKey: EVENT_TRASH_QUERY_KEY,
    queryFn: () => api.listTrashedEvents(),
  };
}

/** Applies `change` to the cached trash at once and returns what it replaced. */
async function changeCachedTrash(
  queryClient: QueryClient,
  change: (entries: TrashedCalendarEvent[]) => TrashedCalendarEvent[],
): Promise<EventTrashSnapshot> {
  await queryClient.cancelQueries({ queryKey: EVENT_TRASH_QUERY_KEY, exact: true });
  const previous = queryClient.getQueryData<TrashedCalendarEvent[]>(EVENT_TRASH_QUERY_KEY);
  if (previous) queryClient.setQueryData(EVENT_TRASH_QUERY_KEY, change(previous));
  return { previous };
}

function rollbackTrash(queryClient: QueryClient, context: EventTrashSnapshot | undefined) {
  if (context?.previous) queryClient.setQueryData(EVENT_TRASH_QUERY_KEY, context.previous);
}

/** Delete mutations call this once they settle, so the trash list shows the new entry. */
export function invalidateEventTrash(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: EVENT_TRASH_QUERY_KEY, exact: true });
}

/** Undo toasts and the trash view share this; each platform's `onSuccess` reports the restore and refreshes its event ranges. */
export function restoreTrashedEventMutationOptions(
  api: Pick<TrashApi, "restoreTrashedEvent">,
  queryClient: QueryClient,
) {
  return {
    mutationFn: (trashId: string) => api.restoreTrashedEvent(trashId),
    onMutate: (trashId: string) =>
      changeCachedTrash(queryClient, (entries) => entries.filter((entry) => entry.id !== trashId)),
    onError: (_error: unknown, _trashId: string, context: EventTrashSnapshot | undefined) =>
      rollbackTrash(queryClient, context),
    onSettled: () => invalidateEventTrash(queryClient),
  };
}

export function deleteTrashedEventMutationOptions(
  api: Pick<TrashApi, "deleteTrashedEvent">,
  queryClient: QueryClient,
) {
  return {
    mutationFn: (trashId: string) => api.deleteTrashedEvent(trashId),
    onMutate: (trashId: string) =>
      changeCachedTrash(queryClient, (entries) => entries.filter((entry) => entry.id !== trashId)),
    onError: (_error: unknown, _trashId: string, context: EventTrashSnapshot | undefined) =>
      rollbackTrash(queryClient, context),
    onSettled: () => invalidateEventTrash(queryClient),
  };
}

export function emptyEventTrashMutationOptions(
  api: Pick<TrashApi, "emptyEventTrash">,
  queryClient: QueryClient,
) {
  return {
    mutationFn: () => api.emptyEventTrash(),
    onMutate: () => changeCachedTrash(queryClient, () => []),
    onError: (_error: unknown, _variables: void, context: EventTrashSnapshot | undefined) =>
      rollbackTrash(queryClient, context),
    onSettled: () => invalidateEventTrash(queryClient),
  };
}
