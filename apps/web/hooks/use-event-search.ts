"use client";

import { useQuery } from "@tanstack/react-query";
import { calendarApiService } from "../lib/calendar-api-service";
import type { CalendarEvent as ApiCalendarEvent } from "../lib/types/calendar";

export function useEventSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ["events", "search", query],
    queryFn: async ({ signal }) => {
      const result = await calendarApiService.searchEvents(
        { q: query, limit: 15 },
        signal,
      );
      // Map API events to the shape expected by UI components
      return result.events.map((e: ApiCalendarEvent) => ({
        id: e.id,
        title: e.title,
        description: e.description ?? undefined,
        start: e.start instanceof Date ? e.start : new Date(e.start),
        end: e.end instanceof Date ? e.end : new Date(e.end),
        allDay: e.allDay,
        location: e.location ?? undefined,
        color: e.color ?? e.calendar?.color ?? undefined,
        calendarId: e.calendarId,
        categoryId: e.categoryId ?? undefined,
        userId: e.userId,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        recurrence: e.recurrence ?? undefined,
        parentEventId: e.parentEventId ?? undefined,
      }));
    },
    enabled: enabled && query.trim().length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
