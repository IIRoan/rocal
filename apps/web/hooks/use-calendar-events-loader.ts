"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildPaddedCalendarMonthRanges,
  formatInstantCalendarMonthKey,
  getCalendarMonthKey,
  getPaddedCalendarMonthRange,
  resolveTimezone,
  utcToPickerDate,
  wallClockToUtc,
} from "@workspace/calendar-core";
import { calendarApiService } from "../lib/calendar-api-service";
import { CalendarEvent, ApiError } from "../lib/types/calendar";

export interface DateRange {
  start: Date;
  end: Date;
}

interface UseCalendarEventsLoaderOptions {
  cacheTimeout?: number;
  autoRefetch?: boolean;
  preloadMonthsAhead?: number;
  timezone?: string | null;
  /** Date shown before the calendar first moves, so its month loads at once. */
  initialDate?: Date;
}

// One padded month range per query key; view switches within the month don't refetch.

/** Days of padding before the 1st and after the last day of the month. */
const MONTH_PADDING_DAYS = 7;

/** Default stale time for event queries (15 minutes). */
const DEFAULT_STALE_TIME = 15 * 60 * 1000;

/** Garbage-collection time for event queries (30 minutes). */
const GC_TIME = 30 * 60 * 1000;

/** Padded fetch range for an account-zone month key (`"YYYY-MM"`). */
function monthFetchRange(month: string, timezone: string): DateRange {
  const [year, monthNumber] = month.split("-").map(Number);
  return getPaddedCalendarMonthRange(
    new Date(year, monthNumber - 1, 1),
    MONTH_PADDING_DAYS,
    timezone,
  );
}

/** Stable string key for a calendar month: `"YYYY-MM"`. */
export function monthKey(date: Date): string {
  return getCalendarMonthKey(date);
}

