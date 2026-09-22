"use client";

import React, { useMemo, useSyncExternalStore } from "react";
import { resolveTimezone } from "@workspace/calendar-core";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { MonthDayCell } from "./month-day-cell";
import {
  getAllEventsForDay,
  getEventsForDay,
  getSpanningEventsForDay,
  sortEvents,
} from "./utils";
import { EventGap, EventHeight } from "./constants";
import { CalendarEvent } from "./types";
import { useEventVisibility } from "../../hooks/use-event-visibility";

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  showWeekNumbers?: boolean;
  compactView?: boolean;
  timeFormat?: "12h" | "24h";
  weekStartDay?: number;
  workingDays?: number[];
  timezone?: string;
  onEventEdit?: (event: CalendarEvent) => void;
  onEventDelete?: (event: CalendarEvent) => void;
  onEventView?: (event: CalendarEvent) => void;
}

const subscribeToNothing = () => () => {};

export function MonthView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  showWeekNumbers = false,
  compactView = false,
  timeFormat = "12h",
  weekStartDay = 0,
  workingDays = [1, 2, 3, 4, 5],
  timezone,
  onEventEdit,
  onEventDelete,
  onEventView,
}: MonthViewProps) {
  const resolvedTimezone = resolveTimezone(timezone);
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    const calendarEnd = endOfWeek(monthEnd, {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate, weekStartDay]);

  const weekdays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const date = addDays(
        startOfWeek(new Date(), {
          weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        }),
        i,
      );
      return format(date, "EEE");
    });
  }, [weekStartDay]);

  const weeks = useMemo(() => {
    const result = [];
    let week = [];

    for (let i = 0; i < days.length; i++) {
      week.push(days[i]);
      if (week.length === 7 || i === days.length - 1) {
        result.push(week);
        week = [];
      }
    }

    return result;
  }, [days]);

  const isMounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const { contentRef, getVisibleEventCount } = useEventVisibility({
    eventHeight: compactView ? Math.round(EventHeight * 0.75) : EventHeight,
    eventGap: compactView ? Math.round(EventGap * 0.5) : EventGap,
  });

  type DayBuckets = {
    dayEvents: CalendarEvent[];
    spanningEvents: CalendarEvent[];
    allEvents: CalendarEvent[];
    sortedAllDay: CalendarEvent[];
  };

  const bucketsByDay = useMemo(() => {
    const map = new Map<string, DayBuckets>();
    for (const week of weeks) {
      for (const day of week) {
        if (!day) continue;
        const dayEvents = getEventsForDay(events, day, resolvedTimezone);
        const spanningEvents = getSpanningEventsForDay(
          events,
          day,
          resolvedTimezone,
        );
        map.set(day.toISOString(), {
          dayEvents,
          spanningEvents,
          allEvents: getAllEventsForDay(events, day, resolvedTimezone),
          sortedAllDay: sortEvents(
            [...spanningEvents, ...dayEvents],
            resolvedTimezone,
          ),
        });
      }
    }
    return map;
  }, [events, resolvedTimezone, weeks]);

  return (
    <div data-slot="month-view" className="contents animate-fade-in">
      <div
        className={`border-border/70 grid ${showWeekNumbers ? "grid-cols-8" : "grid-cols-7"} border-y uppercase`}
      >
        {showWeekNumbers && (
          <div className="text-muted-foreground/70 py-2 text-center text-xs font-medium">
            W
          </div>
        )}
        {weekdays.map((day) => (
          <div
            key={day}
            className="text-muted-foreground/70 py-2 text-center text-xs"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr">
        {weeks.map((week, weekIndex) => {
          const weekStart = week[0];
          if (!weekStart) return null;
          return (
            <div
              key={weekStart.toISOString()}
              className={`grid ${showWeekNumbers ? "grid-cols-8" : "grid-cols-7"} [&:last-child>*]:border-b-0`}
            >
              {showWeekNumbers && (
                <div className="border-border/70 border-r border-b bg-muted/10 flex items-center justify-center">
                  <span className="text-muted-foreground/60 text-xs font-medium">
                    {getWeek(weekStart)}
                  </span>
                </div>
              )}
              {week.map((day, dayIndex) => {
                if (!day) return null;
                const buckets = bucketsByDay.get(day.toISOString());
                if (!buckets) return null;

                return (
                  <MonthDayCell
                    key={day.toString()}
                    day={day}
                    currentDate={currentDate}
                    buckets={buckets}
                    weekIndex={weekIndex}
                    dayIndex={dayIndex}
                    isMounted={isMounted}
                    compactView={compactView}
                    timeFormat={timeFormat}
                    workingDays={workingDays}
                    timezone={timezone}
                    resolvedTimezone={resolvedTimezone}
                    contentRef={contentRef}
                    getVisibleEventCount={getVisibleEventCount}
                    onEventSelect={onEventSelect}
                    onEventCreate={onEventCreate}
                    onEventEdit={onEventEdit}
                    onEventDelete={onEventDelete}
                    onEventView={onEventView}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
