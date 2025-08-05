"use client";

import React, { useMemo, useState } from "react";
import { useDidMount } from "rooks";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getWeek,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { EventItem } from "./event-item";
import {
  getAllEventsForDay,
  getEventsForDay,
  getSpanningEventsForDay,
  sortEvents,
} from "./utils";
import { EventGap, EventHeight, DefaultStartHour } from "./constants";
import { CalendarEvent } from "./types";
import { useEventVisibility } from "../../hooks/use-event-visibility";

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  showWeekNumbers?: boolean;
  compactView?: boolean;
  timeFormat?: "12h" | "24h";
  weekStartDay?: number;
  workingDays?: number[];
}

export function MonthView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  showWeekNumbers = false,
  compactView = false,
  timeFormat = "12h",
  weekStartDay = 0,
  workingDays = [1, 2, 3, 4, 5],
}: MonthViewProps) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });
    const calendarEnd = endOfWeek(monthEnd, {
      weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate, weekStartDay]);

  const weekdays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const date = addDays(
        startOfWeek(new Date(), {
          weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        }),
        i,
      );
      return format(date, "EEE");
    });
  }, [weekStartDay]);

  const weeks = useMemo(() => {
    const result = [];
    let week = [];

    for (let i = 0; i < days.length; i++) {
      week.push(days[i]);
      if (week.length === 7 || i === days.length - 1) {
        result.push(week);
        week = [];
      }
    }

    return result;
  }, [days]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const [isMounted, setIsMounted] = useState(false);
  const { contentRef, getVisibleEventCount } = useEventVisibility({
    eventHeight: compactView ? Math.round(EventHeight * 0.75) : EventHeight,
    eventGap: compactView ? Math.round(EventGap * 0.5) : EventGap,
  });

  useDidMount(() => {
    setIsMounted(true);
  });

  return (
    <div data-slot="month-view" className="contents animate-fade-in">
      <div
        className={`border-border/70 grid ${showWeekNumbers ? "grid-cols-8" : "grid-cols-7"} border-y uppercase`}
      >
        {showWeekNumbers && (
          <div className="text-muted-foreground/70 py-2 text-center text-xs font-medium">
            W
          </div>
        )}
        {weekdays.map((day, index) => (
          <div
            key={day}
            className="text-muted-foreground/70 py-2 text-center text-xs animate-slide-in"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr">
        {weeks.map((week, weekIndex) => (
          <div
            key={`week-${weekIndex}`}
            className={`grid ${showWeekNumbers ? "grid-cols-8" : "grid-cols-7"} [&:last-child>*]:border-b-0 animate-slide-in`}
            style={{ animationDelay: `${weekIndex * 0.1}s` }}
          >
            {showWeekNumbers && (
              <div className="border-border/70 border-r border-b bg-muted/10 flex items-center justify-center">
                <span className="text-muted-foreground/60 text-xs font-medium">
                  {week[0] ? getWeek(week[0]) : ""}
                </span>
              </div>
            )}
            {week.map((day, dayIndex) => {
              if (!day) return null; // Skip if day is undefined

              const dayEvents = getEventsForDay(events, day);
              const spanningEvents = getSpanningEventsForDay(events, day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const cellId = `month-cell-${day.toISOString()}`;
              const allDayEvents = [...spanningEvents, ...dayEvents];
              const allEvents = getAllEventsForDay(events, day);

              const isReferenceCell = weekIndex === 0 && dayIndex === 0;
              const visibleCount = isMounted
                ? getVisibleEventCount(allDayEvents.length)
                : undefined;
              const hasMore =
                visibleCount !== undefined &&
                allDayEvents.length > visibleCount;
              const remainingCount = hasMore
                ? allDayEvents.length - visibleCount
                : 0;

              return (
                <div
                  key={day.toString()}
                  className={`group border-border/70 data-outside-cell:bg-muted/25 data-outside-cell:text-muted-foreground/70 border-r border-b last:border-r-0 transition-all duration-200 hover:bg-accent/5 hover:shadow-sm ${
                    workingDays.includes(day.getDay()) && isCurrentMonth
                      ? "bg-[var(--calendar-workday)]"
                      : !workingDays.includes(day.getDay()) &&
                          [0, 6].includes(day.getDay()) &&
                          isCurrentMonth
                        ? "bg-[var(--calendar-weekend)]"
                        : ""
                  }`}
                  data-today={isToday(day) || undefined}
                  data-outside-cell={!isCurrentMonth || undefined}
                >
                  <DroppableCell
                    id={cellId}
                    date={day}
                    onClick={() => {
                      const startTime = new Date(day);
                      startTime.setHours(DefaultStartHour, 0, 0);
                      onEventCreate(startTime);
                    }}
                  >
                    <div className="group-data-today:bg-[var(--calendar-accent-bg)] group-data-today:text-[var(--calendar-accent)] group-data-today:font-semibold mt-1 inline-flex size-6 items-center justify-center rounded-full text-sm transition-all duration-200 hover:scale-110 hover:bg-accent/10 group-data-today:animate-pulse">
                      {format(day, "d")}
                    </div>
                    <div
                      ref={isReferenceCell ? contentRef : null}
                      className={`${
                        compactView
                          ? "min-h-[calc((var(--event-height)+var(--event-gap))*3)] sm:min-h-[calc((var(--event-height)+var(--event-gap))*4)] lg:min-h-[calc((var(--event-height)+var(--event-gap))*5)]"
                          : "min-h-[calc((var(--event-height)+var(--event-gap))*2)] sm:min-h-[calc((var(--event-height)+var(--event-gap))*3)] lg:min-h-[calc((var(--event-height)+var(--event-gap))*4)]"
                      }`}
                    >
                      {sortEvents(allDayEvents).map((event, index) => {
                        const eventStart = new Date(event.start);
                        const eventEnd = new Date(event.end);
                        const isFirstDay = isSameDay(day, eventStart);
                        const isLastDay = isSameDay(day, eventEnd);

                        const isHidden =
                          isMounted && visibleCount && index >= visibleCount;

                        if (!visibleCount) return null;

                        if (!isFirstDay) {
                          return (
                            <div
                              key={`spanning-${event.id}-${day.toISOString().slice(0, 10)}`}
                              className="aria-hidden:hidden"
                              aria-hidden={isHidden ? "true" : undefined}
                            >
                              <EventItem
                                onClick={(e) => handleEventClick(event, e)}
                                event={event}
                                view="month"
                                isFirstDay={isFirstDay}
                                isLastDay={isLastDay}
                                timeFormat={timeFormat}
                              >
                                <div className="invisible" aria-hidden={true}>
                                  {!event.allDay && (
                                    <span>
                                      {format(
                                        new Date(event.start),
                                        "h:mm",
                                      )}{" "}
                                    </span>
                                  )}
                                  {event.title}
                                </div>
                              </EventItem>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={event.id}
                            className="aria-hidden:hidden animate-scale-in"
                            aria-hidden={isHidden ? "true" : undefined}
                            style={{ animationDelay: `${index * 0.05}s` }}
                          >
                            <DraggableEvent
                              event={event}
                              view="month"
                              onClick={(e) => handleEventClick(event, e)}
                              isFirstDay={isFirstDay}
                              isLastDay={isLastDay}
                              timeFormat={timeFormat}
                            />
                          </div>
                        );
                      })}

                      {hasMore && (
                        <Popover modal>
                          <PopoverTrigger asChild>
                            <button
                              className="focus-visible:border-ring focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:scale-[1.02] mt-[var(--event-gap)] flex h-[var(--event-height)] w-full items-center overflow-hidden px-1 text-left text-[10px] backdrop-blur-md transition-all duration-200 outline-none select-none focus-visible:ring-[3px] sm:px-2 sm:text-xs animate-fade-in"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span>
                                + {remainingCount}{" "}
                                <span className="max-sm:sr-only">more</span>
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="center"
                            className="max-w-52 p-3 animate-scale-in"
                            style={
                              {
                                "--event-height": `${EventHeight}px`,
                              } as React.CSSProperties
                            }
                          >
                            <div className="space-y-2">
                              <div className="text-sm font-medium">
                                {format(day, "EEE d")}
                              </div>
                              <div className="space-y-1">
                                {sortEvents(allEvents).map((event) => {
                                  const eventStart = new Date(event.start);
                                  const eventEnd = new Date(event.end);
                                  const isFirstDay = isSameDay(day, eventStart);
                                  const isLastDay = isSameDay(day, eventEnd);

                                  return (
                                    <EventItem
                                      key={event.id}
                                      onClick={(e) =>
                                        handleEventClick(event, e)
                                      }
                                      event={event}
                                      view="month"
                                      isFirstDay={isFirstDay}
                                      isLastDay={isLastDay}
                                      timeFormat={timeFormat}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </DroppableCell>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
