"use client";

import React, { useLayoutEffect, useMemo, useRef } from "react";
import {
  getWeekCalendarDays,
  resolveTimezone,
} from "@workspace/calendar-core";

import { AllDayEventRow } from "./all-day-event-row";
import { WeekViewDayHeaders } from "./week-view-day-headers";
import { WeekViewTimeGrid } from "./week-view-time-grid";
import { getTimedTimelineEventsForDay } from "./utils";
import { StartHour, WeekCellsHeight } from "./constants";
import { CalendarEvent } from "./types";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { layoutTimelineEvents } from "./timeline-layout";

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  compactView?: boolean;
  timeFormat?: "12h" | "24h";
  weekStartDay?: number;
  workingDays?: number[];
  timezone?: string;
  onEventEdit?: (event: CalendarEvent) => void;
  onEventDelete?: (event: CalendarEvent) => void;
  onEventView?: (event: CalendarEvent) => void;
}

export const WeekView = React.memo(function WeekView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  timeFormat = "12h",
  weekStartDay = 0,
  timezone,
  onEventEdit,
  onEventDelete,
  onEventView,
}: WeekViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const resolvedTimezone = resolveTimezone(timezone);
  const days = useMemo(
    () => getWeekCalendarDays(currentDate, weekStartDay, resolvedTimezone),
    [currentDate, weekStartDay, resolvedTimezone],
  );

  const processedDayEvents = useMemo(() => {
    return days.map((day) => {
      const dayEvents = getTimedTimelineEventsForDay(
        events,
        day,
        resolvedTimezone,
        { excludeMultiDay: true },
      );

      dayEvents.sort((left, right) => {
        return (
          new Date(left.start).getTime() - new Date(right.start).getTime()
        );
      });

      return layoutTimelineEvents(dayEvents, day, {
        cellHeight: WeekCellsHeight,
        startHour: StartHour,
        widthStrategy: "no-overflow",
        timezone: resolvedTimezone,
      });
    });
  }, [days, events, resolvedTimezone]);

  const handleEventClick = (event: CalendarEvent, mouseEvent: React.MouseEvent) => {
    mouseEvent.stopPropagation();
    onEventSelect(event);
  };

  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
    currentDate,
    "week",
    timezone,
  );

  useLayoutEffect(() => {
    if (!scrollContainerRef.current) {
      return;
    }

    const scrollPosition = Math.max(0, (9 - StartHour) * WeekCellsHeight);
    const previousScrollBehavior =
      scrollContainerRef.current.style.scrollBehavior;
    scrollContainerRef.current.style.scrollBehavior = "auto";
    scrollContainerRef.current.scrollTop = scrollPosition;
    scrollContainerRef.current.style.scrollBehavior = previousScrollBehavior;
  }, [currentDate]);

  const handlers = {
    onEventClick: handleEventClick,
    onEventCreate,
    onEventDelete,
    onEventEdit,
    onEventView,
  };

  return (
    <div
      data-slot="week-view"
      className="absolute inset-0 flex flex-col bg-background animate-fade-in"
    >
      <WeekViewDayHeaders
        currentDate={currentDate}
        days={days}
        timezone={resolvedTimezone}
      />
      <AllDayEventRow
        columnTemplate="3rem repeat(7, minmax(0, 1fr))"
        days={days}
        events={events}
        handlers={handlers}
        timezone={resolvedTimezone}
      />
      <WeekViewTimeGrid
        currentTimePosition={currentTimePosition}
        currentTimeVisible={currentTimeVisible}
        days={days}
        handlers={handlers}
        processedDayEvents={processedDayEvents}
        scrollRef={scrollContainerRef}
        timeFormat={timeFormat}
        timezone={resolvedTimezone}
      />
    </div>
  );
});
