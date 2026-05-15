"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfDay,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  startOfDay,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { useCalendarContext } from "./calendar-context";
import {
  getAllEventsForDay,
  getEventInterval,
  isMultiDayEvent,
  resolveInlineColorValue,
  sortEvents,
  eventOverlapsRange,
} from "./utils";
import { CalendarEvent } from "./types";
import { EventItem } from "./event-item";

interface StickyMiniCalendarProps {
  events?: CalendarEvent[];
  onDisplayMonthChange?: (dateRange: { start: Date; end: Date }) => void;
  onEventSelect?: (event: CalendarEvent) => void;
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  workingDays?: number[];
  timezone?: string;
  showDayStrip?: boolean;
  showAllDayEvents?: boolean;
  className?: string;
}

export function StickyMiniCalendar({
  events = [],
  onDisplayMonthChange,
  onEventSelect,
  weekStartDay = 1,
  workingDays = [1, 2, 3, 4, 5],
  timezone,
  showDayStrip = true,
  showAllDayEvents = false,
  className,
}: StickyMiniCalendarProps) {
  const { currentDate, setCurrentDate } = useCalendarContext();
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Keep mini calendar month in sync only when selected date changes
  useEffect(() => {
    setDisplayMonth(currentDate);
  }, [currentDate]);

  // Measure header height with resize observer
  useEffect(() => {
    const measureHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };

    // Initial measurement
    measureHeight();

    // Use ResizeObserver for accurate tracking
    const resizeObserver = new ResizeObserver(measureHeight);
    if (headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [displayMonth, events, showDayStrip, showAllDayEvents]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(displayMonth);
    const monthEnd = endOfMonth(displayMonth);
    const gridStart = startOfWeek(monthStart, {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    const gridEnd = endOfWeek(monthEnd, {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [displayMonth, weekStartDay]);

  // Current week days for the day strip
  const currentWeekDays = useMemo(() => {
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

  // All-day and multi-day events for the current week
  const allDayEvents = useMemo(() => {
    return events
      .filter((event) => event.allDay || isMultiDayEvent(event))
      .filter((event) => eventOverlapsRange(event, weekStart, weekEnd, "day"));
  }, [events, weekStart, weekEnd]);

  // All-day events for day view (just the current day)
  const dayAllDayEventsList = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    const dayEnd = endOfDay(currentDate);
    return events
      .filter((event) => event.allDay || isMultiDayEvent(event))
      .filter((event) => eventOverlapsRange(event, dayStart, dayEnd, "day"));
  }, [events, currentDate]);

  useEffect(() => {
    const monthStart = startOfWeek(startOfMonth(displayMonth), {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    const monthEnd = endOfWeek(endOfMonth(displayMonth), {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    onDisplayMonthChange?.({ start: monthStart, end: monthEnd });
  }, [displayMonth, onDisplayMonthChange, weekStartDay]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect?.(event);
  };

  return (
    <>
      {/* Fixed position header that stays at top */}
      <div
        ref={headerRef}
        className={cn(
          "fixed top-0 left-0 right-0 z-50",
          "bg-background/95 backdrop-blur-sm",
          className,
        )}
      >
        {/* Compact month navigation header */}
        <div className="flex items-center justify-between px-3 pt-1 pb-0">
          <button
            onClick={() => setDisplayMonth(subMonths(displayMonth, 1))}
            className="p-0.5 rounded-md hover:bg-accent active:bg-accent/80 transition-colors touch-manipulation"
          >
            <ChevronLeft size={12} className="text-muted-foreground" />
          </button>
          <button
            onClick={() => setDisplayMonth(currentDate)}
            className="text-[10px] font-semibold"
          >
            {format(displayMonth, "MMMM yyyy")}
          </button>
          <button
            onClick={() => setDisplayMonth(addMonths(displayMonth, 1))}
            className="p-0.5 rounded-md hover:bg-accent active:bg-accent/80 transition-colors touch-manipulation"
          >
            <ChevronRight size={12} className="text-muted-foreground" />
          </button>
        </div>

        {/* Calendar grid - more compact */}
        <div className="grid grid-cols-7 gap-0 px-2 pb-0.5">
          {days.map((day) => {
            const isSelected = isSameDay(day, currentDate);
            const isCurrentMonth = isSameMonth(day, displayMonth);
            const isCurrentDay = isToday(day);
            const dayEvents = getAllEventsForDay(events, day);
            const hasEvents = dayEvents.length > 0;

            return (
              <button
                key={day.toString()}
                onClick={() => setCurrentDate(day)}
                className={cn(
                  "relative rounded-full text-[9px] font-medium transition-all touch-manipulation",
                  "flex items-center justify-center size-4 mx-auto",
                  !isCurrentMonth && "text-muted-foreground/30",
                  isCurrentMonth &&
                    !isSelected &&
                    "hover:bg-accent/50 text-foreground/80",
                  isSelected && "text-primary font-semibold",
                  isCurrentDay && !isSelected && "text-primary font-semibold",
                )}
              >
                <span className="relative z-10">{format(day, "d")}</span>
                {hasEvents && (
                  <span className="absolute -bottom-0 left-1/2 -translate-x-1/2 flex items-center gap-0.5">
                    {dayEvents.slice(0, 3).map((event, i) => (
                      <span
                        key={`${event.id || "event"}-${i}`}
                        className="size-0.5 rounded-full"
                        style={{
                          backgroundColor: resolveInlineColorValue(event.color),
                        }}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* All-day events section for day view */}
        {showAllDayEvents && dayAllDayEventsList.length > 0 && (
          <div className="px-2 py-1">
            <div className="text-[9px] text-muted-foreground mb-0.5 font-medium">
              All day
            </div>
            <div className="flex flex-wrap gap-1">
              {dayAllDayEventsList.map((event) => {
                const eventStart = new Date(event.start);
                const eventEnd = new Date(event.end);
                const isFirstDay = isSameDay(currentDate, eventStart);
                const isLastDay = isSameDay(currentDate, eventEnd);

                return (
                  <EventItem
                    key={`allday-${event.id}`}
                    onClick={(e) => handleEventClick(event, e)}
                    event={event}
                    view="month"
                    isFirstDay={isFirstDay}
                    isLastDay={isLastDay}
                    timezone={timezone}
                    className="text-[10px]"
                  >
                    <div>{event.title}</div>
                  </EventItem>
                );
              })}
            </div>
          </div>
        )}

        {/* Horizontal day strip with multi-day events - current week (only for week view) */}
        {showDayStrip && (
          <div className="p-0 border-b border-border/50">
            <div className="flex relative">
              {/* Time column spacer - matches timeline width */}
              <div className="w-11 flex-shrink-0" />

              {/* Day columns with all-day/multi-day events */}
              {currentWeekDays.map((day) => {
                const isSelected = isSameDay(day, currentDate);
                const isCurrentDay = isToday(day);
                const dayAllDayEvents = sortEvents(
                  allDayEvents.filter((event) =>
                    eventOverlapsRange(event, day, day, "day"),
                  ),
                );

                return (
                  <div
                    key={day.toString()}
                    className={cn(
                      "flex-1 min-w-0 text-center relative border-r border-border/50 last:border-r-0 pb-1",
                      isSelected && "text-primary",
                      !isSelected && "hover:bg-accent/30 active:bg-accent/50",
                    )}
                    onClick={() => setCurrentDate(day)}
                  >
                    {/* Day header */}
                    <span
                      className={cn(
                        "text-[8px] font-medium uppercase leading-none",
                        isSelected
                          ? "text-primary/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {format(day, "EEE").slice(0, 3)}
                    </span>

                    <span
                      className={cn(
                        "text-[10px] font-semibold leading-tight block",
                        isSelected
                          ? "text-primary"
                          : isCurrentDay
                            ? "text-primary"
                            : "text-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>

                    {/* Today indicator line */}
                    <div
                      className={cn(
                        "h-0.5 rounded-full mx-auto mt-1 transition-all duration-200",
                        isCurrentDay
                          ? "bg-primary w-5"
                          : "bg-transparent w-0",
                      )}
                    />

                    {/* Compact all-day/multi-day events */}
                    {dayAllDayEvents.length > 0 && (
                      <div className="px-0.5 space-y-0.5 mt-0">
                        {dayAllDayEvents.slice(0, 2).map((event) => {
                          const { start: eStartDay, end: eEndDay } =
                            getEventInterval(event, "day");
                          const weekStartDay = startOfDay(weekStart);
                          const weekEndDay = endOfDay(weekEnd);
                          const visibleStart = isBefore(eStartDay, weekStartDay)
                            ? weekStartDay
                            : eStartDay;
                          const visibleEnd = isBefore(weekEndDay, eEndDay)
                            ? weekEndDay
                            : eEndDay;
                          const isFirstSegmentDay = isSameDay(
                            day,
                            visibleStart,
                          );
                          const isLastSegmentDay = isSameDay(day, visibleEnd);
                          const shouldShowTitle = isFirstSegmentDay;

                          return (
                            <EventItem
                              key={`spanning-${event.id}-${day.toString()}`}
                              onClick={(e) => handleEventClick(event, e)}
                              event={event}
                              view="month"
                              isFirstDay={isFirstSegmentDay}
                              isLastDay={isLastSegmentDay}
                              className="text-[8px] py-0 h-[14px]"
                              timezone={timezone}
                            >
                              <div
                                className={cn(
                                  "truncate px-0.5",
                                  !shouldShowTitle && "invisible",
                                )}
                                aria-hidden={!shouldShowTitle}
                              >
                                {event.title}
                              </div>
                            </EventItem>
                          );
                        })}
                        {dayAllDayEvents.length > 2 && (
                          <div className="text-[7px] text-muted-foreground px-1">
                            +{dayAllDayEvents.length - 2}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Spacer element to push content below fixed header */}
      <div
        style={{ height: headerHeight || 60 }}
        className="hidden flex-shrink-0 md:block"
      />
    </>
  );
}
