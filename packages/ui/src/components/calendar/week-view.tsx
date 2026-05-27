"use client";

import React, { useLayoutEffect, useMemo, useRef } from "react";
import { isCancelledCalendarEvent } from "@workspace/calendar-core";
import {
  addHours,
  areIntervalsOverlapping,
  differenceInMinutes,
  eachDayOfInterval,
  eachHourOfInterval,
  endOfWeek,
  format,
  getHours,
  getMinutes,
  isBefore,
  isSameDay,
  isToday,
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

interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
  dayIndex: number;
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
  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    const weekEnd = endOfWeek(currentDate, {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate, weekStartDay]);

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
        // Skip all-day events and multi-day events
        if (event.allDay || isMultiDayEvent(event)) return false;

        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        // Check if event is on this day
        // Use proper date comparison for spanning events
        const dayStart = startOfDay(day);
        const dayEnd = addHours(dayStart, 24);
        return (
          isSameDay(day, eventStart) ||
          isSameDay(day, eventEnd) ||
          (eventStart < dayEnd && eventEnd > dayStart)
        );
      });

      // Sort events by start time
      dayEvents.sort((a, b) => {
        const aStart = new Date(a.start);
        const bStart = new Date(b.start);
        return aStart.getTime() - bStart.getTime();
      });

      // Calculate positions for each event using improved layout algorithm
      const positionedEvents: PositionedEvent[] = [];
      const dayStart = startOfDay(day);

      // Track columns for overlapping events
      const columns: { event: CalendarEvent; start: Date; end: Date }[][] = [];
      const eventColumnMapping: Map<CalendarEvent, number> = new Map();

      // First pass: assign events to columns
      dayEvents.forEach((event) => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        // Adjust start and end times if they're outside this day
        const adjustedStart = isSameDay(day, eventStart)
          ? eventStart
          : dayStart;
        const adjustedEnd = isSameDay(day, eventEnd)
          ? eventEnd
          : addHours(dayStart, 24);

        // Find a column for this event group
        let columnIndex = 0;
        let placed = false;

        while (!placed) {
          const col = columns[columnIndex] || [];
          if (col.length === 0) {
            columns[columnIndex] = col;
            placed = true;
          } else {
            const overlaps = col.some((c) =>
              areIntervalsOverlapping(
                { start: adjustedStart, end: adjustedEnd },
                { start: c.start, end: c.end },
              ),
            );
            if (!overlaps) {
              placed = true;
            } else {
              columnIndex++;
            }
          }
        }

        // Ensure column is initialized before pushing
        const currentColumn = columns[columnIndex] || [];
        columns[columnIndex] = currentColumn;
        currentColumn.push({
          event: event,
          start: adjustedStart,
          end: adjustedEnd,
        });
        eventColumnMapping.set(event, columnIndex);
      });

      // Second pass: calculate positions for events
      dayEvents.forEach((event) => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        // Adjust start and end times if they're outside this day
        const adjustedStart = isSameDay(day, eventStart)
          ? eventStart
          : dayStart;
        const adjustedEnd = isSameDay(day, eventEnd)
          ? eventEnd
          : addHours(dayStart, 24);

        // Calculate top position and height
        const startHour =
          getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
        const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;

        const top = (startHour - StartHour) * WeekCellsHeight;
        const height = Math.max((endHour - startHour) * WeekCellsHeight, 22);

        const columnIndex = eventColumnMapping.get(event) ?? 0;
        const totalColumns = columns.length;

        // Calculate overlapping events for this specific time slot
        const overlappingEvents = dayEvents.filter((otherEvent) => {
          if (otherEvent === event) return false;

          const otherStart = new Date(otherEvent.start);
          const otherEnd = new Date(otherEvent.end);

          return areIntervalsOverlapping(
            { start: adjustedStart, end: adjustedEnd },
            { start: otherStart, end: otherEnd },
          );
        });

        const overlappingColumns = overlappingEvents.length + 1;

        // Use improved width and positioning calculation with mobile optimization
        let width: number;
        let left: number;

        // Simple approach for all overlap scenarios - GUARANTEE no overflow
        if (overlappingColumns === 1) {
          width = 1;
          left = 0;
        } else if (overlappingColumns === 2) {
          width = 0.495;
          left = columnIndex === 0 ? 0 : 0.505;
        } else if (overlappingColumns === 3) {
          width = 0.33;
          left = columnIndex === 0 ? 0 : columnIndex === 1 ? 0.34 : 0.67;
        } else if (overlappingColumns === 4) {
          width = 0.2475;
          left =
            columnIndex === 0
              ? 0
              : columnIndex === 1
                ? 0.255
                : columnIndex === 2
                  ? 0.51
                  : 0.765;
        } else {
          // For 5+ events, guarantee no overflow
          const gap = 0.005;
          const totalGap = (overlappingColumns - 1) * gap;
          const availableWidth = 1 - totalGap;
          width = availableWidth / overlappingColumns;
          left = columnIndex === 0 ? 0 : columnIndex * (width + gap);
        }

        positionedEvents.push({
          event: event,
          top,
          height,
          left,
          width,
          zIndex: 10 + columnIndex, // Higher columns get higher z-index
          dayIndex: 0, // Will be set correctly when rendering
        });
      });

      return positionedEvents;
    });

    return result;
  }, [days, events]);

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
                  isToday(day)
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
                  isToday(day)
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
              isToday(day) ? "bg-[var(--calendar-accent-bg)]/20" : ""
            }`}
            data-today={isToday(day) || undefined}
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
                  <div className="h-full w-full px-[1px] sm:px-1">
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
            {currentTimeVisible && isToday(day) && (
              <div
                className="pointer-events-none absolute right-0 left-0 z-20"
                style={{ top: `${currentTimePosition}%` }}
              >
                <div className="relative flex items-center">
                  <div className="bg-[var(--calendar-accent)] absolute -left-1 h-2 w-2 rounded-full"></div>
                  <div className="bg-[var(--calendar-accent)] h-[2px] w-full"></div>
                </div>
              </div>
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
                          const startTime = new Date(day);
                          startTime.setHours(hourValue);
                          startTime.setMinutes(quarter * 15);
                          onEventCreate(startTime);
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