/** Prefetch ranges for the account-zone months adjacent to the instant `center`. */
export function buildViewPrefetchRanges(
  center: Date,
  _view: string,
  timezone?: string | null,
): DateRange[] {
  const resolvedTimezone = resolveTimezone(timezone);
  return buildPaddedCalendarMonthRanges(
    utcToPickerDate(center, resolvedTimezone),
    {
      includeCurrent: false,
      adjacentMonthDepth: 2,
      paddingDays: MONTH_PADDING_DAYS,
      timezone: resolvedTimezone,
    },
  );
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export const EVENTS_QUERY_KEY = ["events"] as const;

/** Keyed by zone because fetch bounds are account-zone days; without one it is a prefix that invalidates the month in every zone. */
export function getMonthQueryKey(month: string | null, timezone?: string) {
  if (!month) return [...EVENTS_QUERY_KEY, "none"] as const;
  if (timezone) return [...EVENTS_QUERY_KEY, month, timezone] as const;
  return [...EVENTS_QUERY_KEY, month] as const;
}

/** Validate, deduplicate, and keep events intersecting `range`, dropping entries without proper Date objects. */
function validateAndCleanEvents(
  items: CalendarEvent[],
  range: DateRange,
): CalendarEvent[] {
  const seen = new Set<string>();
  const cleaned: CalendarEvent[] = [];

  for (const event of items) {
    const start =
      event.start instanceof Date ? event.start : new Date(event.start);
    const end = event.end instanceof Date ? event.end : new Date(event.end);

    // Skip events with invalid or inverted dates
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) continue;

    // Skip events that don't overlap the fetch range
    if (start > range.end || end < range.start) continue;

    // Deduplicate by id
    if (seen.has(event.id)) continue;
    seen.add(event.id);

    cleaned.push({ ...event, start, end });
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCalendarEventsLoader(
  options: UseCalendarEventsLoaderOptions = {},
) {
  const {
    cacheTimeout = DEFAULT_STALE_TIME,
    autoRefetch = true,
    preloadMonthsAhead = 2,
    timezone,
    initialDate,
  } = options;
  const resolvedTimezone = resolveTimezone(timezone);
  const instantMonthKey = (date: Date) =>
    formatInstantCalendarMonthKey(date, resolvedTimezone);

  // The month is derived from an instant, so a later zone change re-reads it in the new zone.
  const [anchorDate, setAnchorDate] = useState<Date | null>(null);
  const monthAnchor = anchorDate ?? initialDate ?? null;
  const activeMonth = monthAnchor ? instantMonthKey(monthAnchor) : null;

  // Stable fetch range derived from the active month string.
  const fetchRange: DateRange | null = activeMonth
    ? monthFetchRange(activeMonth, resolvedTimezone)
    : null;

  const queryClient = useQueryClient();

  const eventsQuery = useQuery<CalendarEvent[], ApiError>({
    queryKey: getMonthQueryKey(activeMonth, resolvedTimezone),
    queryFn: async () => {
      if (!fetchRange) return [];
      const res = await calendarApiService.getEvents(
        fetchRange.start,
        fetchRange.end,
      );
      return validateAndCleanEvents(res.events, fetchRange);
    },
    enabled: autoRefetch && !!fetchRange,
    staleTime: cacheTimeout,
    gcTime: GC_TIME,
  });

  // Prefetch adjacent months on idle.
  useEffect(() => {
    if (!activeMonth || preloadMonthsAhead <= 0) return;

    const [year, month] = activeMonth.split("-").map(Number);
    const center = wallClockToUtc(
      new Date(year, month - 1, 15),
      12,
      0,
      resolvedTimezone,
    );

    const runPrefetch = () => {
      for (const range of buildViewPrefetchRanges(
        center,
        "month",
        resolvedTimezone,
      )) {
        const midpoint = new Date(
          (range.start.getTime() + range.end.getTime()) / 2,
        );
        const key = formatInstantCalendarMonthKey(midpoint, resolvedTimezone);

        queryClient.prefetchQuery({
          queryKey: getMonthQueryKey(key, resolvedTimezone),
          queryFn: async () => {
            const res = await calendarApiService.getEvents(
              range.start,
              range.end,
            );
            return validateAndCleanEvents(res.events, range);
          },
          staleTime: cacheTimeout,
          gcTime: GC_TIME,
        });
      }
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(runPrefetch, {
        timeout: 500,
      });
      return () => {
        if ("cancelIdleCallback" in window) {
          window.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = setTimeout(runPrefetch, 0);
    return () => clearTimeout(timeoutId);
  }, [activeMonth, cacheTimeout, preloadMonthsAhead, queryClient, resolvedTimezone]);

  /** Follows the calendar's date (CalendarProvider's onCurrentDateChange); the latest date decides the month, also after a zone change. */
  const setMonth = (date: Date) => setAnchorDate(date);

  /** No-op kept for EventCalendar's onDateRangeChange; month selection follows the calendar date through setMonth. */
  const setDateRange = (_dateRange: DateRange) => {};

  const refetchEvents = async (dateRange?: DateRange) => {
    if (dateRange) {
      const midpoint = new Date(
        (dateRange.start.getTime() + dateRange.end.getTime()) / 2,
      );
      setMonth(midpoint);
    } else {
      await eventsQuery.refetch();
    }
  };

  const prefetchRange = (range: DateRange) => {
    const midpoint = new Date(
      (range.start.getTime() + range.end.getTime()) / 2,
    );
    const key = instantMonthKey(midpoint);
    const fetchRangeForMonth = monthFetchRange(key, resolvedTimezone);

    queryClient.prefetchQuery({
      queryKey: getMonthQueryKey(key, resolvedTimezone),
      queryFn: async () => {
        const res = await calendarApiService.getEvents(
          fetchRangeForMonth.start,
          fetchRangeForMonth.end,
        );
        return validateAndCleanEvents(res.events, fetchRangeForMonth);
      },
      staleTime: cacheTimeout,
    });
  };

  /** Merges every cached month the range touches (a six-week grid spans up to three), so each month query stays narrow. */
  const getCachedEventsForRange = (range: DateRange): CalendarEvent[] | undefined => {
    const midpoint = new Date(
      (range.start.getTime() + range.end.getTime()) / 2,
    );
    const months = new Set(
      [range.start, midpoint, range.end].map(instantMonthKey),
    );
    const byId = new Map<string, CalendarEvent>();
    for (const month of months) {
      const cached = queryClient.getQueryData<CalendarEvent[]>(
        getMonthQueryKey(month, resolvedTimezone),
      );
      for (const event of cached ?? []) byId.set(event.id, event);
    }
    return [...byId.values()];
  };

  return {
    events: eventsQuery.data ?? [],
    // isLoading is false for disabled queries, so the overlay would dismiss before the first month fetch starts.
    eventsLoading: !fetchRange || eventsQuery.isPending,
    eventsError: eventsQuery.error,
    currentDateRange: fetchRange,
    setDateRange,
    setMonth,
    refetchEvents,
    prefetchRange,
    getCachedEventsForRange,
  };
}
