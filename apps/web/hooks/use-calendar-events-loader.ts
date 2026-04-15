"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import { calendarApiService } from "../lib/calendar-api-service";
import { CalendarEvent, ApiError } from "../lib/types/calendar";

export interface DateRange {
  start: Date;
  end: Date;
}

interface UseCalendarEventsLoaderOptions {
  initialDateRange?: DateRange;
  cacheTimeout?: number;
  autoRefetch?: boolean;
  preloadMonthsAhead?: number;
}

function normalizeDateRange(dateRange: DateRange): DateRange {
  const start = startOfWeek(startOfMonth(dateRange.start), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(dateRange.end), { weekStartsOn: 1 });
  return { start, end };
}

function getRangeQueryKey(dateRange: DateRange | null) {
  if (!dateRange) return ["events", "none"] as const;
  return [
    "events",
    dateRange.start.toISOString(),
    dateRange.end.toISOString(),
  ] as const;
}

function shiftDateRangeByMonths(dateRange: DateRange, months: number): DateRange {
  return normalizeDateRange({
    start: addMonths(dateRange.start, months),
    end: addMonths(dateRange.end, months),
  });
}

// Exported so callers with view context (e.g. CalendarWithData) can fire view-aware prefetches.
export function buildViewPrefetchRanges(center: Date, view: string): DateRange[] {
  if (view === "week") {
    return [-1, 1, -2, 2].map((offset) => {
      const fn = offset < 0 ? subWeeks : addWeeks;
      const base = fn(center, Math.abs(offset));
      return {
        start: startOfWeek(base, { weekStartsOn: 1 }),
        end: endOfWeek(base, { weekStartsOn: 1 }),
      };
    });
  }
  if (view === "day" || view === "3day") {
    return [-1, 1, -3, 3, -7, 7].map((offset) => {
      const fn = offset < 0 ? subDays : addDays;
      const base = fn(center, Math.abs(offset));
      const start = new Date(base); start.setHours(0, 0, 0, 0);
      const end = new Date(base); end.setHours(23, 59, 59, 999);
      return { start, end };
    });
  }
  // month / agenda: ±1 and ±2 months
  return [-1, 1, -2, 2].map((offset) => {
    const fn = offset < 0 ? subMonths : addMonths;
    return normalizeDateRange({
      start: fn(center, Math.abs(offset)),
      end: fn(center, Math.abs(offset)),
    });
  });
}

function validateAndCleanEvents(
  items: CalendarEvent[],
  range: DateRange,
): CalendarEvent[] {
  const seen = new Set<string>();
  const cleaned: CalendarEvent[] = [];

  for (const e of items) {
    const start = e.start instanceof Date ? e.start : new Date(e.start);
    const end = e.end instanceof Date ? e.end : new Date(e.end);
    const startOk = !isNaN(start.getTime());
    const endOk = !isNaN(end.getTime());
    if (!startOk || !endOk || start > end) continue;

    const intersects = start <= range.end && end >= range.start;
    if (!intersects) continue;

    if (seen.has(e.id)) continue;
    seen.add(e.id);
    cleaned.push({ ...e, start, end });
  }

  return cleaned;
}

function parseEventsRangeFromQueryKey(
  key: readonly unknown[],
): DateRange | null {
  if (key.length !== 3 || key[0] !== "events") return null;
  const startIso = typeof key[1] === "string" ? key[1] : null;
  const endIso = typeof key[2] === "string" ? key[2] : null;
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
}

function findBestCachedEventsForRange(
  queryClient: ReturnType<typeof useQueryClient>,
  targetRange: DateRange | null,
): CalendarEvent[] | undefined {
  if (!targetRange) return undefined;

  const cacheEntries = queryClient.getQueriesData<CalendarEvent[]>({
    queryKey: ["events"],
  });

  let bestCovering: { span: number; events: CalendarEvent[] } | null = null;
  let bestOverlapping: { overlap: number; events: CalendarEvent[] } | null = null;

  for (const [key, value] of cacheEntries) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const range = parseEventsRangeFromQueryKey(key as readonly unknown[]);
    if (!range) continue;

    const covers =
      range.start.getTime() <= targetRange.start.getTime() &&
      range.end.getTime() >= targetRange.end.getTime();

    if (covers) {
      const span = range.end.getTime() - range.start.getTime();
      if (!bestCovering || span < bestCovering.span) {
        bestCovering = { span, events: value };
      }
      continue;
    }

    const overlapStart = Math.max(
      range.start.getTime(),
      targetRange.start.getTime(),
    );
    const overlapEnd = Math.min(range.end.getTime(), targetRange.end.getTime());
    const overlap = overlapEnd - overlapStart;
    if (overlap > 0 && (!bestOverlapping || overlap > bestOverlapping.overlap)) {
      bestOverlapping = { overlap, events: value };
    }
  }

  return bestCovering?.events || bestOverlapping?.events;
}

