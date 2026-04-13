"use client";

import React, { useMemo, useEffect, useRef, useState } from "react";
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
import { EventDots } from "./event-dots";
import { isMultiDayEvent } from "./utils";
import { CalendarEvent } from "./types";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { cn } from "../../lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "../ui/drawer";

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
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
  dayIndex: number;
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEvents, setDrawerEvents] = useState<CalendarEvent[]>([]);

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

      dayEvents.sort((a, b) => {
        const aStart = new Date(a.start);
        const bStart = new Date(b.start);
        return aStart.getTime() - bStart.getTime();
      });

      const positionedEvents: PositionedEvent[] = [];
      const dayStart = startOfDay(day);

      const columns: { event: CalendarEvent; start: Date; end: Date }[][] =
        [];
      const eventColumnMapping: Map<CalendarEvent, number> = new Map();

      dayEvents.forEach((event) => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        const adjustedStart = isSameDay(day, eventStart)
          ? eventStart
          : dayStart;
        const adjustedEnd = isSameDay(day, eventEnd)
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
          event: event,
          start: adjustedStart,
          end: adjustedEnd,
        });
        eventColumnMapping.set(event, columnIndex);
      });

      dayEvents.forEach((event) => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        const adjustedStart = isSameDay(day, eventStart)
          ? eventStart
          : dayStart;
        const adjustedEnd = isSameDay(day, eventEnd)
          ? eventEnd
          : addHours(dayStart, 24);

        const startHour =
          getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
        const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;

        // Calculate position for full 24-hour day
        const top = startHour * MobileCellHeight;
        const height = Math.max((endHour - startHour) * MobileCellHeight, 22);

        const columnIndex = eventColumnMapping.get(event) ?? 0;

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

        let width: number;
        let left: number;

        // Mobile-optimized for week view (narrower columns) - GUARANTEE no overflow
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
          left = columnIndex === 0 ? 0 : columnIndex === 1 ? 0.255 : columnIndex === 2 ? 0.51 : 0.765;
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
          zIndex: 10 + columnIndex,
          dayIndex: 0,
        });
      });

      return positionedEvents;
    });
  }, [days, events]);

  const handleEventClick = (
    event: CalendarEvent,
    e: React.MouseEvent,
    dayIndex: number,
  ) => {
    e.stopPropagation();

    const isMobile =
      typeof window !== "undefined" && window.innerWidth < 640;

    if (isMobile) {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      const allDayEvents = processedDayEvents[dayIndex] ?? [];
      const overlapping = allDayEvents
        .filter((pe) => {
          if (!pe.event) return false;
          const otherStart = new Date(pe.event.start);
          const otherEnd = new Date(pe.event.end);
          return areIntervalsOverlapping(
            { start: eventStart, end: eventEnd },
            { start: otherStart, end: otherEnd },
          );
        })
        .map((pe) => pe.event!)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      if (overlapping.length > 1) {
        setDrawerEvents(overlapping);
        setDrawerOpen(true);
      } else {
        onEventSelect(event);
      }
    } else {
      onEventSelect(event);
    }
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
        <div className="flex">
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
              )}
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
                    <div className="h-full w-full px-0.5">
                      {positionedEvent.event && (
                        <DraggableEvent
                          event={positionedEvent.event}
                          view="week"
                          onClick={(e) => handleEventClick(positionedEvent.event, e, dayIndex)}
                          showTime
                          height={positionedEvent.height}
                          timeFormat={timeFormat}
                          timezone={timezone}
                        />
                      )}
                    </div>
                  </div>
                ),
              )}

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

          {/* Mobile event selection drawer */}
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerContent>
              <DrawerTitle className="sr-only">Select Event</DrawerTitle>
              <div className="px-5 py-3 border-b border-border/40">
                <span className="text-base font-semibold">Select Event</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {drawerEvents[0] &&
                    format(new Date(drawerEvents[0].start), "EEEE, MMMM d")}
                </p>
              </div>
              <div className="px-2 py-2 pb-6">
                {drawerEvents.map((event) => {
                  const eventStart = new Date(event.start);
                  const eventEnd = new Date(event.end);
                  return (
                    <button
                      key={event.id}
                      className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/30 transition-colors cursor-pointer"
                      onClick={() => {
                        onEventSelect(event);
                        setDrawerOpen(false);
                        setDrawerEvents([]);
                      }}
                    >
                      <div className="flex items-center justify-center w-6 h-6 shrink-0">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: (event.color as string) || "#3b82f6",
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {event.title || "Untitled Event"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {event.allDay
                            ? "All day"
                            : `${format(eventStart, "h:mm a")} - ${format(eventEnd, "h:mm a")}`}
                          {event.location && ` · ${event.location}`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    </div>
  );
}
