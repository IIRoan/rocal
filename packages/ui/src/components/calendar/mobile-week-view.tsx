"use client";

import React, { useMemo, useEffect, useRef } from "react";
import {
  addHours,
  areIntervalsOverlapping,
  eachDayOfInterval,
  eachHourOfInterval,
  endOfWeek,
  format,
  getHours,
  getMinutes,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
} from "date-fns";

import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { EventDots, groupEventsByExactTime } from "./event-dots";
import { isMultiDayEvent } from "./utils";
import { CalendarEvent } from "./types";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { cn } from "../../lib/utils";

// Show entire 24 hours for mobile week view
const MobileStartHour = 0;
const MobileEndHour = 23;
const MobileCellHeight = 50; // Smaller cells for week view to fit more

interface MobileWeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  timeFormat?: "12h" | "24h";
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  workingDays?: number[];
  timezone?: string;
  showMonthPicker?: boolean;
}

interface PositionedEvent {
  events: CalendarEvent[];
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
  dayIndex: number;
  isGrouped: boolean;
}

export function MobileWeekView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  timeFormat = "12h",
  weekStartDay = 1,
  workingDays = [1, 2, 3, 4, 5],
  timezone,
  showMonthPicker = true,
}: MobileWeekViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: weekStartDay });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate, weekStartDay]);

  const hours = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    return eachHourOfInterval({
      start: addHours(dayStart, MobileStartHour),
      end: addHours(dayStart, MobileEndHour),
    });
  }, [currentDate]);

  const processedDayEvents = useMemo(() => {
    return days.map((day) => {
      const dayEvents = events.filter((event) => {
        if (event.allDay || isMultiDayEvent(event)) return false;

        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        const dayStart = startOfDay(day);
        const dayEnd = addHours(dayStart, 24);
        return (
          isSameDay(day, eventStart) ||
          isSameDay(day, eventEnd) ||
          (eventStart < dayEnd && eventEnd > dayStart)
        );
      });

      const eventGroups = groupEventsByExactTime(dayEvents);
      
      eventGroups.sort((a, b) => {
        const aStart = new Date(a[0]?.start || 0);
        const bStart = new Date(b[0]?.start || 0);
        return aStart.getTime() - bStart.getTime();
      });

      const positionedEvents: PositionedEvent[] = [];
      const dayStart = startOfDay(day);

      const columns: { events: CalendarEvent[]; start: Date; end: Date }[][] = [];
      const groupColumnMapping: Map<CalendarEvent[], number> = new Map();

      eventGroups.forEach((eventGroup) => {
        const firstEvent = eventGroup[0];
        if (!firstEvent) return;
        
        const eventStart = new Date(firstEvent.start);
        const eventEnd = new Date(firstEvent.end);

        const adjustedStart = isSameDay(day, eventStart) ? eventStart : dayStart;
        const adjustedEnd = isSameDay(day, eventEnd) ? eventEnd : addHours(dayStart, 24);

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

        const currentColumn = columns[columnIndex] || [];
        columns[columnIndex] = currentColumn;
        currentColumn.push({ 
          events: eventGroup, 
          start: adjustedStart, 
          end: adjustedEnd 
        });
        groupColumnMapping.set(eventGroup, columnIndex);
      });

      eventGroups.forEach((eventGroup) => {
        const event = eventGroup[0];
        if (!event) return;
        
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        const adjustedStart = isSameDay(day, eventStart) ? eventStart : dayStart;
        const adjustedEnd = isSameDay(day, eventEnd) ? eventEnd : addHours(dayStart, 24);

        const startHour = getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
        const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;

        // Calculate position for full 24-hour day
        const top = startHour * MobileCellHeight;
        const height = (endHour - startHour) * MobileCellHeight;

        const columnIndex = groupColumnMapping.get(eventGroup) ?? 0;

        const overlappingGroups = eventGroups.filter((otherGroup) => {
          if (otherGroup === eventGroup) return false;
          const otherEvent = otherGroup[0];
          if (!otherEvent) return false;
          
          const otherStart = new Date(otherEvent.start);
          const otherEnd = new Date(otherEvent.end);
          
          return areIntervalsOverlapping(
            { start: adjustedStart, end: adjustedEnd },
            { start: otherStart, end: otherEnd },
          );
        });

        const overlappingColumns = overlappingGroups.length + 1;
        
        let width: number;
        let left: number;

        // Mobile-optimized for week view (narrower columns)
        if (overlappingColumns === 1) {
          width = 0.9;
          left = 0.05;
        } else if (overlappingColumns === 2) {
          width = columnIndex === 0 ? 0.85 : 0.7;
          left = columnIndex === 0 ? 0.05 : 0.2;
        } else {
          const baseWidth = 0.65;
          const widthDecrement = 0.08;
          width = Math.max(0.5, baseWidth - (columnIndex * widthDecrement));
          const offsetIncrement = 0.12;
          left = Math.min(columnIndex * offsetIncrement, 0.35);
        }

        positionedEvents.push({
          events: eventGroup,
          top,
          height,
          left,
          width,
          zIndex: 10 + columnIndex,
          dayIndex: 0,
          isGrouped: eventGroup.length > 1,
        });
      });

      return positionedEvents;
    });
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

  // Auto-scroll to current time or 9 AM
  useEffect(() => {
    if (scrollContainerRef.current && !hasScrolledRef.current) {
      const now = new Date();
      const currentHour = getHours(now);
      const currentMinute = getMinutes(now);
      
      let targetHour: number;
      
      if (isSameDay(currentDate, now)) {
        targetHour = currentHour + currentMinute / 60;
      } else {
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

  useEffect(() => {
    hasScrolledRef.current = false;
  }, [currentDate]);

  return (
    <div className="flex flex-col h-full min-h-full">
      {/* Week grid - day strip and all-day events handled by StickyMiniCalendar */}
      <div className="relative">
          {/* Time grid with events */}
          <div className="flex pt-3">
            {/* Time column - all hours shown, time label ON the hour line */}
            <div className="w-11 flex-shrink-0 border-r border-border/50 bg-background">
              {hours.map((hour, index) => (
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

            {/* Days columns */}
            {days.map((day, dayIndex) => (
              <div
                key={day.toString()}
                className={cn(
                  "flex-1 min-w-0 relative border-r border-border/50 last:border-r-0",
                  isToday(day) && "bg-primary/5",
                  !workingDays.includes(day.getDay()) && [0, 6].includes(day.getDay()) && "bg-muted/30"
                )}
              >
                {/* Positioned events */}
                {(processedDayEvents[dayIndex] ?? []).map((positionedEvent, index) => (
                  <div
                    key={positionedEvent.events[0]?.id || index}
                    className="absolute z-10 px-0.5"
                    style={{
                      top: `${positionedEvent.top}px`,
                      height: `${positionedEvent.height}px`,
                      left: `${positionedEvent.left * 100}%`,
                      width: `${positionedEvent.width * 100}%`,
                      zIndex: positionedEvent.zIndex,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="h-full w-full">
                      {positionedEvent.isGrouped ? (
                        <EventDots
                          events={positionedEvent.events}
                          view="week"
                          onClick={(event) => {
                            const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
                            handleEventClick(event, fakeEvent);
                          }}
                          showTime
                          timeFormat={timeFormat}
                          timezone={timezone}
                          style={{ height: '100%', width: '100%' }}
                        />
                      ) : (
                        (() => {
                          const singleEvent = positionedEvent.events[0];
                          if (!singleEvent) return null;
                          return (
                            <DraggableEvent
                              event={singleEvent}
                              view="week"
                              onClick={(e) => handleEventClick(singleEvent, e)}
                              showTime
                              height={positionedEvent.height}
                              timeFormat={timeFormat}
                              timezone={timezone}
                            />
                          );
                        })()
                      )}
                    </div>
                  </div>
                ))}

                {/* Current time indicator */}
                {currentTimeVisible && isToday(day) && (
                  <div
                    className="pointer-events-none absolute right-0 left-0 z-20"
                    style={{ top: `${currentTimePosition}%` }}
                  >
                    <div className="relative flex items-center">
                      <div className="bg-primary absolute -left-0.5 h-2 w-2 rounded-full" />
                      <div className="bg-primary h-[2px] w-full" />
                    </div>
                  </div>
                )}

                {/* Time grid cells */}
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
                            id={`mobile-week-cell-${day.toISOString()}-${quarterHourTime}`}
                            date={day}
                            time={quarterHourTime}
                            className={cn(
                              "absolute w-full",
                              quarter === 0 && "top-0",
                              quarter === 1 && "top-1/4",
                              quarter === 2 && "top-1/2",
                              quarter === 3 && "top-3/4",
                            )}
                            style={{ height: MobileCellHeight / 4 }}
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
    </div>
  );
}
