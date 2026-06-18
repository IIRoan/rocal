"use client";

import React, { useLayoutEffect, useMemo, useRef } from "react";
import { isCancelledCalendarEvent } from "@workspace/calendar-core";
import {
  eventOverlapsZonedCalendarDay,
  getWeekCalendarDays,
  isTodayInTimezone,
  resolveTimezone,
  utcToPickerDate,
  wallClockToUtc,
} from "@workspace/calendar-core";
import {
  addHours,
  eachHourOfInterval,
  endOfWeek,
  format,
  getHours,
  isBefore,
  isSameDay,
  startOfDay,
  startOfWeek,
  isWithinInterval,
  endOfDay,
} from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { EventItem } from "./event-item";
import {
  isMultiDayEvent,
  sortEvents,
  getAllEventsForDay,
  eventOverlapsRange,
  getEventInterval,
} from "./utils";
import { WeekCellsHeight } from "./constants";
import { CalendarEvent } from "./types";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";

import { StartHour, EndHour } from "./constants";
import { cn } from "../../lib/utils";
import { CurrentTimeIndicator } from "./current-time-indicator";
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
  // Context menu actions
  onEventEdit?: (event: CalendarEvent) => void;
  onEventDelete?: (event: CalendarEvent) => void;
  onEventView?: (event: CalendarEvent) => void;
}

