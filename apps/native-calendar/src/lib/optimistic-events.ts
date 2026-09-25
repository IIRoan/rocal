import type { QueryClient } from "@tanstack/react-query";
import type {
  CalendarEvent,
  EventsResponse,
  CreateEventRequest,
} from "@workspace/calendar-core";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";

export type CacheSnapshot = {
  queryKey: readonly unknown[];
  data: EventsResponse | undefined;
}[];

/** Generate a temporary client-side ID so we can remove the event on rollback. */
export function generateOptimisticId(): string {
  return `__optimistic__${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Recurring instances and synced events come from list payloads, so the sheet can open even when `/api/events/:id` cannot load that row. */
export function findCachedEvent(
  queryClient: QueryClient,
  eventId: string,
): CalendarEvent | undefined {
  const allEventQueries = queryClient.getQueriesData<EventsResponse>({
    queryKey: QUERY_KEYS.eventsRoot(),
  });

  for (const [, data] of allEventQueries) {
    const match = data?.events.find((event) => event.id === eventId);
    if (match) {
      return match;
    }
  }

  return undefined;
}

export function buildOptimisticEvent(
  data: CreateEventRequest,
  userId: string,
  tempId: string,
): CalendarEvent {
  const now = new Date();
  return {
    id: tempId,
    title: data.title,
    description: data.description ?? null,
    start: new Date(data.start),
    end: new Date(data.end),
    timezone: data.timezone ?? null,
    allDay: data.allDay ?? false,
    location: data.location ?? null,
    color: data.color ?? null,
    calendarId: data.calendarId,
    categoryId: data.categoryId ?? null,
    userId,
    reminder: data.reminder ?? null,
    recurrence: data.recurrence ?? null,
    parentEventId: null,
    isRecurringInstance: false,
    createdAt: now,
    updatedAt: now,
  };
}

function eventOverlapsRange(
  event: Pick<CalendarEvent, "start" | "end">,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  // Server payloads carry ISO strings despite the Date typing.
  return (
    new Date(event.start).getTime() < rangeEnd.getTime() &&
    new Date(event.end).getTime() > rangeStart.getTime()
  );
}

/** Cancelling a first load reverts it to empty with nothing to restart it, so only loaded ranges are cancelled. */
function cancelLoadedEventQueries(queryClient: QueryClient): Promise<void> {
  return queryClient.cancelQueries({
    queryKey: QUERY_KEYS.eventsRoot(),
    predicate: (query) => query.state.data !== undefined,
  });
}

function parseEventsQueryRange(
  queryKey: readonly unknown[],
): { start: Date; end: Date } | null {
  const [, startISO, endISO] = queryKey as [string, string, string];
  if (!startISO || !endISO) {
    return null;
  }

  const start = new Date(startISO);
  const end = new Date(endISO);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return null;
  }

  return { start, end };
}

export async function optimisticallyInsertEvent(
  queryClient: QueryClient,
  event: CalendarEvent,
): Promise<CacheSnapshot> {
  await cancelLoadedEventQueries(queryClient);

  const snapshot: CacheSnapshot = [];

  const allEventQueries = queryClient.getQueriesData<EventsResponse>({
    queryKey: QUERY_KEYS.eventsRoot(),
  });

  for (const [queryKey, data] of allEventQueries) {
    const range = parseEventsQueryRange(queryKey);
    if (!range || !eventOverlapsRange(event, range.start, range.end)) continue;

    snapshot.push({ queryKey, data });

    queryClient.setQueryData<EventsResponse>(queryKey, (prev) => {
      if (!prev) return prev;
      return { ...prev, events: [event, ...prev.events] };
    });
  }

  return snapshot;
}

export async function optimisticallyRemoveEvent(
  queryClient: QueryClient,
  eventId: string,
): Promise<CacheSnapshot> {
  await cancelLoadedEventQueries(queryClient);

  const snapshot: CacheSnapshot = [];

  const allEventQueries = queryClient.getQueriesData<EventsResponse>({
    queryKey: QUERY_KEYS.eventsRoot(),
  });

  for (const [queryKey, data] of allEventQueries) {
    if (!data) continue;

    snapshot.push({ queryKey, data });

    queryClient.setQueryData<EventsResponse>(queryKey, (prev) => {
      if (!prev) return prev;
      return { ...prev, events: prev.events.filter((e) => e.id !== eventId) };
    });
  }

  return snapshot;
}

/** Moves the event between ranges too, so a drag-rescheduled event does not snap back. */
export async function optimisticallyPatchEvent(
  queryClient: QueryClient,
  eventId: string,
  patch: Pick<CalendarEvent, "start" | "end">,
): Promise<CacheSnapshot> {
  await cancelLoadedEventQueries(queryClient);

  const snapshot: CacheSnapshot = [];

  const allEventQueries = queryClient.getQueriesData<EventsResponse>({
    queryKey: QUERY_KEYS.eventsRoot(),
  });

  let moved: CalendarEvent | undefined;
  for (const [, data] of allEventQueries) {
    const match = data?.events.find((event) => event.id === eventId);
    if (match) {
      moved = { ...match, ...patch };
      break;
    }
  }

  for (const [queryKey, data] of allEventQueries) {
    if (!data) continue;

    snapshot.push({ queryKey, data });

    queryClient.setQueryData<EventsResponse>(queryKey, (prev) => {
      if (!prev) return prev;

      const range = parseEventsQueryRange(queryKey);
      if (!range || !moved) {
        return {
          ...prev,
          events: prev.events.map((event) =>
            event.id === eventId ? { ...event, ...patch } : event,
          ),
        };
      }

      const exists = prev.events.some((event) => event.id === eventId);
      const overlaps = eventOverlapsRange(moved, range.start, range.end);

      if (exists && overlaps) {
        return {
          ...prev,
          events: prev.events.map((event) =>
            event.id === eventId ? { ...event, ...patch } : event,
          ),
        };
      }

      if (exists && !overlaps) {
        return {
          ...prev,
          events: prev.events.filter((event) => event.id !== eventId),
        };
      }

      if (!exists && overlaps) {
        return {
          ...prev,
          events: [moved, ...prev.events],
        };
      }

      return prev;
    });
  }

  return snapshot;
}

/** Swaps the optimistic placeholder for the saved event, including ranges that reloaded without it. */
export function commitOptimisticEvent(
  queryClient: QueryClient,
  tempId: string,
  saved: CalendarEvent,
): void {
  const allEventQueries = queryClient.getQueriesData<EventsResponse>({
    queryKey: QUERY_KEYS.eventsRoot(),
  });

  for (const [queryKey, data] of allEventQueries) {
    if (!data) continue;

    const range = parseEventsQueryRange(queryKey);
    const overlaps = range
      ? eventOverlapsRange(saved, range.start, range.end)
      : false;
    const others = data.events.filter(
      (event) => event.id !== tempId && event.id !== saved.id,
    );
    if (!overlaps && others.length === data.events.length) continue;

    queryClient.setQueryData<EventsResponse>(queryKey, {
      ...data,
      events: overlaps ? [saved, ...others] : others,
    });
  }
}

/** Invalidates only ranges the event can appear in; a recurring series can expand into any later range. */
export function invalidateEventRanges(
  queryClient: QueryClient,
  event: Pick<CalendarEvent, "start" | "end" | "recurrence">,
): Promise<void> {
  const eventStart = new Date(event.start);
  return queryClient.invalidateQueries({
    queryKey: QUERY_KEYS.eventsRoot(),
    predicate: (query) => {
      const range = parseEventsQueryRange(query.queryKey);
      if (!range) return true;
      return event.recurrence
        ? range.end > eventStart
        : eventOverlapsRange(event, range.start, range.end);
    },
  });
}

/** Builds a range from loaded ranges that fully cover it, so a new timeline page renders without a fetch. */
export function readCachedEventsForRange(
  queryClient: QueryClient,
  start: Date,
  end: Date,
): { data: EventsResponse; updatedAt: number } | undefined {
  const sources = queryClient
    .getQueriesData<EventsResponse>({ queryKey: QUERY_KEYS.eventsRoot() })
    .flatMap(([queryKey, data]) => {
      const range = parseEventsQueryRange(queryKey);
      if (!data || !range || range.end <= start || range.start >= end) {
        return [];
      }
      const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
      return [{ range, data, updatedAt }];
    })
    .sort((a, b) => a.range.start.getTime() - b.range.start.getTime());

  let coveredUntil = start.getTime();
  for (const { range } of sources) {
    if (range.start.getTime() > coveredUntil) break;
    coveredUntil = Math.max(coveredUntil, range.end.getTime());
  }
  if (sources.length === 0 || coveredUntil < end.getTime()) return undefined;

  const byRecency = [...sources].sort((a, b) => a.updatedAt - b.updatedAt);
  const events = new Map<string, CalendarEvent>();
  for (const { data } of byRecency) {
    for (const event of data.events) {
      if (eventOverlapsRange(event, start, end)) events.set(event.id, event);
    }
  }
  const newest = byRecency[byRecency.length - 1];

  return {
    data: { ...newest.data, events: [...events.values()] },
    // The oldest source decides staleness so the seeded range refetches no later than its inputs would.
    updatedAt: Math.min(...sources.map((source) => source.updatedAt)),
  };
}

export function rollbackFromSnapshot(
  queryClient: QueryClient,
  snapshot: CacheSnapshot,
): void {
  for (const { queryKey, data } of snapshot) {
    queryClient.setQueryData(queryKey, data);
  }
}
