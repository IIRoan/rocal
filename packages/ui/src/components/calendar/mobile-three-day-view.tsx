"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { areIntervalsOverlapping } from "date-fns";
import { resolveTimezone } from "@workspace/calendar-core";

import { AllDayEventRow } from "./all-day-event-row";
import { CalendarEvent } from "./types";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { layoutTimelineEvents } from "./timeline-layout";
import type { PositionedTimelineEvent } from "./timeline-layout";
import { StartHour, WeekCellsHeight } from "./constants";
import {
  getThreeDayCalendarDays,
  getThreeDayTimelineScrollTop,
} from "./three-day-view-utils";
import { ThreeDayOverlapDrawer } from "./three-day-overlap-drawer";
import { ThreeDayViewDayHeaders } from "./three-day-view-day-headers";
import { ThreeDayViewTimeGrid } from "./three-day-view-time-grid";
import { getTimedTimelineEventsForDay } from "./utils";

interface MobileThreeDayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  timeFormat?: "12h" | "24h";
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  workingDays?: number[];
  timezone?: string;
  onEventEdit?: (event: CalendarEvent) => void;
  onEventDelete?: (event: CalendarEvent) => void;
  onEventView?: (event: CalendarEvent) => void;
}

function collectOverlappingEvents(
  dayEvents: PositionedTimelineEvent[],
  event: CalendarEvent,
): CalendarEvent[] {
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);
  const overlapping: CalendarEvent[] = [];

  for (const positioned of dayEvents) {
    if (!positioned.event) continue;
    if (
      !areIntervalsOverlapping(
        { start: eventStart, end: eventEnd },
        {
          start: new Date(positioned.event.start),
          end: new Date(positioned.event.end),
        },
      )
    ) {
      continue;
    }
    overlapping.push(positioned.event);
  }

  overlapping.sort(
    (left, right) =>
      new Date(left.start).getTime() - new Date(right.start).getTime(),
  );
  return overlapping;
}

export function MobileThreeDayView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  timeFormat = "24h",
  timezone,
  onEventEdit,
  onEventDelete,
  onEventView,
}: MobileThreeDayViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEvents, setDrawerEvents] = useState<CalendarEvent[]>([]);
  const resolvedTimezone = resolveTimezone(timezone);

  const days = useMemo(
    () => getThreeDayCalendarDays(currentDate),
    [currentDate],
  );

  const processedDayEvents = useMemo(() => {
    return days.map((day) => {
      const dayEvents = getTimedTimelineEventsForDay(
        events,
        day,
        resolvedTimezone,
        { excludeMultiDay: true },
      );

      dayEvents.sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );

      return layoutTimelineEvents(dayEvents, day, {
        cellHeight: WeekCellsHeight,
        startHour: StartHour,
        widthStrategy: "simple-no-overflow",
        timezone: resolvedTimezone,
      });
    });
  }, [days, events, resolvedTimezone]);

  const handleEventClick = (
    event: CalendarEvent,
    mouseEvent: React.MouseEvent,
    dayIndex?: number,
  ) => {
    mouseEvent.stopPropagation();
    const isMobileScreen =
      typeof window !== "undefined" && window.innerWidth < 640;

    if (isMobileScreen && dayIndex !== undefined) {
      const overlapping = collectOverlappingEvents(
        processedDayEvents[dayIndex] ?? [],
        event,
      );

      if (overlapping.length > 1) {
        setDrawerEvents(overlapping);
        setDrawerOpen(true);
        return;
      }
    }

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

    const scrollPosition = getThreeDayTimelineScrollTop(days, timezone);
    const scrollContainer = scrollContainerRef.current;
    const previousScrollBehavior = scrollContainer.style.scrollBehavior;

    scrollContainer.style.scrollBehavior = "auto";
    scrollContainer.scrollTop = scrollPosition;
    scrollContainer.style.scrollBehavior = previousScrollBehavior;
  }, [currentDate, days, timezone]);

  const allDayHandlers = {
    onEventClick: handleEventClick,
    onEventCreate,
    onEventDelete,
    onEventEdit,
    onEventView,
  };

  return (
    <div
      data-slot="three-day-view"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background animate-fade-in"
    >
      <ThreeDayViewDayHeaders
        currentDate={currentDate}
        days={days}
        timezone={resolvedTimezone}
      />
      <AllDayEventRow
        columnTemplate="3rem repeat(3, minmax(0, 1fr))"
        days={days}
        events={events}
        handlers={allDayHandlers}
        timezone={resolvedTimezone}
      />
      <ThreeDayViewTimeGrid
        currentTimePosition={currentTimePosition}
        currentTimeVisible={currentTimeVisible}
        days={days}
        onEventClick={handleEventClick}
        onEventCreate={onEventCreate}
        onEventDelete={onEventDelete}
        onEventEdit={onEventEdit}
        onEventView={onEventView}
        processedDayEvents={processedDayEvents}
        scrollRef={scrollContainerRef}
        timeFormat={timeFormat}
        timezone={resolvedTimezone}
      />
      <ThreeDayOverlapDrawer
        events={drawerEvents}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setDrawerEvents([]);
        }}
        onEventSelect={(event) => {
          onEventSelect(event);
          setDrawerOpen(false);
          setDrawerEvents([]);
        }}
        timezone={resolvedTimezone}
      />
    </div>
  );
}
