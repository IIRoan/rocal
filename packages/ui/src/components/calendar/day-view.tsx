"use client";

import React, { useMemo } from "react";
import { isCancelledCalendarEvent } from "@workspace/calendar-core";
import {
  addHours,
  areIntervalsOverlapping,
  differenceInMinutes,
  eachHourOfInterval,
  format,
  getHours,
  getMinutes,
  isSameDay,
  startOfDay,
} from "date-fns";

import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { EncryptionStatusBadge } from "./encryption-status";
import { EventItem } from "./event-item";
import { isMultiDayEvent, eventOverlapsRange } from "./utils";
import { WeekCellsHeight, StartHour, EndHour } from "./constants";
import { CalendarEvent } from "./types";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { cn } from "../../lib/utils";

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

interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
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
  const hours = useMemo(() => {
    return eachHourOfInterval({
      start: addHours(new Date(2000, 0, 1), StartHour),
      end: addHours(new Date(2000, 0, 1), EndHour),
    });
  }, []);

  const dayEvents = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    const dayEnd = addHours(dayStart, 24);
    return events
      .filter((event) => eventOverlapsRange(event, dayStart, dayEnd, "time"))
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
  }, [currentDate, events]);

  // Filter all-day events
  const allDayEvents = useMemo(() => {
    return dayEvents.filter((event) => {
      // Include explicitly marked all-day events or multi-day events
      return event.allDay || isMultiDayEvent(event);
    });
  }, [dayEvents]);

  // Get only single-day time-based events
  const timeEvents = useMemo(() => {
    return dayEvents.filter((event) => {
      // Exclude all-day events and multi-day events
      return !event.allDay && !isMultiDayEvent(event);
    });
  }, [dayEvents]);

  // Process events to calculate positions
  const positionedEvents = useMemo(() => {
    const result: PositionedEvent[] = [];
    const dayStart = startOfDay(currentDate);

    // Sort events by start time and duration
    const sortedEvents = [...timeEvents].sort((a, b) => {
      const aStart = new Date(a.start);
      const bStart = new Date(b.start);
      const aEnd = new Date(a.end);
      const bEnd = new Date(b.end);

      // First sort by start time
      if (aStart < bStart) return -1;
      if (aStart > bStart) return 1;

      // If start times are equal, sort by duration (longer events first)
      const aDuration = differenceInMinutes(aEnd, aStart);
      const bDuration = differenceInMinutes(bEnd, bStart);
      return bDuration - aDuration;
    });

    // Track columns for overlapping events
    const columns: { event: CalendarEvent; end: Date }[][] = [];
    const eventColumnMapping: Map<CalendarEvent, number> = new Map();

    // First pass: assign events to columns
    sortedEvents.forEach((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      // Adjust start and end times if they're outside this day
      const adjustedStart = isSameDay(currentDate, eventStart)
        ? eventStart
        : dayStart;
      const adjustedEnd = isSameDay(currentDate, eventEnd)
        ? eventEnd
        : addHours(dayStart, 24);

      // Find a column for this event
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
              { start: new Date(c.event.start), end: new Date(c.event.end) },
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
      currentColumn.push({ event, end: adjustedEnd });
      eventColumnMapping.set(event, columnIndex);
    });

    // Second pass: calculate positions with improved algorithm
    sortedEvents.forEach((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      // Adjust start and end times if they're outside this day
      const adjustedStart = isSameDay(currentDate, eventStart)
        ? eventStart
        : dayStart;
      const adjustedEnd = isSameDay(currentDate, eventEnd)
        ? eventEnd
        : addHours(dayStart, 24);

      // Calculate top position and height
      const startHour =
        getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
      const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;
      const top = (startHour - StartHour) * WeekCellsHeight;
      const height = Math.max((endHour - startHour) * WeekCellsHeight, 22);

      const columnIndex = eventColumnMapping.get(event) ?? 0;

      // Calculate overlapping events for this specific event's time slot
      const overlappingEvents = sortedEvents.filter((otherEvent) => {
        if (otherEvent.id === event.id) return false;
        const otherStart = new Date(otherEvent.start);
        const otherEnd = new Date(otherEvent.end);

        return areIntervalsOverlapping(
          { start: adjustedStart, end: adjustedEnd },
          { start: otherStart, end: otherEnd },
        );
      });

      const overlappingColumns = overlappingEvents.length + 1;

      // Use improved width and positioning calculation
      let width: number;
      let left: number;

      if (overlappingColumns === 1) {
        // No overlapping events, take full width
        width = 1;
        left = 0;
      } else if (overlappingColumns <= 3) {
        // For 2-3 overlapping events, use equal distribution with small gaps
        width = (1 / overlappingColumns) * 0.95; // 95% to leave small gap
        left = columnIndex * (1 / overlappingColumns) + columnIndex * 0.01; // Add small offset
      } else {
        // For more than 3 overlapping events, use cascading layout with better spacing
        const baseWidth = 0.75; // Start with 75% width
        const widthDecrement = Math.min(0.1, 0.5 / overlappingColumns); // Decrease width more gradually
        width = baseWidth - columnIndex * widthDecrement;

        // Stagger positioning with better spacing
        const offsetIncrement = Math.min(0.15, 0.8 / overlappingColumns);
        left = columnIndex * offsetIncrement;
      }

      result.push({
        event,
        top,
        height,
        left,
        width,
        zIndex: 10 + columnIndex, // Higher columns get higher z-index
      });
    });

    return result;
  }, [currentDate, timeEvents]);

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
                const eventStart = new Date(event.start);
                const eventEnd = new Date(event.end);
                const isFirstDay = isSameDay(currentDate, eventStart);
                const isLastDay = isSameDay(currentDate, eventEnd);

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
            <div
              className="pointer-events-none absolute right-0 left-0 z-20"
              style={{ top: `${currentTimePosition}%` }}
            >
              <div className="relative flex items-center">
                <div className="bg-destructive absolute -left-1 h-2 w-2 rounded-full"></div>
                <div className="bg-destructive h-[2px] w-full"></div>
              </div>
            </div>
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
                      date={currentDate}
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
                        const startTime = new Date(currentDate);
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
      </div>
    </div>
  );
}