export function useCalendarEventsLoader(
  options: UseCalendarEventsLoaderOptions = {},
) {
  const {
    initialDateRange,
    cacheTimeout = 15 * 60 * 1000,
    autoRefetch = true,
    preloadMonthsAhead = 2,
  } = options;

  const [currentDateRange, setCurrentDateRange] = useState<DateRange | null>(
    initialDateRange ? normalizeDateRange(initialDateRange) : null,
  );
  const queryClient = useQueryClient();

  const fallbackEvents = useMemo(
    () => findBestCachedEventsForRange(queryClient, currentDateRange),
    [queryClient, currentDateRange],
  );

  const eventsQuery = useQuery({
    queryKey: getRangeQueryKey(currentDateRange),
    queryFn: async () => {
      if (!currentDateRange) return [];
      const res = await calendarApiService.getEvents(
        currentDateRange.start,
        currentDateRange.end,
      );
      return validateAndCleanEvents(res.events, currentDateRange);
    },
    enabled: autoRefetch && !!currentDateRange,
    placeholderData: (previousData: CalendarEvent[] | undefined) =>
      previousData ?? fallbackEvents ?? [],
    staleTime: cacheTimeout,
    gcTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (!currentDateRange || preloadMonthsAhead <= 0) return;
    // Use month-based prefetch here; view-aware prefetch is handled in CalendarWithData
    const ranges = buildViewPrefetchRanges(currentDateRange.start, "month");

    const runPrefetch = () => {
      for (const range of ranges) {
        queryClient.prefetchQuery({
          queryKey: getRangeQueryKey(range),
          queryFn: async () => {
            const res = await calendarApiService.getEvents(range.start, range.end);
            return validateAndCleanEvents(res.events, range);
          },
          staleTime: cacheTimeout,
          gcTime: 30 * 60 * 1000,
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
  }, [cacheTimeout, currentDateRange, preloadMonthsAhead, queryClient]);

  const setDateRange = useCallback((dateRange: DateRange) => {
    const normalized = normalizeDateRange(dateRange);
    setCurrentDateRange((prev) => {
      if (
        prev &&
        prev.start.getTime() === normalized.start.getTime() &&
        prev.end.getTime() === normalized.end.getTime()
      ) {
        return prev;
      }
      return normalized;
    });
  }, []);

  const refetchEvents = useCallback(
    async (dateRange?: DateRange) => {
      if (dateRange) {
        setDateRange(dateRange);
      } else {
        await eventsQuery.refetch();
      }
    },
    [eventsQuery, setDateRange],
  );

  const prefetchRange = useCallback(
    (range: DateRange) => {
      const normalized = normalizeDateRange(range);
      queryClient.prefetchQuery({
        queryKey: getRangeQueryKey(normalized),
        queryFn: async () => {
          const res = await calendarApiService.getEvents(normalized.start, normalized.end);
          return validateAndCleanEvents(res.events, normalized);
        },
        staleTime: cacheTimeout,
      });
    },
    [queryClient, cacheTimeout],
  );

  const getCachedEventsForRange = useCallback(
    (range: DateRange): CalendarEvent[] | undefined => {
      return findBestCachedEventsForRange(queryClient, normalizeDateRange(range));
    },
    [queryClient],
  );

  return {
    events: eventsQuery.data || fallbackEvents || [],
    eventsLoading: eventsQuery.isFetching,
    eventsError: eventsQuery.error as unknown as ApiError | null,
    currentDateRange,
    setDateRange,
    refetchEvents,
    normalizeDateRange,
    prefetchRange,
    getCachedEventsForRange,
  };
}
