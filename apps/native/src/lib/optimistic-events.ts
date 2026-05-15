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

export type CacheSnapshot = Array<{
  queryKey: readonly unknown[];
  data: EventsResponse | undefined;
}>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a temporary client-side ID so we can remove the event on rollback. */
export function generateOptimisticId(): string {
  return `__optimistic__${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  return event.start < rangeEnd && event.end > rangeStart;
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
