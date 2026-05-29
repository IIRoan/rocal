"use client";

import React, { useMemo, useEffect, useRef } from "react";
import {
  addHours,
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
import { CurrentTimeIndicator } from "./current-time-indicator";
import { layoutTimelineEvents } from "./timeline-layout";

// Show entire 24 hours for mobile
const MobileStartHour = 0;
const MobileEndHour = 23;
const MobileCellHeight = 60; // Cells for each hour

function formatCurrentTimeLabel(
  currentTime: { hours: number; minutes: number } | null,
  timeFormat: "12h" | "24h",
) {
  if (!currentTime) return undefined;

  const minutes = currentTime.minutes.toString().padStart(2, "0");

  if (timeFormat === "24h") {
    return `${currentTime.hours.toString().padStart(2, "0")}:${minutes}`;
  }

  const hour = currentTime.hours % 12 || 12;
  return `${hour}:${minutes}`;
}

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
    return layoutTimelineEvents(timeEvents, currentDate, {
      cellHeight: MobileCellHeight,
      sortByDurationOnTie: true,
      widthStrategy: "mobile-cascade",
    });
  }, [currentDate, timeEvents]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const { currentTimePosition, currentTimeVisible, currentTime } =
    useCurrentTimeIndicator(currentDate, "day", timezone);
  const currentTimeLabel = formatCurrentTimeLabel(currentTime, timeFormat);

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
            <CurrentTimeIndicator
              position={currentTimePosition}
              label={currentTimeLabel}
              showEndDot
              className="right-2"
            />
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
