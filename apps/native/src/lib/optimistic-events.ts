/**
 * Utilities for optimistic event mutations.
 *
 * Events are cached per date-range under keys ["events", start, end].
 * These helpers let mutations immediately patch every matching cache entry
 * so the UI feels instant, then roll back if the server rejects the change.
 */

import type { QueryClient } from "@tanstack/react-query";
import type {
  CalendarEvent,
  EventsResponse,
  CreateEventRequest,
} from "@workspace/calendar-core";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CacheSnapshot = {
  queryKey: readonly unknown[];
  data: EventsResponse | undefined;
}[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a temporary client-side ID so we can remove the event on rollback. */
export function generateOptimisticId(): string {
  return `__optimistic__${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Find an event already loaded in any `["events"]` list cache.
 * Recurring instances and synced events are shown from list payloads, so
 * the sheet can open even when `/api/events/:id` cannot load that row.
 */
export function findCachedEvent(
  queryClient: QueryClient,
  eventId: string,
): CalendarEvent | undefined {
  const allEventQueries = queryClient.getQueriesData<EventsResponse>({
    queryKey: ["events"],
  });

  for (const [, data] of allEventQueries) {
    const match = data?.events.find((event) => event.id === eventId);
    if (match) {
      return match;
    }
  }

  return undefined;
}

/**
 * Build a `CalendarEvent` from a `CreateEventRequest` so it can be injected
 * into the cache before the server responds.
 */
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

/**
 * Returns true if `event` falls within (or overlaps) the range [rangeStart, rangeEnd].
 */
function eventOverlapsRange(
  event: Pick<CalendarEvent, "start" | "end">,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  return event.start < rangeEnd && event.end > rangeStart;
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

/**
 * Optimistically inserts `event` into every active `["events", start, end]`
 * cache entry whose range overlaps the event.
 *
 * Returns a snapshot of every affected entry so callers can roll back.
 */
export async function optimisticallyInsertEvent(
  queryClient: QueryClient,
  event: CalendarEvent,
): Promise<CacheSnapshot> {
  // Cancel any in-flight fetches so they don't overwrite our optimistic update.
  await queryClient.cancelQueries({ queryKey: ["events"] });

  const snapshot: CacheSnapshot = [];

  const allEventQueries = queryClient.getQueriesData<EventsResponse>({
    queryKey: ["events"],
  });

  for (const [queryKey, data] of allEventQueries) {
    // Key shape: ["events", startISO, endISO]
    const [, startISO, endISO] = queryKey as [string, string, string];
    if (!startISO || !endISO) continue;

    const rangeStart = new Date(startISO);
    const rangeEnd = new Date(endISO);
    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) continue;

    if (!eventOverlapsRange(event, rangeStart, rangeEnd)) continue;

    snapshot.push({ queryKey, data });

    queryClient.setQueryData<EventsResponse>(queryKey, (prev) => {
      if (!prev) return prev;
      return { ...prev, events: [event, ...prev.events] };
    });
  }

  return snapshot;
}

/**
 * Optimistically removes an event from every active `["events", start, end]`
 * cache entry.
 *
 * Returns a snapshot for rollback.
 */
export async function optimisticallyRemoveEvent(
  queryClient: QueryClient,
  eventId: string,
): Promise<CacheSnapshot> {
  await queryClient.cancelQueries({ queryKey: ["events"] });

  const snapshot: CacheSnapshot = [];

  const allEventQueries = queryClient.getQueriesData<EventsResponse>({
    queryKey: ["events"],
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

/**
 * Optimistically patches an existing event in every active `["events"]`
 * cache entry. Used when drag-rescheduling so the timeline does not snap back.
 *
 * Returns a snapshot for rollback.
 */
export async function optimisticallyPatchEvent(
  queryClient: QueryClient,
  eventId: string,
  patch: Pick<CalendarEvent, "start" | "end">,
): Promise<CacheSnapshot> {
  await queryClient.cancelQueries({ queryKey: ["events"] });

  const snapshot: CacheSnapshot = [];

  const allEventQueries = queryClient.getQueriesData<EventsResponse>({
    queryKey: ["events"],
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

/**
 * Restores every cache entry from a previously captured snapshot.
 */
export function rollbackFromSnapshot(
  queryClient: QueryClient,
  snapshot: CacheSnapshot,
): void {
  for (const { queryKey, data } of snapshot) {
    queryClient.setQueryData(queryKey, data);
  }
}
