"use client";

import { useDeferredValue, useEffect, useMemo } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { CalendarEvent } from "../components/calendar/types";

interface DateRange {
  start: Date;
  end: Date;
}

interface UseMiniCalendarMonthDataOptions {
  calendarMonth: Date;
  events: CalendarEvent[];
  onDisplayMonthChange?: (dateRange: DateRange) => void;
  rangeChangeDebounceMs?: number;
}

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function useMiniCalendarMonthData({
  calendarMonth,
  events,
  onDisplayMonthChange,
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
  const deferredGrid = useDeferredValue(grid);
  const deferredEvents = useDeferredValue(events);

  useEffect(() => {
    if (!onDisplayMonthChange) return;

    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const run = () =>
      onDisplayMonthChange({ start: deferredGrid.start, end: deferredGrid.end });

    timeoutId = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idleId = (window as any).requestIdleCallback(run, { timeout: 300 });
      } else {
        run();
      }
    }, rangeChangeDebounceMs);

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && "cancelIdleCallback" in window) {
        (window as any).cancelIdleCallback(idleId);
      }
    };
  }, [deferredGrid, onDisplayMonthChange, rangeChangeDebounceMs]);

  const dayEventsMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of deferredGrid.days) {
      map.set(toDayKey(day), []);
    }

    const gridStart = startOfDay(deferredGrid.start);
    const gridEnd = endOfDay(deferredGrid.end);

    for (const event of deferredEvents) {
      const rawStart = new Date(event.start);
      const rawEnd = new Date(event.end);
      if (isNaN(rawStart.getTime()) || isNaN(rawEnd.getTime())) continue;

      const eventStart = startOfDay(rawStart);
      const eventEnd = endOfDay(rawEnd);
      if (eventEnd < gridStart || eventStart > gridEnd) continue;

      const clampedStart = eventStart < gridStart ? gridStart : eventStart;
      const clampedEnd = eventEnd > gridEnd ? gridEnd : eventEnd;
      const daysInEvent = eachDayOfInterval({ start: clampedStart, end: clampedEnd });

      for (const day of daysInEvent) {
        const key = toDayKey(day);
        const existing = map.get(key);
        if (!existing || existing.length >= 3) continue;
        existing.push(event);
      }
    }

    return map;
  }, [deferredEvents, deferredGrid]);

  return { grid, dayEventsMap, monthKey, toDayKey };
}

