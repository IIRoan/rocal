"use client";

import React, { useMemo, useEffect, useRef } from "react";
import {
  addHours,
  areIntervalsOverlapping,
  eachHourOfInterval,
  format,
  getHours,
  getMinutes,
  isSameDay,
  startOfDay,
} from "date-fns";

import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { eventOverlapsRange } from "./utils";
import { CalendarEvent } from "./types";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { cn } from "../../lib/utils";

// Show entire 24 hours for mobile
const MobileStartHour = 0;
const MobileEndHour = 23;
const MobileCellHeight = 60; // Cells for each hour

interface MobileDayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  workingDays?: number[];
  showMonthPicker?: boolean;
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
}

export function MobileDayView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  timeFormat = "12h",
  timezone,
  workingDays = [1, 2, 3, 4, 5],
  showMonthPicker = true,
  weekStartDay = 1,
}: MobileDayViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const hours = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    return eachHourOfInterval({
      start: addHours(dayStart, MobileStartHour),
      end: addHours(dayStart, MobileEndHour),
    });
  }, [currentDate]);

  // Get time-based events (excluding all-day/multi-day events which are shown in sticky header)
  const timeEvents = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    const dayEnd = addHours(dayStart, 24);
    return events
      .filter((event) => {
        // Exclude all-day and multi-day events
        if (event.allDay) return false;
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        if (!isSameDay(eventStart, eventEnd)) return false;
        return eventOverlapsRange(event, dayStart, dayEnd, "time");
      })
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
  }, [currentDate, events]);

  const positionedEvents = useMemo(() => {
    const result: PositionedEvent[] = [];
    const dayStart = startOfDay(currentDate);

    const sortedEvents = [...timeEvents].sort((a, b) => {
      const aStart = new Date(a.start);
      const bStart = new Date(b.start);
      const aEnd = new Date(a.end);
      const bEnd = new Date(b.end);

      if (aStart < bStart) return -1;
      if (aStart > bStart) return 1;

      const aDuration = (aEnd.getTime() - aStart.getTime()) / 60000;
      const bDuration = (bEnd.getTime() - bStart.getTime()) / 60000;
      return bDuration - aDuration;
    });

    const columns: { event: CalendarEvent; end: Date }[][] = [];
    const eventColumnMapping: Map<CalendarEvent, number> = new Map();

    sortedEvents.forEach((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      const adjustedStart = isSameDay(currentDate, eventStart)
        ? eventStart
        : dayStart;
      const adjustedEnd = isSameDay(currentDate, eventEnd)
        ? eventEnd
        : addHours(dayStart, 24);

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

      const currentColumn = columns[columnIndex] || [];
      columns[columnIndex] = currentColumn;
      currentColumn.push({ event, end: adjustedEnd });
      eventColumnMapping.set(event, columnIndex);
    });

    sortedEvents.forEach((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      const adjustedStart = isSameDay(currentDate, eventStart)
        ? eventStart
        : dayStart;
      const adjustedEnd = isSameDay(currentDate, eventEnd)
        ? eventEnd
        : addHours(dayStart, 24);

      const startHour =
        getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
      const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;

      // Calculate position for full 24-hour day
      const top = startHour * MobileCellHeight;
      const height = Math.max((endHour - startHour) * MobileCellHeight, 22);

      const columnIndex = eventColumnMapping.get(event) ?? 0;

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

      let width: number;
      let left: number;

      // Mobile-optimized width calculation - wider events for better readability
      if (overlappingColumns === 1) {
        width = 0.95;
        left = 0.02;
      } else if (overlappingColumns === 2) {
        width = columnIndex === 0 ? 0.92 : 0.78;
        left = columnIndex === 0 ? 0.02 : 0.18;
      } else if (overlappingColumns === 3) {
        const widths = [0.88, 0.74, 0.6];
        const positions = [0.02, 0.12, 0.28];
        width = widths[columnIndex] || 0.55;
        left = positions[columnIndex] || 0.38;
      } else {
        const baseWidth = 0.72;
        const widthDecrement = 0.06;
        width = Math.max(0.55, baseWidth - columnIndex * widthDecrement);
        const offsetIncrement = 0.1;
        left = Math.min(columnIndex * offsetIncrement, 0.35);
      }

      result.push({
        event,
        top,
        height,
        left,
        width,
        zIndex: 10 + columnIndex,
      });
    });

    return result;
  }, [currentDate, timeEvents]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
    currentDate,
    "day",
    timezone,
  );

  // Auto-scroll to current time or 9 AM
  useEffect(() => {
    if (scrollContainerRef.current && !hasScrolledRef.current) {
      const now = new Date();
      const currentHour = getHours(now);
      const currentMinute = getMinutes(now);

      let targetHour: number;

      if (isSameDay(currentDate, now)) {
        // If it's today, scroll to current time
        targetHour = currentHour + currentMinute / 60;
      } else {
        // Otherwise scroll to 9 AM
        targetHour = 9;
      }

      const scrollPosition = targetHour * MobileCellHeight - 100; // Account for sticky header
      scrollContainerRef.current.scrollTo({
        top: Math.max(0, scrollPosition),
        behavior: "smooth",
      });
      hasScrolledRef.current = true;
    }
  }, [currentDate]);

  // Reset scroll flag when date changes
  useEffect(() => {
    hasScrolledRef.current = false;
  }, [currentDate]);

  return (
    <div className="flex flex-col h-full min-h-full">
      {/* Timeline with events */}
      <div className="relative pt-3">
        {/* Time column - all hours shown, time label ON the hour line */}
        <div className="absolute left-0 top-0 w-11 z-10 bg-background pt-3">
          {hours.map((hour) => (
            <div
              key={hour.toString()}
              className="relative"
              style={{ height: MobileCellHeight }}
            >
              {/* Time label positioned ON the line with background to hide line behind text */}
              <span className="absolute top-0 left-0.5 -translate-y-1/2 bg-background px-0.5 text-[9px] font-medium text-muted-foreground">
                {format(hour, timeFormat === "24h" ? "HH:00" : "h:00a")}
              </span>
            </div>
          ))}
        </div>

        {/* Events column */}
        <div className="ml-11 relative">
          {/* Positioned events */}
          {positionedEvents.map((positionedEvent) => (
            <div
              key={positionedEvent.event.id}
              className="absolute z-10 px-1"
              style={{
                top: `${positionedEvent.top}px`,
                height: `${positionedEvent.height}px`,
                left: `${positionedEvent.left * 100}%`,
                width: `${positionedEvent.width * 100}%`,
                zIndex: positionedEvent.zIndex,
              }}
            >
              <DraggableEvent
                event={positionedEvent.event}
                view="day"
                onClick={(e) => handleEventClick(positionedEvent.event, e)}
                showTime
                height={positionedEvent.height}
                timeFormat={timeFormat}
                timezone={timezone}
              />
            </div>
          ))}

          {/* Current time indicator - enhanced for mobile */}
          {currentTimeVisible && (
            <div
              className="pointer-events-none absolute right-2 left-0 z-20"
              style={{ top: `${currentTimePosition}%` }}
            >
              <div className="relative flex items-center">
                <div className="bg-primary text-primary-foreground absolute -left-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm">
                  {format(new Date(), timeFormat === "24h" ? "HH:mm" : "h:mm")}
                </div>
                <div className="bg-primary h-[2px] w-full shadow-sm"></div>
                <div className="bg-primary absolute -right-1 size-2.5 rounded-full shadow-sm"></div>
              </div>
            </div>
          )}

          {/* Time grid cells for creating events */}
          {hours.map((hour) => {
            const hourValue = getHours(hour);
            return (
              <div
                key={hour.toString()}
                className="relative border-b border-border/50"
                style={{ height: MobileCellHeight }}
              >
                {[0, 1, 2, 3].map((quarter) => {
                  const quarterHourTime = hourValue + quarter * 0.25;
                  return (
                    <DroppableCell
                      key={`${hour.toString()}-${quarter}`}
                      id={`mobile-day-cell-${currentDate.toISOString()}-${quarterHourTime}`}
                      date={currentDate}
                      time={quarterHourTime}
                      className={cn(
                        "absolute w-full h-[15px]",
                        quarter === 0 && "top-0",
                        quarter === 1 && "top-1/4",
                        quarter === 2 && "top-1/2",
                        quarter === 3 && "top-3/4",
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
