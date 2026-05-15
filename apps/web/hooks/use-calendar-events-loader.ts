"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildPaddedCalendarMonthRanges,
  getCalendarMonthKey,
  getPaddedCalendarMonthRange,
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
}

// ---------------------------------------------------------------------------
// Month-based fetch strategy
//
// All API fetches are anchored on a calendar month.  The fetch range pads
// the calendar month by MONTH_PADDING_DAYS on each side so that every
// possible month-view grid (any weekStartDay 0–6) is fully covered by a
// single request.  A week starting on any day can extend at most 6 days
// before the 1st or after the last day of the month, so 7 days of padding
// is always sufficient.
//
// Switching between day / week / month views within the same calendar month
// never changes the query key and never triggers a new fetch.
// ---------------------------------------------------------------------------

/** Days of padding before the 1st and after the last day of the month. */
const MONTH_PADDING_DAYS = 7;

/** Default stale time for event queries (15 minutes). */
const DEFAULT_STALE_TIME = 15 * 60 * 1000;

/** Garbage-collection time for event queries (30 minutes). */
const GC_TIME = 30 * 60 * 1000;

/** Padded fetch range for the calendar month containing `date`. */
function monthFetchRange(date: Date): DateRange {
  return getPaddedCalendarMonthRange(date, MONTH_PADDING_DAYS);
}

/** Stable string key for a calendar month: `"YYYY-MM"`. */
export function monthKey(date: Date): string {
  return getCalendarMonthKey(date);
}

/**
 * Map any view range to a padded fetch range that fully contains it.
 *
 * Uses the midpoint of the range to determine the primary anchor month.
 * If the view range extends beyond that month's padded fetch range (e.g.
 * a 30-day agenda view), the range is expanded to also cover the end
 * month's padded range.
 */
export function toFetchRange(viewRange: DateRange): DateRange {
  const midpoint = new Date(
    (viewRange.start.getTime() + viewRange.end.getTime()) / 2,
  );
  const primary = monthFetchRange(midpoint);

  // If the primary range already covers the view, return it directly.
  if (primary.start <= viewRange.start && primary.end >= viewRange.end) {
    return primary;
  }

  // Expand to cover the end month as well.
  const endMonth = monthFetchRange(viewRange.end);
  return {
    start: primary.start < endMonth.start ? primary.start : endMonth.start,
    end: primary.end > endMonth.end ? primary.end : endMonth.end,
  };
}

/** Prefetch ranges for adjacent months around `center`. */
export function buildViewPrefetchRanges(
  center: Date,
  _view: string,
): DateRange[] {
  return buildPaddedCalendarMonthRanges(center, {
    includeCurrent: false,
    adjacentMonthDepth: 2,
    paddingDays: MONTH_PADDING_DAYS,
  });
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function getMonthQueryKey(month: string | null) {
  if (!month) return ["events", "none"] as const;
  return ["events", month] as const;
}

/**
 * Validate, deduplicate, and filter events to those intersecting `range`.
 * Ensures dates are proper Date objects and drops malformed entries.
 */
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
  } = options;

  // Which calendar month to show.  Set exclusively by `setMonth`, which is
  // called by CalendarDateSync from `currentDate` in the calendar context.
  const [activeMonth, setActiveMonth] = useState<string | null>(null);

  // Stable fetch range derived from the active month string.
  const fetchRange = useMemo<DateRange | null>(() => {
    if (!activeMonth) return null;
    const [year, month] = activeMonth.split("-").map(Number);
    return monthFetchRange(new Date(year, month - 1, 15));
  }, [activeMonth]);

  const queryClient = useQueryClient();

  const eventsQuery = useQuery({
    queryKey: getMonthQueryKey(activeMonth),
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
    const center = new Date(year, month - 1, 15);

    const runPrefetch = () => {
      for (const range of buildViewPrefetchRanges(center, "month")) {
        const midpoint = new Date(
          (range.start.getTime() + range.end.getTime()) / 2,
        );
        const key = monthKey(midpoint);

        queryClient.prefetchQuery({
          queryKey: getMonthQueryKey(key),
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
      const idleId = (window as any).requestIdleCallback(runPrefetch, {
        timeout: 500,
      });
      return () => {
        if ("cancelIdleCallback" in window) {
          (window as any).cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = setTimeout(runPrefetch, 0);
    return () => clearTimeout(timeoutId);
  }, [activeMonth, cacheTimeout, preloadMonthsAhead, queryClient]);

  /** Set the active month from a Date.  Called by CalendarDateSync. */
  const setMonth = useCallback((date: Date) => {
    const key = monthKey(date);
    setActiveMonth((prev) => (prev === key ? prev : key));
  }, []);

  /**
   * No-op kept for backward compatibility with EventCalendar's
   * `onDateRangeChange` prop.  Month selection is driven exclusively
   * by CalendarDateSync → setMonth.
   */
  const setDateRange = useCallback((_dateRange: DateRange) => {}, []);

  const refetchEvents = useCallback(
    async (dateRange?: DateRange) => {
      if (dateRange) {
        const midpoint = new Date(
          (dateRange.start.getTime() + dateRange.end.getTime()) / 2,
        );
        setMonth(midpoint);
      } else {
        await eventsQuery.refetch();
      }
    },
    [eventsQuery, setMonth],
  );

  const prefetchRange = useCallback(
    (range: DateRange) => {
      const midpoint = new Date(
        (range.start.getTime() + range.end.getTime()) / 2,
      );
      const key = monthKey(midpoint);
      const fetchRangeForMonth = monthFetchRange(midpoint);

      queryClient.prefetchQuery({
        queryKey: getMonthQueryKey(key),
        queryFn: async () => {
          const res = await calendarApiService.getEvents(
            fetchRangeForMonth.start,
            fetchRangeForMonth.end,
          );
          return validateAndCleanEvents(res.events, fetchRangeForMonth);
        },
        staleTime: cacheTimeout,
      });
    },
    [queryClient, cacheTimeout],
  );

  const getCachedEventsForRange = useCallback(
    (range: DateRange): CalendarEvent[] | undefined => {
      const midpoint = new Date(
        (range.start.getTime() + range.end.getTime()) / 2,
      );
      return queryClient.getQueryData<CalendarEvent[]>(
        getMonthQueryKey(monthKey(midpoint)),
      );
    },
    [queryClient],
  );

  return {
    events: eventsQuery.data ?? [],
    eventsLoading: eventsQuery.isLoading,
    eventsError: eventsQuery.error as unknown as ApiError | null,
    currentDateRange: fetchRange,
    setDateRange,
    setMonth,
    refetchEvents,
    prefetchRange,
    getCachedEventsForRange,
  };
}
