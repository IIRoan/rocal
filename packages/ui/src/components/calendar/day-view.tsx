"use client";

import React, { useMemo, useRef } from "react";
import type { TimeFormat } from "@workspace/calendar-core";
import {
  getTimedTimelineEventsForDay,
  resolveTimezone,
  utcToPickerDate,
  wallClockToUtc,
} from "@workspace/calendar-core";
import { AllDayEventRow } from "./all-day-event-row";
import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { WeekCellsHeight, StartHour } from "./constants";
import { useTimelineStartScroll } from "./use-timeline-start-scroll";
import { CalendarEvent } from "./types";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { cn } from "../../lib/utils";
import { CurrentTimeIndicator } from "./current-time-indicator";
import { layoutTimelineEvents } from "./timeline-layout";
import { WeekViewDayHeaders } from "./week-view-day-headers";
import { WEEK_HOUR_VALUES, formatWeekHourLabel } from "./week-view-hours";

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  compactView?: boolean;
  timeFormat: TimeFormat;
  timezone?: string;
  workingDays?: number[];
  onEventEdit?: (event: CalendarEvent) => void;
  onEventDelete?: (event: CalendarEvent) => void;
  onEventView?: (event: CalendarEvent) => void;
}

export function DayView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  compactView = false,
  timeFormat,
  timezone,
  onEventEdit,
  onEventDelete,
  onEventView,
}: DayViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const resolvedTimezone = resolveTimezone(timezone);
  const calendarDay = useMemo(
    () => utcToPickerDate(currentDate, resolvedTimezone),
    [currentDate, resolvedTimezone],
  );
  const days = useMemo(() => [calendarDay], [calendarDay]);

  const positionedEvents = useMemo(() => {
    return layoutTimelineEvents(
      getTimedTimelineEventsForDay(events, calendarDay, resolvedTimezone, {
        excludeMultiDay: true,
      }),
      calendarDay,
      {
        cellHeight: WeekCellsHeight,
        startHour: StartHour,
        sortByDurationOnTie: true,
        widthStrategy: "desktop-cascade",
        timezone: resolvedTimezone,
      },
    );
  }, [calendarDay, events, resolvedTimezone]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
    days,
    resolvedTimezone,
  );

  useTimelineStartScroll(scrollContainerRef, currentDate);

  const handlers = {
    onEventClick: handleEventClick,
    onEventCreate,
    onEventDelete,
    onEventEdit,
    onEventView,
  };

  return (
    <div
      data-slot="day-view"
      className="absolute inset-0 flex flex-col bg-background"
    >
      <WeekViewDayHeaders
        currentDate={currentDate}
        days={days}
        timezone={resolvedTimezone}
      />
      <AllDayEventRow
        columnTemplate="3rem minmax(0, 1fr)"
        days={days}
        events={events}
        handlers={handlers}
        timezone={resolvedTimezone}
        timeFormat={timeFormat}
      />

      <div
        ref={scrollContainerRef}
        className="grid flex-1 grid-cols-[3rem_1fr] overflow-y-auto [scrollbar-gutter:stable] relative min-h-0"
      >
        <div>
          {WEEK_HOUR_VALUES.map((hourValue) => (
            <div
              key={hourValue}
              className="border-border/70 relative h-[var(--week-cells-height)] border-b last:border-b-0"
            >
              {hourValue > StartHour && (
                <span className="bg-background text-muted-foreground absolute -top-3 left-0 flex h-6 w-full items-center justify-end pe-1 text-[11px] tabular-nums">
                  {formatWeekHourLabel(hourValue, timeFormat)}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="relative">
          {positionedEvents.map((positionedEvent) => (
            <div
              key={positionedEvent.event.id}
              className="absolute z-10 px-0.5"
              style={{
                top: `${positionedEvent.top}px`,
                height: `${positionedEvent.height}px`,
                left: `${positionedEvent.left * 100}%`,
                width: `${positionedEvent.width * 100}%`,
                zIndex: positionedEvent.zIndex,
              }}
            >
              <div className="h-full w-full">
                <DraggableEvent
                  event={positionedEvent.event}
                  view="day"
                  onClick={(e) => handleEventClick(positionedEvent.event, e)}
                  showTime
                  height={positionedEvent.height}
                  timeFormat={timeFormat}
                  timezone={timezone}
                  onEdit={onEventEdit}
                  onDelete={onEventDelete}
                  onView={onEventView}
                />
              </div>
            </div>
          ))}

          {currentTimeVisible && (
            <CurrentTimeIndicator
              position={currentTimePosition}
              variant="destructive"
            />
          )}

          {WEEK_HOUR_VALUES.map((hourValue) => {
            return (
              <div
                key={hourValue}
                className="border-border/70 relative h-[var(--week-cells-height)] border-b last:border-b-0"
              >
                {[0, 1, 2, 3].map((quarter) => {
                  const quarterHourTime = hourValue + quarter * 0.25;
                  return (
                    <DroppableCell
                      key={quarter}
                      id={`day-cell-h${hourValue}-q${quarter}`}
                      date={calendarDay}
                      time={quarterHourTime}
                      className={cn(
                        "absolute h-[calc(var(--week-cells-height)/4)] w-full",
                        quarter === 0 && "top-0",
                        quarter === 1 &&
                          "top-[calc(var(--week-cells-height)/4)]",
                        quarter === 2 &&
                          "top-[calc(var(--week-cells-height)/4*2)]",
                        quarter === 3 &&
                          "top-[calc(var(--week-cells-height)/4*3)]",
                      )}
                      onClick={() => {
                        onEventCreate(
                          wallClockToUtc(
                            calendarDay,
                            hourValue,
                            quarter * 15,
                            resolvedTimezone,
                          ),
                        );
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
