"use client";

import React, { useMemo, useState } from "react";
import { isCancelledCalendarEvent } from "@workspace/calendar-core";
import {
  addDays,
  addHours,
  areIntervalsOverlapping,
  eachHourOfInterval,
  format,
  getHours,
  isSameDay,
  isToday,
  startOfDay,
  subDays,
} from "date-fns";

import { DraggableEvent } from "./draggable-event";
import { DroppableCell } from "./droppable-cell";
import { isMultiDayEvent } from "./utils";
import { CalendarEvent } from "./types";
import { useCurrentTimeIndicator } from "../../hooks/use-current-time-indicator";
import { cn } from "../../lib/utils";
import { Drawer, DrawerContent, DrawerShell, DrawerTitle } from "../ui/drawer";
import { resolveInlineColorValue } from "./utils";
import { CurrentTimeIndicator } from "./current-time-indicator";
import { layoutTimelineEvents } from "./timeline-layout";

const CELL_HEIGHT = 60;

interface MobileThreeDayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
  timeFormat?: "12h" | "24h";
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  workingDays?: number[];
  timezone?: string;
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
}: MobileThreeDayViewProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEvents, setDrawerEvents] = useState<CalendarEvent[]>([]);

  // Show yesterday, today, tomorrow centered on currentDate
  const days = useMemo(
    () => [
      subDays(currentDate, 1),
      new Date(currentDate),
      addDays(currentDate, 1),
    ],
    [currentDate],
  );

  const hours = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    return eachHourOfInterval({
      start: addHours(dayStart, 0),
      end: addHours(dayStart, 23),
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

      dayEvents.sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );

      return layoutTimelineEvents(dayEvents, day, {
        cellHeight: CELL_HEIGHT,
        widthStrategy: "simple-no-overflow",
      });
    });
  }, [days, events]);

  const allDayEvents = useMemo(() => {
    const firstDay = days[0];
    const lastDay = days[2];
    if (!firstDay || !lastDay) return [];
    const rangeStart = startOfDay(firstDay);
    const rangeEnd = addHours(startOfDay(lastDay), 24);
    return events.filter(
      (event) =>
        (event.allDay || isMultiDayEvent(event)) &&
        new Date(event.start) < rangeEnd &&
        new Date(event.end) > rangeStart,
    );
  }, [days, events]);

  const handleEventClick = (
    event: CalendarEvent,
    e: React.MouseEvent,
    dayIndex: number,
  ) => {
    e.stopPropagation();
    const isMobileScreen =
      typeof window !== "undefined" && window.innerWidth < 640;

    if (isMobileScreen) {
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

  return (
    <div className="flex flex-col">
      {/* Day header strip */}
      <div className="relative">
        <div className="flex">
          {/* Time column spacer - matches timeline width */}
          <div className="w-11 flex-shrink-0 border-r border-border/50 bg-background" />

          {/* Day columns headers */}
          {days.map((day, dayIndex) => {
            const isSelected = isSameDay(day, currentDate);
            const today = isToday(day);
            const dayAllDay = allDayEvents.filter((event) => {
              const eStart = new Date(event.start);
              const eEnd = new Date(event.end);
              const dStart = startOfDay(day);
              const dEnd = addHours(dStart, 24);
              return eStart < dEnd && eEnd > dStart;
            });

            return (
              <div
                key={day.toString()}
                className={cn(
                  "flex-1 min-w-0 text-center py-1.5 border-r border-border/50 last:border-r-0",
                  today && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "text-[10px] font-medium uppercase block leading-none",
                    isSelected ? "text-primary/70" : "text-muted-foreground",
                  )}
                >
                  {format(day, "EEE")}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold leading-tight block mt-0.5",
                    today ? "text-primary" : "text-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
                <div
                  className={cn(
                    "h-[2px] rounded-full mx-auto mt-1 w-5 transition-all",
                    today ? "bg-primary" : "bg-transparent w-0",
                  )}
                />
                {/* All-day event indicators */}
                {dayAllDay.length > 0 && (
                  <div className="flex justify-center gap-0.5 mt-0.5">
                    {dayAllDay.slice(0, 3).map((ev, i) => (
                      <div
                        key={i}
                        className="w-1 h-1 rounded-full"
                        style={{
                          backgroundColor: resolveInlineColorValue(
                            ev.color || "blue",
                          ),
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline grid - no own scroll container, parent handles scrolling */}
      <div className="relative">
        <div className="flex">
          {/* Time column */}
          <div className="w-11 flex-shrink-0 border-r border-border/50 bg-background">
            {hours.map((hour) => (
              <div
                key={hour.toString()}
                className="relative"
                style={{ height: CELL_HEIGHT }}
              >
                <span className="absolute top-0 left-0.5 -translate-y-1/2 bg-background px-0.5 text-[9px] font-medium text-muted-foreground">
                  {format(hour, timeFormat === "24h" ? "HH:00" : "h:00a")}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIndex) => (
            <div
              key={day.toString()}
              className={cn(
                "flex-1 min-w-0 relative border-r border-border/50 last:border-r-0",
                isToday(day) && "bg-primary/5",
              )}
            >
              {/* Positioned events */}
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
                      />
                    )}
                  </div>
                </div>
              ))}

              {/* Current time indicator */}
              {currentTimeVisible && isToday(day) && (
                <CurrentTimeIndicator position={currentTimePosition} />
              )}

              {/* Time grid cells */}
              {hours.map((hour) => {
                const hourValue = getHours(hour);
                return (
                  <div
                    key={hour.toString()}
                    className="relative border-b border-border/50"
                    style={{ height: CELL_HEIGHT }}
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
                          style={{ height: CELL_HEIGHT / 4 }}
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

      {/* Event selection drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent
          responsive
          responsiveHeight="70dvh"
          className="overflow-hidden"
        >
          <DrawerTitle className="sr-only">Select Event</DrawerTitle>
          <DrawerShell
            header={
              <div className="px-5 py-3 border-b border-border/40">
                <span className="text-base font-semibold">Select Event</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {drawerEvents[0] &&
                    format(new Date(drawerEvents[0].start), "EEEE, MMMM d")}
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
                          backgroundColor: resolveInlineColorValue(
                            event.color || "blue",
                          ),
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn(
                          "text-sm font-medium truncate",
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
