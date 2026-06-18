"use client";

import React, { useMemo } from "react";
import { isCancelledCalendarEvent } from "@workspace/calendar-core";
import {
  eventOverlapsZonedCalendarDay,
  resolveTimezone,
  utcToPickerDate,
  wallClockToUtc,
} from "@workspace/calendar-core";
import {
  addHours,
  eachHourOfInterval,
  format,
  getHours,
} from "date-fns";

import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { EncryptionStatusBadge } from "./encryption-status";
import { EventItem } from "./event-item";
import { getEventSegmentForCalendarDay, isAllDayRowEvent } from "./utils";
import { WeekCellsHeight, StartHour, EndHour } from "./constants";
import { CalendarEvent } from "./types";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { cn } from "../../lib/utils";
import { CurrentTimeIndicator } from "./current-time-indicator";
import { layoutTimelineEvents } from "./timeline-layout";

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  compactView?: boolean;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  workingDays?: number[];
  // Context menu actions
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
  timeFormat = "12h",
  timezone,
  onEventEdit,
  onEventDelete,
  onEventView,
}: DayViewProps) {
  const resolvedTimezone = resolveTimezone(timezone);
  const calendarDay = useMemo(
    () => utcToPickerDate(currentDate, resolvedTimezone),
    [currentDate, resolvedTimezone],
  );

  const hours = useMemo(() => {
    return eachHourOfInterval({
      start: addHours(new Date(2000, 0, 1), StartHour),
      end: addHours(new Date(2000, 0, 1), EndHour),
    });
  }, []);

  const dayEvents = useMemo(() => {
    return events
      .filter((event) =>
        eventOverlapsZonedCalendarDay(
          new Date(event.start),
          new Date(event.end),
          calendarDay,
          resolvedTimezone,
        ),
      )
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
  }, [calendarDay, events, resolvedTimezone]);

  // Filter all-day events
  const allDayEvents = useMemo(() => {
    return dayEvents.filter((event) => isAllDayRowEvent(event));
  }, [dayEvents, resolvedTimezone]);

  // Get only single-day time-based events
  const timeEvents = useMemo(() => {
    return dayEvents.filter((event) => !event.allDay);
  }, [dayEvents]);

  // Process events to calculate positions
  const positionedEvents = useMemo(() => {
    return layoutTimelineEvents(timeEvents, calendarDay, {
      cellHeight: WeekCellsHeight,
      startHour: StartHour,
      sortByDurationOnTie: true,
      widthStrategy: "desktop-cascade",
      timezone: resolvedTimezone,
    });
  }, [calendarDay, resolvedTimezone, timeEvents]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const showAllDaySection = allDayEvents.length > 0;
  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
    currentDate,
    "day",
    timezone,
  );

  return (
    <div
      data-slot="day-view"
      className="absolute inset-0 flex flex-col bg-background animate-fade-in"
    >
      {showAllDaySection && (
        <div className="border-border/70 bg-muted/50 border-t shrink-0">
          <div className="grid grid-cols-[3rem_1fr] sm:grid-cols-[4rem_1fr]">
            <div className="relative">
              <span className="text-muted-foreground/70 absolute bottom-0 left-0 h-6 w-16 max-w-full pe-2 text-right text-[10px] sm:pe-4 sm:text-xs">
                All day
              </span>
            </div>
            <div className="border-border/70 relative border-r p-1 last:border-r-0">
              {allDayEvents.map((event) => {
                const { isFirstDay, isLastDay } = getEventSegmentForCalendarDay(
                  event,
                  calendarDay,
                  resolvedTimezone,
                );

                return (
                  <EventItem
                    key={`spanning-${event.id}`}
                    onClick={(e) => handleEventClick(event, e)}
                    event={event}
                    view="month"
                    isFirstDay={isFirstDay}
                    isLastDay={isLastDay}
                    timezone={timezone}
                    onEdit={onEventEdit}
                    onDelete={onEventDelete}
                    onView={onEventView}
                  >
                    {/* Always show the title in day view for better usability */}
                    <div className="flex items-center gap-1 min-w-0">
                      <EncryptionStatusBadge item={event} asIcon />
                      <span
                        className={cn(
                          "truncate",
                          isCancelledCalendarEvent(event) &&
                            "line-through opacity-70",
                        )}
                      >
                        {event.title}
                      </span>
                    </div>
                  </EventItem>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="border-border/70 grid flex-1 grid-cols-[3rem_1fr] border-t sm:grid-cols-[4rem_1fr] overflow-y-auto relative min-h-0">
        <div>
          {hours.map((hour, hourIndex) => (
            <div
              key={hourIndex}
              className="border-border/70 relative h-[var(--week-cells-height)] border-b last:border-b-0"
            >
              {hourIndex > 0 && (
                <span className="bg-background text-muted-foreground/70 absolute -top-3 left-0 flex h-6 w-16 max-w-full items-center justify-end pe-2 text-[10px] sm:pe-4 sm:text-xs">
                  {format(hour, timeFormat === "24h" ? "HH:mm" : "h a")}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="relative">
          {/* Positioned events */}
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

          {/* Current time indicator */}
          {currentTimeVisible && (
            <CurrentTimeIndicator
              position={currentTimePosition}
              variant="destructive"
            />
          )}

          {/* Time grid */}
          {hours.map((hour, hourIndex) => {
            const hourValue = getHours(hour);
            return (
              <div
                key={hourIndex}
                className="border-border/70 relative h-[var(--week-cells-height)] border-b last:border-b-0"
              >
                {/* Quarter-hour intervals */}
                {[0, 1, 2, 3].map((quarter) => {
                  const quarterHourTime = hourValue + quarter * 0.25;
                  return (
                    <DroppableCell
                      key={quarter}
                      id={`day-cell-h${hourIndex}-q${quarter}`}
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
