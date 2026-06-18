"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  formatInUserTimezone,
  isCancelledCalendarEvent,
  isTodayInTimezone,
  resolveTimezone,
  wallClockToUtc,
} from "@workspace/calendar-core";
import {
  addHours,
  areIntervalsOverlapping,
  eachHourOfInterval,
  format,
  getHours,
} from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { EventItem } from "./event-item";
import {
  resolveInlineColorValue,
  getEventSegmentForCalendarDay,
  getTimedTimelineEventsForDay,
} from "./utils";
import { CalendarEvent } from "./types";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { cn } from "../../lib/utils";
import { Drawer, DrawerContent, DrawerShell, DrawerTitle } from "../ui/drawer";
import { CurrentTimeIndicator } from "./current-time-indicator";
import { layoutTimelineEvents } from "./timeline-layout";
import { EndHour, StartHour, WeekCellsHeight } from "./constants";
import {
  getThreeDayCalendarDays,
  getThreeDayTimelineScrollTop,
  groupThreeDayAllDayEventsByDay,
} from "./three-day-view-utils";

const GRID_COLS = "grid-cols-[3rem_repeat(3,minmax(0,1fr))]";

interface MobileThreeDayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  timeFormat?: "12h" | "24h";
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  workingDays?: number[];
  timezone?: string;
  onEventEdit?: (event: CalendarEvent) => void;
  onEventDelete?: (event: CalendarEvent) => void;
  onEventView?: (event: CalendarEvent) => void;
}

