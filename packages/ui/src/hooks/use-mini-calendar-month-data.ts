"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfDay,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { CalendarEvent } from "../components/calendar/types";
import {
  buildMiniCalendarDayEventsMap,
  toMiniCalendarDayKey,
} from "./mini-calendar-day-events";

interface DateRange {
  start: Date;
  end: Date;
}

interface CalendarEntry {
  id: string;
  color?: string;
}

interface UseMiniCalendarMonthDataOptions {
  calendarMonth: Date;
  calendars?: CalendarEntry[];
  visibleCalendarIds?: ReadonlySet<string>;
  getCachedEventsForRange?: (range: DateRange) => CalendarEvent[] | undefined;
  prefetchRange?: (range: DateRange) => void;
  rangeChangeDebounceMs?: number;
}

export function useMiniCalendarMonthData({
  calendarMonth,
  calendars,
  visibleCalendarIds,
  getCachedEventsForRange,
  prefetchRange,
  rangeChangeDebounceMs = 120,
}: UseMiniCalendarMonthDataOptions) {
  const grid = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = addDays(start, 41); // Always render 6 rows (42 days)
    const days = eachDayOfInterval({ start, end });
    return { start, end, days };
  }, [calendarMonth]);

  const monthKey = format(calendarMonth, "yyyy-MM");

  // Track which grid range we last fetched
  const lastFetchedKeyRef = useRef<string | null>(null);

  // When the grid changes, prefetch events for this range and adjacent months
  useEffect(() => {
    if (!prefetchRange) return;

    const gridKey = `${grid.start.toISOString()}-${grid.end.toISOString()}`;
    if (lastFetchedKeyRef.current === gridKey) return;
    lastFetchedKeyRef.current = gridKey;

    const gridRange = { start: grid.start, end: grid.end };

    const run = () => {
      prefetchRange(gridRange);
      prefetchRange({
        start: addMonths(grid.start, -1),
        end: addMonths(grid.end, -1),
      });
      prefetchRange({
        start: addMonths(grid.start, 1),
        end: addMonths(grid.end, 1),
      });
    };

    const timeoutId = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        (window as any).requestIdleCallback(run, { timeout: 300 });
      } else {
        run();
      }
    }, rangeChangeDebounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [grid, prefetchRange, rangeChangeDebounceMs]);

  // Periodically check for new cached data to pick up prefetch results
  const [cacheBuster, setCacheBuster] = useState(0);
  const lastEventCountRef = useRef(0);

  useEffect(() => {
    if (!getCachedEventsForRange) return;

    const check = () => {
      const cached = getCachedEventsForRange({ start: grid.start, end: grid.end });
      const count = cached?.length ?? 0;
      if (count !== lastEventCountRef.current) {
        lastEventCountRef.current = count;
        setCacheBuster((v) => v + 1);
      }
    };

    // Check immediately
    check();

    // Then poll at a low frequency
    const intervalId = window.setInterval(check, 1000);
    return () => window.clearInterval(intervalId);
  }, [getCachedEventsForRange, grid.start, grid.end]);

  // Build a calendar color lookup map
  const calendarColorMap = useMemo(() => {
    if (!calendars) return new Map<string, string>();
    return new Map(calendars.map((cal) => [cal.id, cal.color || ""]));
  }, [calendars]);

  // Build the day-to-events map from cached data
  const dayEventsMap = useMemo(() => {
    // Reference cacheBuster to trigger re-computation
    void cacheBuster;

    if (!getCachedEventsForRange) {
      return buildMiniCalendarDayEventsMap({
        days: grid.days,
        gridStart: startOfDay(grid.start),
        gridEnd: endOfDay(grid.end),
        calendarColorMap,
        visibleCalendarIds,
      });
    }

    const cachedEvents = getCachedEventsForRange({
      start: grid.start,
      end: grid.end,
    });

    return buildMiniCalendarDayEventsMap({
      days: grid.days,
      gridStart: startOfDay(grid.start),
      gridEnd: endOfDay(grid.end),
      cachedEvents,
      calendarColorMap,
      visibleCalendarIds,
    });
  }, [
    grid,
    getCachedEventsForRange,
    cacheBuster,
    calendarColorMap,
    visibleCalendarIds,
  ]);

  return { grid, dayEventsMap, monthKey, toDayKey: toMiniCalendarDayKey };
}