export const WeekView = React.memo(function WeekView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  compactView = false,
  timeFormat = "12h",
  weekStartDay = 0,
  workingDays = [1, 2, 3, 4, 5],
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

  const weekStart = useMemo(
    () =>
      startOfWeek(currentDate, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      }),
    [currentDate, weekStartDay],
  );

  const weekEnd = useMemo(
    () =>
      endOfWeek(currentDate, {
        weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      }),
    [currentDate, weekStartDay],
  );
  const hours = useMemo(() => {
    return eachHourOfInterval({
      start: addHours(new Date(2000, 0, 1), StartHour),
      end: addHours(new Date(2000, 0, 1), EndHour),
    });
  }, []);

  // Get all-day events and multi-day events for the week
  const allDayEvents = useMemo(() => {
    return events
      .filter((event) => event.allDay || isMultiDayEvent(event))
      .filter((event) => eventOverlapsRange(event, weekStart, weekEnd, "day"));
  }, [events, weekStart, weekEnd]);

  const allDayEventsByDay = useMemo(
    () =>
      days.map((day) =>
        sortEvents(
          allDayEvents.filter((event) =>
            eventOverlapsRange(event, day, day, "day"),
          ),
        ),
      ),
    [allDayEvents, days],
  );

  // Process events for each day to calculate positions
  const processedDayEvents = useMemo(() => {
    const result = days.map((day) => {
      // Get events for this day that are not all-day events or multi-day events
      const dayEvents = events.filter((event) => {
        if (event.allDay || isMultiDayEvent(event)) return false;

        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        return eventOverlapsZonedCalendarDay(
          eventStart,
          eventEnd,
          day,
          resolvedTimezone,
        );
      });

      // Sort events by start time
      dayEvents.sort((a, b) => {
        const aStart = new Date(a.start);
        const bStart = new Date(b.start);
        return aStart.getTime() - bStart.getTime();
      });

      return layoutTimelineEvents(dayEvents, day, {
        cellHeight: WeekCellsHeight,
        startHour: StartHour,
        widthStrategy: "no-overflow",
        timezone: resolvedTimezone,
      }).map((positionedEvent) => ({
        ...positionedEvent,
        dayIndex: 0,
      }));
    });

    return result;
  }, [days, events, resolvedTimezone]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
    currentDate,
    "week",
    timezone,
  );

  // Position the timeline before paint so view transitions do not visibly jump.
  useLayoutEffect(() => {
    if (!scrollContainerRef.current) {
      return;
    }

    const targetHour = 9;
    const scrollPosition = Math.max(
      0,
      (targetHour - StartHour) * WeekCellsHeight,
    );

    const previousScrollBehavior =
      scrollContainerRef.current.style.scrollBehavior;
    scrollContainerRef.current.style.scrollBehavior = "auto";
    scrollContainerRef.current.scrollTop = scrollPosition;
    scrollContainerRef.current.style.scrollBehavior = previousScrollBehavior;
  }, [currentDate]);

  return (
    <div
      data-slot="week-view"
      className="absolute inset-0 flex flex-col bg-background animate-fade-in"
    >
      <div className="z-40 bg-background/95 backdrop-blur-md shrink-0">
        {/* Day headers row: timezone + day names */}
        <div className="hidden w-full grid-cols-[3rem_repeat(7,minmax(0,1fr))] items-center justify-between pt-3 sm:grid border-b border-border/40">
          <div className="caption text-right text-muted-foreground/40 text-[9px] pr-1.5">
            {timezone
              ? formatInTimeZone(new Date(), timezone, "zzz")
              : format(new Date(), "zzz")}
          </div>
          {days.map((day, dayIndex) => (
            <div
              key={dayIndex}
              className="caption w-full text-center text-muted-foreground/70"
            >
              <span
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wider",
                  isTodayInTimezone(day, resolvedTimezone)
                    ? "rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground"
                    : "",
                )}
              >
                {format(day, "EEE")} {format(day, "d")}
              </span>
            </div>
          ))}
        </div>

        {/* Mobile day headers */}
        <div className="sm:hidden grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] border-b border-border/40 pt-2">
          <div className="flex items-center justify-end text-[8px] font-medium text-muted-foreground/40 pr-1">
            {timezone
              ? formatInTimeZone(new Date(), timezone, "zzz")
              : format(new Date(), "zzz")}
          </div>
          {days.map((day, dayIndex) => (
            <div
              key={dayIndex}
              className="w-full text-center text-muted-foreground/70"
            >
              <span
                className={cn(
                  "text-[10px] font-medium uppercase",
                  isTodayInTimezone(day, resolvedTimezone)
                    ? "rounded-md bg-primary px-1.5 py-0.5 font-medium text-primary-foreground"
                    : "",
                )}
              >
                {format(day, "E")[0]} {format(day, "d")}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* All-day events row (non-sticky) */}
      <div className="grid w-full grid-cols-[3rem_repeat(7,minmax(0,1fr))] items-stretch border-b border-border/40 relative z-30 shrink-0">
        <div className="h-full flex flex-col bg-background">
          <div className="flex flex-1 flex-col items-center justify-center min-h-[24px]">
            <span className="text-[9px] text-muted-foreground/40 leading-none">
              all-day
            </span>
          </div>
        </div>
        {days.map((day, dayIndex) => {
          const dayEvents = allDayEventsByDay[dayIndex] ?? [];
          return (
            <div
              key={`all-day-${day.toString()}`}
              className="shadow-sm h-full flex flex-col bg-background"
            >
              <div
                className={cn(
                  "flex flex-1 flex-col justify-start p-0.5 gap-0.5",
                  dayEvents.length === 0 && "min-h-[24px]",
                )}
              >
                {dayEvents.map((event) => {
                  const { start: eStartDay, end: eEndDay } = getEventInterval(
                    event,
                    "day",
                  );
                  const weekStartDay = startOfDay(weekStart);
                  const weekEndDay = endOfDay(weekEnd);
                  const visibleStart = isBefore(eStartDay, weekStartDay)
                    ? weekStartDay
                    : eStartDay;
                  const visibleEnd = isBefore(weekEndDay, eEndDay)
                    ? weekEndDay
                    : eEndDay;

                  const isFirstSegmentDay = isSameDay(day, visibleStart);
                  const isLastSegmentDay = isSameDay(day, visibleEnd);
                  const shouldShowTitle = isFirstSegmentDay;

                  return (
                    <div key={`allday-${event.id}`} className="w-full">
                      <EventItem
                        onClick={(e) => handleEventClick(event, e)}
                        event={event}
                        view="month"
                        isFirstDay={isFirstSegmentDay}
                        isLastDay={isLastSegmentDay}
                        className="text-[10px] min-h-[20px] h-[22px] items-center"
                        timezone={timezone}
                        onEdit={onEventEdit}
                        onDelete={onEventDelete}
                        onView={onEventView}
                      >
                        <div
                          className={cn(
                            "truncate text-[10px] leading-tight",
                            !shouldShowTitle && "invisible",
                          )}
                          aria-hidden={!shouldShowTitle}
                        >
                          <span
                            className={cn(
                              isCancelledCalendarEvent(event) &&
                                "line-through opacity-70",
                            )}
                          >
                            {event.title}
                          </span>
                        </div>
                      </EventItem>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div
        ref={scrollContainerRef}
        className="grid flex-1 grid-cols-[3rem_repeat(7,minmax(0,1fr))] overflow-y-auto min-h-0"
        style={{ scrollBehavior: "auto" }}
      >
        {/* Gutter column — time labels only, no stripes */}
        <div className="grid auto-cols-fr">
          {hours.map((hour, hourIndex) => (
            <div
              key={hourIndex}
              className="relative min-h-[var(--week-cells-height)]"
            >
              {hourIndex > 0 && (
                <span className="bg-background text-muted-foreground/70 absolute -top-3 left-0 flex h-6 w-full items-center justify-end pe-1 text-[9px] sm:text-[10px]">
                  {format(hour, timeFormat === "24h" ? "HH:mm" : "h a")}
                </span>
              )}
            </div>
          ))}
        </div>

        {days.map((day, dayIndex) => (
          <div
            key={dayIndex}
            className={`border-border/70 relative border-r last:border-r-0 grid auto-cols-fr ${
              isTodayInTimezone(day, resolvedTimezone)
                ? "bg-[var(--calendar-accent-bg)]/20"
                : ""
            }`}
            data-today={
              isTodayInTimezone(day, resolvedTimezone) || undefined
            }
          >
            {/* Positioned events */}
            {(processedDayEvents[dayIndex] ?? []).map(
              (positionedEvent, index) => (
                <div
                  key={positionedEvent.event?.id || index}
                  className="absolute z-10 h-full"
                  style={{
                    top: `${positionedEvent.top}px`,
                    height: `${positionedEvent.height}px`,
                    left: `${positionedEvent.left * 100}%`,
                    width: `${positionedEvent.width * 100}%`,
                    zIndex: positionedEvent.zIndex,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="h-full w-full px-[1px]">
                    {positionedEvent.event && (
                      <DraggableEvent
                        event={positionedEvent.event}
                        view="week"
                        onClick={(e) =>
                          handleEventClick(positionedEvent.event, e)
                        }
                        showTime
                        height={positionedEvent.height}
                        timeFormat={timeFormat}
                        timezone={timezone}
                        onEdit={onEventEdit}
                        onDelete={onEventDelete}
                        onView={onEventView}
                      />
                    )}
                  </div>
                </div>
              ),
            )}

            {/* Current time indicator - only show for today's column */}
            {currentTimeVisible && isTodayInTimezone(day, resolvedTimezone) && (
              <CurrentTimeIndicator
                position={currentTimePosition}
                variant="calendar-accent"
              />
            )}
            {hours.map((hour, hourIndex) => {
              const hourValue = getHours(hour);
              return (
                <div
                  key={hourIndex}
                  className="border-border/70 relative min-h-[var(--week-cells-height)] border-b last:border-b-0"
                >
                  {/* Quarter-hour intervals */}
                  {[0, 1, 2, 3].map((quarter) => {
                    const quarterHourTime = hourValue + quarter * 0.25;
                    return (
                      <DroppableCell
                        key={quarter}
                        id={`week-cell-d${dayIndex}-h${hourIndex}-q${quarter}`}
                        date={day}
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
                              day,
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
        ))}
      </div>
    </div>
  );
});