export function MobileThreeDayView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
  timeFormat = "24h",
  weekStartDay = 1,
  workingDays = [1, 2, 3, 4, 5],
  timezone,
  onEventEdit,
  onEventDelete,
  onEventView,
}: MobileThreeDayViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEvents, setDrawerEvents] = useState<CalendarEvent[]>([]);
  const resolvedTimezone = resolveTimezone(timezone);

  const days = useMemo(
    () => getThreeDayCalendarDays(currentDate),
    [currentDate],
  );

  const hours = useMemo(() => {
    return eachHourOfInterval({
      start: addHours(new Date(2000, 0, 1), StartHour),
      end: addHours(new Date(2000, 0, 1), EndHour),
    });
  }, []);

  const allDayEventsByDay = useMemo(
    () => groupThreeDayAllDayEventsByDay(events, currentDate, timezone),
    [currentDate, events, timezone],
  );

  const processedDayEvents = useMemo(() => {
    return days.map((day) => {
      const dayEvents = getTimedTimelineEventsForDay(
        events,
        day,
        resolvedTimezone,
      );

      dayEvents.sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );

      return layoutTimelineEvents(dayEvents, day, {
        cellHeight: WeekCellsHeight,
        startHour: StartHour,
        widthStrategy: "simple-no-overflow",
        timezone: resolvedTimezone,
      });
    });
  }, [days, events, resolvedTimezone]);

  const handleEventClick = (
    event: CalendarEvent,
    e: React.MouseEvent,
    dayIndex?: number,
  ) => {
    e.stopPropagation();
    const isMobileScreen =
      typeof window !== "undefined" && window.innerWidth < 640;

    if (isMobileScreen && dayIndex !== undefined) {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const dayEvents = processedDayEvents[dayIndex] ?? [];
      const overlapping = dayEvents
        .filter((pe) => {
          if (!pe.event) return false;
          const oStart = new Date(pe.event.start);
          const oEnd = new Date(pe.event.end);
          return areIntervalsOverlapping(
            { start: eventStart, end: eventEnd },
            { start: oStart, end: oEnd },
          );
        })
        .map((pe) => pe.event!)
        .sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
        );

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

  // Position the timeline before paint so chevron navigation does not jump from midnight.
  useLayoutEffect(() => {
    if (!scrollContainerRef.current) {
      return;
    }

    const scrollPosition = getThreeDayTimelineScrollTop(days, timezone);
    const scrollContainer = scrollContainerRef.current;
    const previousScrollBehavior = scrollContainer.style.scrollBehavior;

    scrollContainer.style.scrollBehavior = "auto";
    scrollContainer.scrollTop = scrollPosition;
    scrollContainer.style.scrollBehavior = previousScrollBehavior;
  }, [currentDate, days, timezone]);

  return (
    <div
      data-slot="three-day-view"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background animate-fade-in"
    >
      {/* Day headers */}
      <div
        className={cn(
          "z-40 grid shrink-0 border-b border-border/40 bg-background/95 backdrop-blur-md",
          GRID_COLS,
        )}
      >
        <div className="flex items-end justify-end pb-1.5 pr-1.5 text-[9px] text-muted-foreground/40">
          {timezone
            ? formatInTimeZone(new Date(), timezone, "zzz")
            : format(new Date(), "zzz")}
        </div>

        {days.map((day) => {
          const isSelected =
            day.getFullYear() === currentDate.getFullYear() &&
            day.getMonth() === currentDate.getMonth() &&
            day.getDate() === currentDate.getDate();
          const today = isTodayInTimezone(day, resolvedTimezone);

          return (
            <div
              key={day.toString()}
              className={cn(
                "min-w-0 border-r border-border/50 py-1.5 text-center last:border-r-0",
                today && "bg-primary/5",
              )}
            >
              <span
                className={cn(
                  "block text-[10px] font-medium uppercase leading-none",
                  isSelected ? "text-primary/70" : "text-muted-foreground",
                )}
              >
                {format(day, "EEE")}
              </span>
              <span
                className={cn(
                  "mt-0.5 block text-sm font-semibold leading-tight",
                  today ? "text-primary" : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>
              <div
                className={cn(
                  "mx-auto mt-1 h-[2px] w-5 rounded-full transition-all",
                  today ? "bg-primary" : "w-0 bg-transparent",
                )}
              />
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      <div
        className={cn(
          "relative z-30 grid shrink-0 items-stretch border-b border-border/40",
          GRID_COLS,
        )}
      >
        <div className="flex h-full flex-col bg-background">
          <div className="flex min-h-[24px] flex-1 flex-col items-center justify-center">
            <span className="text-[9px] leading-none text-muted-foreground/40">
              all-day
            </span>
          </div>
        </div>

        {days.map((day, dayIndex) => {
          const dayEvents = allDayEventsByDay[dayIndex] ?? [];

          return (
            <div
              key={`all-day-${day.toString()}`}
              className="flex h-full flex-col bg-background shadow-sm"
            >
              <div
                className={cn(
                  "flex flex-1 flex-col justify-start gap-0.5 p-0.5",
                  dayEvents.length === 0 && "min-h-[24px]",
                )}
              >
                {dayEvents.map((event) => {
                  const { isFirstDay, isLastDay } = getEventSegmentForCalendarDay(
                    event,
                    day,
                    resolvedTimezone,
                  );
                  const shouldShowTitle = isFirstDay;

                  return (
                    <div key={`allday-${event.id}`} className="w-full">
                      <EventItem
                        onClick={(e) => handleEventClick(event, e)}
                        event={event}
                        view="month"
                        isFirstDay={isFirstDay}
                        isLastDay={isLastDay}
                        className="h-[22px] min-h-[20px] items-center text-[10px]"
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

      {/* Timeline */}
      <div
        ref={scrollContainerRef}
        className={cn("grid min-h-0 flex-1 overflow-y-auto", GRID_COLS)}
        style={{ scrollBehavior: "smooth", scrollbarGutter: "stable" }}
      >
        <div className="border-r border-border/50 bg-background">
          {hours.map((hour, hourIndex) => (
            <div
              key={hourIndex}
              className="relative min-h-[var(--week-cells-height)]"
            >
              <span
                className={cn(
                  "absolute left-0 flex h-6 w-full items-center justify-end bg-background pe-1 text-[9px] text-muted-foreground/70 sm:text-[10px]",
                  hourIndex === 0 ? "top-0" : "-top-3",
                )}
              >
                {format(hour, timeFormat === "24h" ? "HH:mm" : "h a")}
              </span>
            </div>
          ))}
        </div>

        {days.map((day, dayIndex) => (
          <div
            key={day.toString()}
            className={cn(
              "relative min-w-0 border-r border-border/50 last:border-r-0",
              isTodayInTimezone(day, resolvedTimezone) && "bg-primary/5",
            )}
          >
            {(processedDayEvents[dayIndex] ?? []).map((positionedEvent) => (
              <div
                key={positionedEvent.event?.id || dayIndex}
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
                <div className="h-full w-full overflow-hidden px-0.5">
                  {positionedEvent.event && (
                    <DraggableEvent
                      event={positionedEvent.event}
                      view="week"
                      onClick={(e) =>
                        handleEventClick(positionedEvent.event, e, dayIndex)
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
            ))}

            {currentTimeVisible && isTodayInTimezone(day, resolvedTimezone) && (
              <CurrentTimeIndicator position={currentTimePosition} />
            )}

            {hours.map((hour) => {
              const hourValue = getHours(hour);
              return (
                <div
                  key={hour.toString()}
                  className="relative min-h-[var(--week-cells-height)] border-b border-border/50 last:border-b-0"
                >
                  {[0, 1, 2, 3].map((quarter) => {
                    const quarterHourTime = hourValue + quarter * 0.25;
                    return (
                      <DroppableCell
                        key={`${hour.toString()}-${quarter}`}
                        id={`3day-cell-${day.toISOString()}-${quarterHourTime}`}
                        date={day}
                        time={quarterHourTime}
                        className={cn(
                          "absolute w-full",
                          quarter === 0 && "top-0",
                          quarter === 1 && "top-1/4",
                          quarter === 2 && "top-1/2",
                          quarter === 3 && "top-3/4",
                        )}
                        style={{ height: "calc(var(--week-cells-height) / 4)" }}
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

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent
          responsive
          responsiveHeight="70dvh"
          className="overflow-hidden"
        >
          <DrawerTitle className="sr-only">Select Event</DrawerTitle>
          <DrawerShell
            header={
              <div className="border-b border-border/40 px-5 py-3">
                <span className="text-base font-semibold">Select Event</span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {drawerEvents[0] &&
                    formatInUserTimezone(
                      new Date(drawerEvents[0].start),
                      resolvedTimezone,
                      "EEEE, MMMM d",
                    )}
                </p>
              </div>
            }
          >
            <div className="overflow-y-auto px-2 py-2 pb-6">
              {drawerEvents.map((event) => {
                const eventStart = new Date(event.start);
                const eventEnd = new Date(event.end);
                return (
                  <button
                    key={event.id}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/30"
                    onClick={() => {
                      onEventSelect(event);
                      setDrawerOpen(false);
                      setDrawerEvents([]);
                    }}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: resolveInlineColorValue(
                            event.color || "blue",
                          ),
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "truncate text-sm font-medium",
                          isCancelledCalendarEvent(event) &&
                            "line-through opacity-70",
                        )}
                      >
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
          </DrawerShell>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
